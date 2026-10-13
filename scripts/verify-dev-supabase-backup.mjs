import { basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readBackupPackage } from './backup-package.mjs';

const { dumpPath, storagePath, format } = readBackupPackage(process.argv[2]);
const listing = spawnSync('tar', ['-tzf', storagePath], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (listing.error) throw listing.error;
if (listing.status !== 0) throw new Error('Storage archive verification failed.');
console.log(`${basename(dumpPath)}: ${format} checksums and dump format OK; storage archive OK.`);
