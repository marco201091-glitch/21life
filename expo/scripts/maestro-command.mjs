import { spawnSync } from 'node:child_process';

export function runMaestro(args, options = {}) {
  if (process.platform !== 'win32') return spawnSync('maestro', args, options);
  // Windows distributions ship maestro.bat. No credentials are arguments.
  if (args.some((arg) => /["%&|<>^!\r\n]/.test(arg))) throw new Error('Unsupported characters in Maestro command arguments.');
  return spawnSync(`maestro ${args.map((arg) => `"${arg}"`).join(' ')}`, { ...options, shell: true });
}
