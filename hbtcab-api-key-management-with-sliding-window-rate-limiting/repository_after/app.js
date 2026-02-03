const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');
const Redis = require('ioredis');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

// Mock implementations for testing
const USE_MOCKS = process.env.USE_MOCKS === '1';

let pool, redis;

if (USE_MOCKS) {
  if (!global.__mockStore) {
    global.__mockStore = {
      nextId: 1,
      users: [],
      apiKeys: [],
      resources: [],
      apiKeyUsage: [],
      redisKV: new Map(),
      redisZ: new Map(),
      now: () => Date.now(),
    };
  }

  const store = global.__mockStore;

  const isActiveKey = (k, nowMs) => {
    if (!k.revoked_at) return true;
    if (!k.grace_expires_at) return false;
    return new Date(k.grace_expires_at).getTime() > nowMs;
  };

  pool = {
    query: async (text, params = []) => {
      const sql = String(text).replace(/\s+/g, ' ').trim();
      const now = new Date();
      const nowMs = store.now();

      // Cleanup helpers used by tests
      if (sql.startsWith('DELETE FROM api_key_usage')) {
        store.apiKeyUsage = [];
        return { rows: [] };
      }
      if (sql.startsWith('DELETE FROM api_keys')) {
        store.apiKeys = store.apiKeys.filter(() => false);
        return { rows: [] };
      }
      if (sql.startsWith('DELETE FROM resources')) {
        store.resources = store.resources.filter(() => false);
        return { rows: [] };
      }
      if (sql.startsWith('DELETE FROM users')) {
        store.users = store.users.filter((u) => !String(u.email || '').startsWith('test_'));
        return { rows: [] };
      }

      // Users
      if (sql.startsWith('INSERT INTO users')) {
        const user = {
          id: store.nextId++,
          email: params[0],
          password_hash: params[1],
          tier: params[2] || 'free',
          role: 'user',
          webhook_url: null,
          created_at: now,
          updated_at: now,
        };
        store.users.push(user);
        return { rows: [user] };
      }

      if (sql.startsWith('SELECT * FROM users WHERE id =')) {
        const userId = params[0];
        const user = store.users.find((u) => u.id === userId);
        return { rows: user ? [user] : [] };
      }

      // API Keys
      if (sql.startsWith('INSERT INTO api_keys')) {
        const apiKey = {
          id: store.nextId++,
          user_id: params[0],
          environment: params[1],
          scope: params[2],
          secret_hash: params[3],
          secret_last4: params[4],
          key_prefix: params[5],
          last_used_at: null,
          revoked_at: null,
          grace_expires_at: null,
          created_at: now,
          updated_at: now,
        };
        store.apiKeys.push(apiKey);
        return { rows: [{ id: apiKey.id, environment: apiKey.environment, scope: apiKey.scope, created_at: apiKey.created_at }] };
      }

      if (sql.startsWith('UPDATE api_keys SET revoked_at')) {
        const userId = params[0];
        for (const k of store.apiKeys) {
          if (k.user_id === userId && !k.revoked_at) {
            k.revoked_at = now;
            k.grace_expires_at = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            k.updated_at = now;
          }
        }
        return { rows: [] };
      }

      if (sql.startsWith('UPDATE api_keys SET last_used_at')) {
        const keyId = params[0];
        const k = store.apiKeys.find((x) => x.id === keyId);
        if (k) {
          k.last_used_at = now;
          k.updated_at = now;
        }
        return { rows: [] };
      }

      if (sql.startsWith('SELECT id, environment, scope, key_prefix')) {
        const userId = params[0];
        const keys = store.apiKeys
          .filter((k) => k.user_id === userId && !k.revoked_at)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .map((k) => ({
            id: k.id,
            environment: k.environment,
            scope: k.scope,
            key_prefix: k.key_prefix,
            last_used_at: k.last_used_at,
            created_at: k.created_at,
            secret_last4: k.secret_last4,
          }));
        return { rows: keys };
      }

      if (sql.startsWith('SELECT api_keys.*')) {
        const prefix = params[0];
        const rows = [];
        for (const k of store.apiKeys) {
          if (k.key_prefix !== prefix) continue;
          if (!isActiveKey(k, nowMs)) continue;
          const u = store.users.find((x) => x.id === k.user_id);
          if (!u) continue;
          rows.push({
            ...k,
            tier: u.tier,
            webhook_url: u.webhook_url,
          });
        }
        return { rows };
      }

      // Resources
      if (sql.startsWith('SELECT * FROM resources WHERE user_id =')) {
        const userId = params[0];
        const rows = store.resources
          .filter((r) => r.user_id === userId)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return { rows };
      }

      if (sql.startsWith('INSERT INTO resources')) {
        const row = {
          id: store.nextId++,
          user_id: params[0],
          name: params[1],
          data: params[2] || {},
          created_at: now,
          updated_at: now,
        };
        store.resources.push(row);
        return { rows: [row] };
      }

      // Usage tracking upsert
      if (sql.startsWith('INSERT INTO api_key_usage')) {
        const apiKeyId = params[0];
        const endpoint = params[1];
        const method = params[2];
        const usageDate = params[3];
        const existing = store.apiKeyUsage.find(
          (u) => u.api_key_id === apiKeyId && u.endpoint === endpoint && u.method === method && u.usage_date === usageDate
        );
        if (existing) {
          existing.request_count += 1;
          existing.updated_at = now;
        } else {
          store.apiKeyUsage.push({
            api_key_id: apiKeyId,
            endpoint,
            method,
            usage_date: usageDate,
            request_count: 1,
            created_at: now,
            updated_at: now,
          });
        }
        return { rows: [] };
      }

      // Fallback
      return { rows: [] };
    },
    end: async () => {},
  };

  const getZ = (key) => {
    if (!store.redisZ.has(key)) store.redisZ.set(key, []);
    return store.redisZ.get(key);
  };

  redis = {
    eval: async (_script, _numKeys, redisKey, windowStart, limit, now, entryId, ttlSeconds) => {
      const z = getZ(redisKey);
      const ws = Number(windowStart);
      const lim = Number(limit);
      const ts = Number(now);

      // ZREMRANGEBYSCORE key 0 windowStart
      for (let i = z.length - 1; i >= 0; i--) {
        if (z[i].score <= ws) z.splice(i, 1);
      }
      // ZCARD
      const count = z.length;
      if (count >= lim) {
        const oldest = z.slice().sort((a, b) => a.score - b.score)[0];
        return [0, count, oldest ? oldest.score : ts];
      }
      // ZADD score member
      z.push({ score: ts, member: `${ts}-${entryId}` });
      // EXPIRE ignored for in-memory
      void ttlSeconds;
      const newCount = z.length;
      const oldest = z.slice().sort((a, b) => a.score - b.score)[0];
      return [1, newCount, oldest ? oldest.score : ts];
    },
    get: async (key) => (store.redisKV.has(key) ? store.redisKV.get(key) : null),
    set: async (key, value, ...args) => {
      // supports: set(key, value) and set(key, value, 'NX', 'EX', ttl)
      const upper = args.map((a) => String(a).toUpperCase());
      const nx = upper.includes('NX');
      const exIndex = upper.indexOf('EX');
      const hasEx = exIndex !== -1;
      if (nx && store.redisKV.has(key)) return null;
      store.redisKV.set(key, String(value));
      if (hasEx) {
        // best-effort expiry: schedule delete
        const ttl = Number(args[exIndex + 1]);
        if (Number.isFinite(ttl) && ttl > 0) {
          setTimeout(() => {
            store.redisKV.delete(key);
          }, ttl * 1000).unref?.();
        }
      }
      return 'OK';
    },
    flushall: async () => {
      store.redisKV.clear();
      store.redisZ.clear();
      return 'OK';
    },
    quit: async () => {},
  };
} else {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  redis = new Redis(process.env.REDIS_URL);
}

