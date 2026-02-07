function createPromisePool(concurrency) {
  let active = 0;
  /** @type {Array<() => void>} */
  const queue = [];

  const runNext = () => {
    if (active >= concurrency) return;
    const next = queue.shift();
    if (!next) return;
    active++;
    next();
  };

  const add = (taskFn) =>
    new Promise((resolve, reject) => {
      queue.push(async () => {
        try {
          const val = await taskFn();
          resolve(val);
        } catch (e) {
          reject(e);
        } finally {
          active--;
          runNext();
        }
      });
      runNext();
    });

  return { add };
}

module.exports = { createPromisePool };
