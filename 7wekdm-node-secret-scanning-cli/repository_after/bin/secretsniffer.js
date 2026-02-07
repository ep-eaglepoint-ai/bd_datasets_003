#!/usr/bin/env node

const path = require('path');
const { scanPath } = require('../src/scanner');

function printHelp() {
  process.stdout.write(
    [
      'SecretSniffer - scan a directory for likely secrets',
      '',
      'Usage:',
      '  secretsniffer [path] [--entropy <threshold>] [--concurrency <n>] [--ignore <file>]',
      '',
      'Output:',
      '  JSON report to stdout',
      ''
    ].join('\n')
  );
}

function parseArgs(argv) {
  const args = { targetPath: '.', entropyThreshold: 4.5, concurrency: 8, ignoreFile: '.snifferignore' };
  const rest = [];

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') {
      args.help = true;
    } else if (a === '--entropy') {
      args.entropyThreshold = Number(argv[++i]);
    } else if (a === '--concurrency') {
      args.concurrency = Number(argv[++i]);
    } else if (a === '--ignore') {
      args.ignoreFile = argv[++i];
    } else {
      rest.push(a);
    }
  }

  if (rest[0]) args.targetPath = rest[0];
  return args;
}

(async () => {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const report = await scanPath(path.resolve(process.cwd(), args.targetPath), {
    entropyThreshold: args.entropyThreshold,
    concurrency: args.concurrency,
    ignoreFile: args.ignoreFile
  });

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
})().catch((err) => {
  const out = {
    ok: false,
    error: { message: err && err.message ? err.message : String(err) }
  };
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exitCode = 2;
});
