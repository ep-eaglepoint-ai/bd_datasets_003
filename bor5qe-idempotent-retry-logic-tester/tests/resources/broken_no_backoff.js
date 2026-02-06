export async function fetchWithRetry(url, options, retries = 3, backoff = 300) {
  const res = await fetch(url, options);
  if (res.ok) return res.json();
  if (retries > 0 && res.status >= 500) {
    // Wait always 300ms instead of doubling
    await new Promise(r => setTimeout(r, 300));
    return fetchWithRetry(url, options, retries - 1, 300);
  }
  throw new Error(`Request failed: ${res.status}`);
}
