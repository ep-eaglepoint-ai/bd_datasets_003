import { Hono } from 'hono';
import NodeCache from 'node-cache';
import { config } from '../config';

const app = new Hono();
const cache = new NodeCache({ stdTTL: 60 * 10 });

type UnsplashSearchResult = {
  id: string;
  alt_description: string | null;
  urls: { small: string; regular: string; full: string };
  user?: { name?: string; username?: string };
};

type UnsplashSearchResponse = {
  results?: UnsplashSearchResult[];
};

app.get('/search', async (c) => {
  const query = (c.req.query('query') || '').trim();
  const perPage = Math.min(parseInt(c.req.query('perPage') || '12', 10) || 12, 30);

  if (!query) {
    return c.json({ success: true, data: [] });
  }

  const accessKey = config.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return c.json({ success: false, error: 'Unsplash access key not configured' }, 500);
  }

  const cacheKey = `unsplash:search:${query}:${perPage}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return c.json({ success: true, data: cached });
  }

  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('orientation', 'landscape');

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Client-ID ${accessKey}`,
      'Accept-Version': 'v1',
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    return c.json({ success: false, error: 'Unsplash request failed', details: text }, 502);
  }

  const json = (await resp.json()) as UnsplashSearchResponse;
  const results: UnsplashSearchResult[] = Array.isArray(json.results) ? json.results : [];

  const data = results.map((r) => ({
    id: r.id,
    alt: r.alt_description,
    small: r.urls.small,
    regular: r.urls.regular,
    full: r.urls.full,
    credit: r.user?.name || r.user?.username || undefined,
  }));

  cache.set(cacheKey, data);
  return c.json({ success: true, data });
});

export default app;
