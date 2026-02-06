export async function fetchWithRetry(url, options = {}, retries = 3, backoff = 300) {
  const res = await fetch(url, options);
  
  if (!res.ok && retries > 0 && res.status >= 500) {
    await new Promise((r) => setTimeout(r, backoff));
    // BUG: We are changing the URL and removing headers in the retry!
    return fetchWithRetry(url + "/wrong-path", {}, retries - 1, backoff * 2);
  }
  
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}