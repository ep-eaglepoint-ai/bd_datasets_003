// Signature-based secret patterns

const SIGNATURES = [
  {
    id: 'aws-access-key-id',
    method: 'regex',
    // AKIA/ASIA are most common; allow other common prefixes to reduce false negatives.
    regex: /\b(A3T[A-Z0-9]|AKIA|ASIA|AGPA|AIDA|ANPA|ANVA|AROA|AIPA)[A-Z0-9]{16}\b/g
  },
  {
    id: 'github-pat',
    method: 'regex',
    // Classic tokens and fine-grained tokens
    regex: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255}\b/g
  },
  {
    id: 'stripe-secret-key',
    method: 'regex',
    regex: /\bsk_(live|test)_[A-Za-z0-9]{16,}\b/g
  },
  {
    id: 'ssh-private-key',
    method: 'regex',
    // Matches PEM boundaries; secret is the header line (we'll report header to avoid dumping key material)
    regex: /-----BEGIN (?:OPENSSH|RSA|DSA|EC|PGP) PRIVATE KEY-----/g
  }
];

module.exports = { SIGNATURES };
