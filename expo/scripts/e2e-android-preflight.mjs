import { spawnSync } from 'node:child_process';
import { runMaestro } from './maestro-command.mjs';

function command(name, args) {
  const options = { encoding: 'utf8', windowsHide: true };
  const result = name === 'maestro' ? runMaestro(args, options) : spawnSync(name, args, options);
  if (result.error) throw new Error(`${name} is required: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${name} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout;
}

command('maestro', ['--version']);
const devices = command('adb', ['devices']);
const connected = devices.split(/\r?\n/).filter((line) => /\tdevice$/.test(line)).map((line) => line.split('\t')[0]);
if (connected.length !== 1) throw new Error('Connect exactly one unlocked dedicated Android device or emulator before running the device smoke test.');
const installed = command('adb', ['-s', connected[0], 'shell', 'pm', 'path', 'com.phyrexianarena.app.dev']);
if (!installed.trim().startsWith('package:')) throw new Error('Install the isolated com.phyrexianarena.app.dev package before running Maestro.');

console.log('Android device E2E preflight OK.');
