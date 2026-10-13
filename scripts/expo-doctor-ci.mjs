// A doctor failure, including patch drift, requires an explicit SDK review.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const index = process.argv.indexOf('--from-file');
if (index !== -1) {
  const file = process.argv[index + 1];
  if (!file) throw Error('--from-file requires a path');
  process.stdout.write(readFileSync(file, 'utf8'));
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, [resolve('node_modules/expo-doctor/build/index.js')], {
    encoding: 'utf8', timeout: 120000, env: { ...process.env, CI: '1' },
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.error) console.error('expo-doctor could not run:', result.error.message);
  process.exitCode = result.status === 0 && !result.error ? 0 : 1;
}