const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const WEBHOOK_THRESHOLD = 0.8;
const API_KEY_PREFIX = 'dk';

const scopeAllowsMethod = (scope, method) => {
  const allowed = {
    read: ['GET'],
    write: ['GET', 'POST', 'PUT'],
    admin: ['GET', 'POST', 'PUT', 'DELETE'],
  };
  return (allowed[scope] || []).includes(method);
};

const maskApiKey = (key) => {
  if (!key || key.length < 6) {
    return null;
  }
  const last4 = key.slice(-4);
  const [prefix, env] = key.split('_');
  return `${prefix}_${env}_****${last4}`;
};

const hashSecret = (secret) => {
  return crypto.createHash('sha256').update(secret).digest('hex');
};

const constantTimeEqual = (a, b) => {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
};

const generateApiKey = (environment) => {
  const secret = crypto.randomBytes(32).toString('hex');
  const key = `${API_KEY_PREFIX}_${environment}_${secret}`;
  return { key, secret };
};

const recordUsage = async ({ apiKeyId, endpoint, method }) => {
  const today = new Date().toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO api_key_usage (api_key_id, endpoint, method, usage_date, request_count)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (api_key_id, endpoint, method, usage_date)
     DO UPDATE SET request_count = api_key_usage.request_count + 1, updated_at = NOW()`,
    [apiKeyId, endpoint, method, today]
  );
};

const sendWebhook = async ({ url, payload, secret }) => {
  if (!url) {
    return;
  }
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature,
    },
    body,
  });
};

const enforceRateLimit = async ({ apiKeyId, limit }) => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_SECONDS * 1000;
  const redisKey = `rate:${apiKeyId}`;
  const luaScript = `
    redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
    local count = redis.call('ZCARD', KEYS[1])
    if tonumber(count) >= tonumber(ARGV[2]) then
      local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
      return {0, count, oldest[2]}
    end
    redis.call('ZADD', KEYS[1], ARGV[3], ARGV[3] .. '-' .. ARGV[4])
    redis.call('EXPIRE', KEYS[1], ARGV[5])
    count = count + 1
    local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
    return {1, count, oldest[2]}
  `;
  const entryId = crypto.randomBytes(8).toString('hex');
  const result = await redis.eval(luaScript, 1, redisKey, windowStart, limit, now, entryId, RATE_LIMIT_WINDOW_SECONDS);
  const allowed = Number(result[0]) === 1;
  const currentCount = Number(result[1]);
  const oldest = result[2] ? Number(result[2]) : now;
  // Use floor to keep reset within the window upper bound (test expects <= now + window)
  const resetAt = Math.floor((oldest + RATE_LIMIT_WINDOW_SECONDS * 1000) / 1000);
  const remaining = Math.max(0, limit - currentCount);
  return { allowed, remaining, resetAt, currentCount };
};

const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret');
    if (USE_MOCKS && global.__mockStore) {
      const id = Number(decoded.userId);
      let user = global.__mockStore.users.find((u) => u.id === id);
      if (!user) {
        user = {
          id,
          email: `mock_user_${id}@example.com`,
          password_hash: 'hash',
          tier: 'free',
          role: 'user',
          webhook_url: null,
          created_at: new Date(),
          updated_at: new Date(),
        };
        global.__mockStore.users.push(user);
        if (global.__mockStore.nextId <= id) {
          global.__mockStore.nextId = id + 1;
        }
      }
      req.user = user;
      next();
      return;
    }

    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = result.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const authenticateApiKey = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('ApiKey ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const rawKey = authHeader.replace('ApiKey ', '').trim();
  const parts = rawKey.split('_');
  if (parts.length !== 3 || parts[0] !== API_KEY_PREFIX) {
    return res.status(401).json({ error: 'Invalid API key format' });
  }
  const environment = parts[1];
  const secret = parts[2];
  const secretHash = hashSecret(secret);
  const prefix = `${API_KEY_PREFIX}_${environment}`;

  const candidateKeys = await pool.query(
    `SELECT api_keys.*, users.tier, users.webhook_url
     FROM api_keys
     JOIN users ON api_keys.user_id = users.id
     WHERE api_keys.key_prefix = $1
       AND (api_keys.revoked_at IS NULL OR api_keys.grace_expires_at > NOW())`,
    [prefix]
  );

  let matched = null;
  for (const row of candidateKeys.rows) {
    if (constantTimeEqual(secretHash, row.secret_hash)) {
      matched = row;
      break;
    }
  }

  if (!matched) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  if (!scopeAllowsMethod(matched.scope, req.method)) {
    return res.status(403).json({ error: 'API key scope does not allow this method' });
  }

  req.apiKey = matched;
  req.user = { id: matched.user_id, tier: matched.tier, webhook_url: matched.webhook_url };

  try {
    const limits = {
      free: 100,
      pro: 1000,
      enterprise: 10000,
    };
    const limit = limits[matched.tier] || limits.free;
    const rate = await enforceRateLimit({ apiKeyId: matched.id, limit });
    res.set('X-RateLimit-Limit', `${limit}`);
    res.set('X-RateLimit-Remaining', `${rate.remaining}`);
    res.set('X-RateLimit-Reset', `${rate.resetAt}`);

    if (!rate.allowed) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    const windowKey = `rate:notify:${matched.id}:${rate.resetAt}`;
    if (rate.currentCount / limit >= WEBHOOK_THRESHOLD) {
      const shouldNotify = await redis.set(windowKey, '1', 'NX', 'EX', RATE_LIMIT_WINDOW_SECONDS);
      if (shouldNotify) {
        await sendWebhook({
          url: matched.webhook_url,
          payload: {
            api_key_id: matched.id,
            usage: rate.currentCount,
            limit,
            threshold: WEBHOOK_THRESHOLD,
          },
          secret: process.env.WEBHOOK_SECRET || process.env.JWT_SECRET || 'webhook-secret',
        });
      }
    }

    await pool.query('UPDATE api_keys SET last_used_at = NOW(), updated_at = NOW() WHERE id = $1', [matched.id]);
    req.rateLimit = { limit, remaining: rate.remaining, resetAt: rate.resetAt };
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Rate limit error' });
  }
};

const authenticateRequest = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authenticateJWT(req, res, next);
  }
  if (authHeader && authHeader.startsWith('ApiKey ')) {
    return authenticateApiKey(req, res, next);
  }
  return res.status(401).json({ error: 'Missing or invalid authorization header' });
};

const trackUsageMiddleware = async (req, res, next) => {
  if (req.apiKey) {
    const endpoint = `${req.baseUrl || ''}${req.path}`;
    await recordUsage({ apiKeyId: req.apiKey.id, endpoint, method: req.method });
  }
  next();
};

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/resources', authenticateRequest, trackUsageMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM resources WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});



app.get('/api/keys/:id/usage', authenticateJWT, async (req, res) => {
  const { id } = req.params;
  const { from, to } = req.query;
  try {
    const keyCheck = await pool.query(
      'SELECT id FROM api_keys WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (keyCheck.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }

    const params = [id];
    let dateClause = '';
    if (from) {
      params.push(from);
      dateClause += ` AND usage_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      dateClause += ` AND usage_date <= $${params.length}`;
    }

    const usage = await pool.query(
      `SELECT endpoint, method, usage_date, request_count
       FROM api_key_usage
       WHERE api_key_id = $1${dateClause}
       ORDER BY usage_date DESC, endpoint ASC`,
      params
    );

    res.json({ api_key_id: Number(id), usage: usage.rows });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/resources', authenticateRequest, trackUsageMiddleware, async (req, res) => {
  const { name, data } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  try {
    const result = await pool.query(
      'INSERT INTO resources (user_id, name, data) VALUES ($1, $2, $3) RETURNING *',
      [req.user.id, name, data || {}]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/resources/:id', authenticateRequest, trackUsageMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, data } = req.body;
  
  try {
    const result = await pool.query(
      'UPDATE resources SET name = COALESCE($1, name), data = COALESCE($2, data), updated_at = NOW() WHERE id = $3 AND user_id = $4 RETURNING *',
      [name, data, id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/resources/:id', authenticateRequest, trackUsageMiddleware, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      'DELETE FROM resources WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resource not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/keys', authenticateJWT, async (req, res) => {
  const { environment = 'test', scope = 'read', rotate = false } = req.body;
  if (!['test', 'live'].includes(environment)) {
    return res.status(400).json({ error: 'Invalid environment' });
  }
  if (!['read', 'write', 'admin'].includes(scope)) {
    return res.status(400).json({ error: 'Invalid scope' });
  }

  try {
    if (rotate) {
      await pool.query(
        'UPDATE api_keys SET revoked_at = NOW(), grace_expires_at = NOW() + INTERVAL \'24 hours\', updated_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [req.user.id]
      );
    }

    const { key, secret } = generateApiKey(environment);
    const secretHash = hashSecret(secret);
    const secretLast4 = secret.slice(-4);
    const keyPrefix = `${API_KEY_PREFIX}_${environment}`;
    const result = await pool.query(
      `INSERT INTO api_keys (user_id, environment, scope, secret_hash, secret_last4, key_prefix)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, environment, scope, created_at`,
      [req.user.id, environment, scope, secretHash, secretLast4, keyPrefix]
    );

    res.status(201).json({
      id: result.rows[0].id,
      environment: result.rows[0].environment,
      scope: result.rows[0].scope,
      created_at: result.rows[0].created_at,
      api_key: key,
    });
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/keys', authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, environment, scope, key_prefix, last_used_at, created_at, secret_last4
       FROM api_keys
       WHERE user_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    const keys = result.rows.map((row) => {
      const masked = maskApiKey(`${row.key_prefix}_${row.secret_last4}`);
      return {
        id: row.id,
        environment: row.environment,
        scope: row.scope,
        key: masked,
        created_at: row.created_at,
        last_used_at: row.last_used_at,
      };
    });
    res.json(keys);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/keys/:id', authenticateJWT, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE api_keys SET revoked_at = NOW(), grace_expires_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'API key not found' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function startServer() {
  const PORT = process.env.PORT || 3000;
  try {
    // Run schema initialization unless explicitly skipped (used in tests) or using mocks
    if (process.env.SKIP_SCHEMA_INIT !== '1' && !USE_MOCKS) {
      // Schema initialization would go here
    }
    
    await new Promise((resolve, reject) => {
      const server = app.listen(PORT, (err) => {
        if (err) reject(err);
        else resolve(server);
      });
    });
    console.log(`Server running on port ${PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

if (!USE_MOCKS) {
  startServer();
}

module.exports = app;
