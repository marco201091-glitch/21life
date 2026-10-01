import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

export function verifyBackupChecksums(checksums, files) {
  const seen = new Set();
  for (const line of checksums.split(/\r?\n/).filter((entry) => entry.trim())) {
    const match = /^([a-f0-9]{64}) [ *]([^\r\n]+)$/i.exec(line);
    if (!match) throw new Error('Invalid checksum entry.');
    const [, expected, name] = match;
    if (!/^[a-z0-9_.-]+$/i.test(name) || name === '.' || name === '..') throw new Error('Unsafe checksum filename.');
    if (seen.has(name)) throw new Error('Duplicate checksum filename.');
    seen.add(name);
    if (!Object.hasOwn(files, name)) throw new Error('Missing backup file.');
    if (createHash('sha256').update(files[name]).digest('hex') !== expected.toLowerCase()) throw new Error('Backup checksum mismatch.');
  }
  if (seen.size !== Object.keys(files).length) throw new Error('Missing checksum for backup file.');
}

export function readBackupPackage(input) {
  if (!input) throw new Error('Provide a backup .dump file or off-site package directory.');
  const path = resolve(input);
  const offsite = statSync(path).isDirectory();
  const dumpPath = offsite ? join(path, 'database.dump') : path;
  if (!dumpPath.endsWith('.dump')) throw new Error('Backup must be a .dump file or off-site package directory.');
  const storagePath = offsite ? join(path, 'storage.tar.gz') : dumpPath.replace(/\.dump$/, '.storage.tar.gz');
  const bytes = readFileSync(dumpPath);
  const storageBytes = readFileSync(storagePath);
  const files = { [basename(dumpPath)]: bytes, [basename(storagePath)]: storageBytes };
  let manifest = null;
  if (offsite) {
    manifest = JSON.parse(readFileSync(join(dirname(dumpPath), 'manifest.json'), 'utf8'));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid backup manifest.');
    verifyBackupChecksums(readFileSync(join(path, 'SHA256SUMS'), 'utf8'), files);
  } else {
    verifyBackupChecksums([dumpPath, storagePath].map((file) => readFileSync(`${file}.sha256`, 'utf8').trim()).join('\n'), files);
  }
  if (bytes.length < 1024 || bytes.subarray(0, 5).toString('ascii') !== 'PGDMP') throw new Error('Backup is not a PostgreSQL custom-format dump.');
  return { dumpPath, storagePath, bytes, storageBytes, manifest, format: offsite ? 'offsite-package' : 'legacy-dev' };
}
