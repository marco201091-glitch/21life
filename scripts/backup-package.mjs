import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, lstatSync } from 'node:fs';
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
  let recoveryVersion = 1;
  if (offsite) {
    manifest = JSON.parse(readFileSync(join(dirname(dumpPath), 'manifest.json'), 'utf8'));
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid backup manifest.');
    if (manifest.schemaVersion !== undefined && ![1, 2].includes(manifest.schemaVersion)) throw new Error('Unsupported backup schema version.');
    recoveryVersion = manifest.schemaVersion ?? 1;
    const optional = ['recovery-roles.sql', 'recovery-privileges.sql'];
    if (recoveryVersion === 2) {
      const required = ['database.dump', 'storage.tar.gz', ...optional, 'recovery-config.tar.gz', 'recovery-inventory.json'];
      if (!Array.isArray(manifest.requiredFiles) || manifest.requiredFiles.length !== required.length
        || required.some(name => !manifest.requiredFiles.includes(name))) throw new Error('Incomplete recovery manifest.');
      for (const name of required) {
        if (!lstatSync(join(path, name)).isFile()) throw new Error('Missing or linked recovery file.');
        files[name] = readFileSync(join(path, name));
      }
      files['manifest.json'] = readFileSync(join(path, 'manifest.json'));
    } else {
      for (const name of optional) {
        if (existsSync(join(path, name))) files[name] = readFileSync(join(path, name));
      }
    }
    verifyBackupChecksums(readFileSync(join(path, 'SHA256SUMS'), 'utf8'), files);
  } else {
    verifyBackupChecksums([dumpPath, storagePath].map((file) => readFileSync(`${file}.sha256`, 'utf8').trim()).join('\n'), files);
  }
  if (bytes.length < 1024 || bytes.subarray(0, 5).toString('ascii') !== 'PGDMP') throw new Error('Backup is not a PostgreSQL custom-format dump.');
  return { dumpPath, storagePath, bytes, storageBytes, manifest, recoveryVersion,
    completeRecoveryPackage: recoveryVersion === 2,
    format: offsite ? 'offsite-package' : 'legacy-dev' };
}
