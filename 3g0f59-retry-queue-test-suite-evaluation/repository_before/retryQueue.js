// retryQueue.js

var _tasks = new Map(); // taskId -> entry
var _stats = {
  enqueued: 0,
  attempts: 0,
  completed: 0,
  cancelled: 0,
  failed: 0,
  lastError: null
};

function resetInternalForTestsOnly() {
  _tasks.clear();
  _stats.enqueued = 0;
  _stats.attempts = 0;
  _stats.completed = 0;
  _stats.cancelled = 0;
  _stats.failed = 0;
  _stats.lastError = null;
}

function stats() {
  return {
    enqueued: _stats.enqueued,
    attempts: _stats.attempts,
    completed: _stats.completed,
    cancelled: _stats.cancelled,
    failed: _stats.failed,
    lastError: _stats.lastError
  };
}

function enqueue(taskId, fn, options) {
  options = options || {};
  var retries = typeof options.retries === 'number' ? options.retries : 2;
  var backoffMs = typeof options.backoffMs === 'number' ? options.backoffMs : 10;

  if (typeof taskId !== 'string' || taskId.length === 0) {
    _stats.failed++;
    _stats.lastError = 'BAD_TASK_ID';
    return Promise.resolve({ ok: false, code: 'BAD_TASK_ID' });
  }

  if (typeof fn !== 'function') {
    _stats.failed++;
    _stats.lastError = 'BAD_FN';
    return Promise.resolve({ ok: false, code: 'BAD_FN' });
  }

  var existing = _tasks.get(taskId);
  if (existing && !existing.done) return existing.promise;

  _stats.enqueued++;

  var entry = {
    taskId,
    fn,
    retriesLeft: retries,
    backoffMs,
    timer: null,
    done: false,
    cancelled: false,
    promise: null,
    resolve: null
  };

  entry.promise = new Promise(function (resolve) {
    entry.resolve = resolve;
  });

  _tasks.set(taskId, entry);
  attempt(entry);

  return entry.promise;
}

function cancel(taskId) {
  var entry = _tasks.get(taskId);
  if (!entry || entry.done) return false;

  entry.cancelled = true;
  if (entry.timer) clearTimeout(entry.timer);
  _stats.cancelled++;

  Promise.resolve().then(function () {
    if (!entry.done) {
      entry.done = true;
      entry.resolve({ ok: false, code: 'CANCELLED' });
    }
  });

  return true;
}

function attempt(entry) {
  if (entry.cancelled) return;

  _stats.attempts++;

  var result;
  try {
    result = entry.fn(entry.taskId);
  } catch (e) {
    result = Promise.reject(e);
  }

  Promise.resolve(result).then(
    function (value) {
      Promise.resolve().then(function () {
        if (entry.cancelled) return;
        entry.done = true;
        _stats.completed++;
        entry.resolve({ ok: true, value });
      });
    },
    function () {
      if (entry.cancelled) return;

      _stats.lastError = 'TASK_FAILED';

      if (entry.retriesLeft <= 0) {
        entry.done = true;
        _stats.failed++;
        entry.resolve({ ok: false, code: 'TASK_FAILED_FINAL' });
        return;
      }

      entry.retriesLeft--;
      entry.timer = setTimeout(function () {
        entry.timer = null;
        attempt(entry);
      }, entry.backoffMs);
    }
  );
}

module.exports = {
  enqueue,
  cancel,
  stats,
  resetInternalForTestsOnly
};
