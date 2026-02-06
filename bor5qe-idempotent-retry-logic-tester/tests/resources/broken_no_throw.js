export async function fetchWithRetry(url, options, retries = 3, backoff = 300) {
  try {
    const res = await fetch(url, options);
    if (res.ok) return res.json();
    if (retries > 0 && res.status >= 500) {
      await new Promise(r => setTimeout(r, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    return {};
  } catch (err) {
    return {}
  }
}
