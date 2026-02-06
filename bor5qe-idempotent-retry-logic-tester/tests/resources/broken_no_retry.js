export async function fetchWithRetry(url, options, retries = 3, backoff = 300) {
  const res = await fetch(url, options);
  if (res.ok) return res.json();
  throw new Error(`Request failed: ${res.status}`);
}
