const path = require('path');

const { scanMockFiles, scanTextContent, shannonEntropy } = require('../repository_after/src/scanner');

describe('SecretSniffer', () => {
  test('Regex accuracy: detects AWS key with correct line number', async () => {
    const content = [
      'const a = 1;',
      'const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";',
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
});
