function redactSecret(secret) {
  if (typeof secret !== 'string') secret = String(secret);
  const s = secret;
  if (s.length <= 8) return '*'.repeat(s.length);
  const head = s.slice(0, 4);
  const tail = s.slice(-4);
  return `${head}...${tail}`;
}

module.exports = { redactSecret };
