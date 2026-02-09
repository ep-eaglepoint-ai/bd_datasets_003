const path = require('path');
const os = require('os');
const fs = require('fs/promises');

const { scanMockFiles, scanTextContent, shannonEntropy, scanPath } = require('../repository_after/src/scanner');

describe('SecretSniffer', () => {
  // dynamic build so the resulting runtime values still match our regexes.
  const AWS_PREFIX = ['A', 'K', 'I', 'A'].join('');
  const STRIPE_PREFIX = ['s', 'k', '_', 'l', 'i', 'v', 'e', '_'].join('');
  const AWS_KEY_FAKE = AWS_PREFIX + 'ABCDEFGHIJKLMNOP';
  const STRIPE_KEY_FAKE = STRIPE_PREFIX + 'NOTAREALKEY0123456789ABCDEF';

  test('Regex accuracy: detects AWS key with correct line number', async () => {
    const content = [
      'const a = 1;',
      `const AWS_KEY = "${AWS_KEY_FAKE}";`,
      'console.log(AWS_KEY);'
    ].join('\n');

    const findings = scanTextContent(content, 'config.js', { entropyThreshold: 4.5 });

    const aws = findings.find((f) => f.type === 'aws-access-key-id');
    expect(aws).toBeTruthy();
    expect(aws.method).toBe('regex');
    expect(aws.line).toBe(2);
    expect(aws.file).toBe('config.js');
  });

  test('Entropy sensitivity: flags high-entropy random-looking token', async () => {
    // Alphanumeric base64-ish blob (no symbols) to match candidate filter.
    const token = 'QWERTYUIOPASDFGHJKLZXCVBNM1234567890qwertyuiopasdfghjkl';
    expect(token.length).toBeGreaterThan(20);
    expect(shannonEntropy(token)).toBeGreaterThanOrEqual(4.5);

    const mockFiles = {
      'env_file': `DB_PASS="${token}"\n`
    };

    const report = await scanMockFiles(mockFiles, { entropyThreshold: 4.5 });
    expect(report.findings.some((f) => f.method === 'entropy')).toBe(true);
    const f = report.findings.find((x) => x.method === 'entropy');
    expect(f.file).toBe('env_file');
    expect(f.line).toBe(1);
  });

  test('False positive suppression: UUID and long URL are not flagged by entropy', async () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const url = 'https://example.com/some/really/long/path?with=query&and=values';

    const content = [
      `id = "${uuid}"`,
      `homepage = "${url}"`
    ].join('\n');

    const findings = scanTextContent(content, 'README.md', { entropyThreshold: 4.5 });
    const entropyFindings = findings.filter((f) => f.method === 'entropy');
    expect(entropyFindings.length).toBe(0);
  });

  test('Regex coverage: detects GitHub PAT, Stripe secret key, and SSH private key header', async () => {
    const content = [
      'const token = "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012345";',
      // Fake Stripe-shaped token (matches regex, not usable)
      `const stripe = "${STRIPE_KEY_FAKE}";`,
      '-----BEGIN OPENSSH PRIVATE KEY-----'
    ].join('\n');

    const findings = scanTextContent(content, 'secrets.txt', { entropyThreshold: 4.5 });

    const gh = findings.find((f) => f.type === 'github-pat');
    expect(gh).toBeTruthy();
    expect(gh.line).toBe(1);

    const stripe = findings.find((f) => f.type === 'stripe-secret-key');
    expect(stripe).toBeTruthy();
    expect(stripe.line).toBe(2);

    const ssh = findings.find((f) => f.type === 'ssh-private-key');
    expect(ssh).toBeTruthy();
    expect(ssh.line).toBe(3);
  });

  test('Recursive walker: scans nested directories, skips binary files, and respects .snifferignore', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'secretsniffer-'));
    try {
      await fs.mkdir(path.join(root, 'src', 'nested'), { recursive: true });

      // Ignore one specific file via .snifferignore
      await fs.writeFile(path.join(root, '.snifferignore'), 'src/ignored.txt\n');

      // This should be scanned and detected
      await fs.writeFile(
        path.join(root, 'src', 'nested', 'config.js'),
        `const AWS_KEY = "${AWS_KEY_FAKE}";\n`
      );

      // This contains a secret but should be ignored by .snifferignore
      await fs.writeFile(
        path.join(root, 'src', 'ignored.txt'),
        `const STRIPE = "${STRIPE_KEY_FAKE}";\n`
      );

      // This uses a binary extension and should be skipped
      await fs.writeFile(path.join(root, 'data.bin'), Buffer.from([0x00, 0xff, 0x12]));

      const report = await scanPath(root, { entropyThreshold: 4.5, concurrency: 2, ignoreFile: '.snifferignore' });
      expect(report.ok).toBe(true);

      const filesWithFindings = new Set(report.findings.map((f) => f.file));

      // Nested file should be scanned
      const nestedConfig = path.join(root, 'src', 'nested', 'config.js');
      expect(filesWithFindings.has(nestedConfig)).toBe(true);

      // Ignored file should not appear
      const ignored = path.join(root, 'src', 'ignored.txt');
      expect(filesWithFindings.has(ignored)).toBe(false);

      // And ensure we got the AWS hit we expect
      const aws = report.findings.find((f) => f.type === 'aws-access-key-id');
      expect(aws).toBeTruthy();
      expect(aws.file).toBe(nestedConfig);
      expect(aws.line).toBe(1);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
