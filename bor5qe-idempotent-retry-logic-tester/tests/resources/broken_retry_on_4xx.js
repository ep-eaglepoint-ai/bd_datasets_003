export async function fetchWithRetry(url, options, retries = 3, backoff = 300) {
  const res = await fetch(url, options);
  if (res.ok) return res.json();
  if (retries > 0) {
    // Retries on all errors, even 400
    await new Promise(r => setTimeout(r, backoff));
    return fetchWithRetry(url, options, retries - 1, backoff * 2);
  }
  throw new Error(`Request failed: ${res.status}`);
}
