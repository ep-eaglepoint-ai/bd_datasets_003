// filename: network.js
/**
 * Retries a fetch request with exponential backoff.
 * @param {string} url
 * @param {object} options
 * @param {number} retries - Max retries (default 3)
 * @param {number} backoff - Initial backoff ms (default 300)
 */
export async function fetchWithRetry(
  url,
  options = {},
  retries = 3,
  backoff = 300,
) {
  try {
    const res = await fetch(url, options);
    if (res.ok) return res.json();
    if (retries > 0 && res.status >= 500) {
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw new Error(`Request failed: ${res.status}`);
  } catch (err) {
    if (retries > 0 && !err.message.includes("4")) {
      // Simple check
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
}
