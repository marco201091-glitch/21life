import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// Match the command and working directory used by Expo's Gradle settings plugin.
const config = JSON.parse(execFileSync(process.execPath, [
  '--no-warnings', '--eval', "require('expo/bin/autolinking')",
  'expo-modules-autolinking', 'resolve', '--platform', 'android', '--json',
], { cwd: resolve(root, 'expo/android'), encoding: 'utf8' }));
const patterns = config.configuration?.buildFromSource?.map((pattern) => new RegExp(`^(?:${pattern})$`)) ?? [];
const projects = config.modules.flatMap((module) => module.projects ?? []);
if (!projects.length || projects.some((project) => !patterns.some((pattern) => pattern.test(project.name)))) {
  throw new Error('Every resolved Expo Android project must be forced to build from source.');
}
if (projects.some((project) => project.aarProjects?.length)) {
  throw new Error('F-Droid must not link precompiled Expo AAR projects.');
}
console.log(`F-Droid autolinking: ${projects.length} Expo Android projects build from source.`);
