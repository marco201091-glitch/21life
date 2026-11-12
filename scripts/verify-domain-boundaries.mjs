import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export function verifyDomainBoundaries(root, ts) {
  const files = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = resolve(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (file.endsWith('.ts')) files.push(file);
    }
  }
  visit(root);
  const graph = new Map();
  const errors = [];
  for (const file of files) {
    const edges = [];
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    function walk(node) {
      let specifier;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
      if (ts.isImportTypeNode(node)) specifier = node.argument.literal;
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require')) {
        specifier = node.arguments[0];
        if (!specifier || !ts.isStringLiteral(specifier)) errors.push(`${file}: non-static module access`);
      }
      if (specifier && ts.isStringLiteral(specifier)) {
        const value = specifier.text;
        const target = resolve(dirname(file), value.replace(/\.js$/, '') + (value.endsWith('.ts') ? '' : '.ts'));
        if (!value.startsWith('.') || relative(root, target).startsWith('..') || !files.includes(target)) {
          errors.push(`${file}: dependency outside pure domain: ${value}`);
        } else edges.push(target);
      }
      if (ts.isIdentifier(node) && ['window', 'document', 'localStorage', 'sessionStorage', 'process', 'fetch'].includes(node.text)) {
        errors.push(`${file}: platform global ${node.text}`);
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
    graph.set(file, edges);
  }
  const visited = new Set();
  const active = new Set();
  function check(file) {
    if (active.has(file)) { errors.push(`${file}: circular domain dependency`); return; }
    if (visited.has(file)) return;
    active.add(file);
    for (const next of graph.get(file) ?? []) check(next);
    active.delete(file);
    visited.add(file);
  }
  for (const file of files) check(file);
  return [...new Set(errors)];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ts = createRequire(resolve(process.cwd(), 'package.json'))('typescript');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../packages/domain');
  const errors = verifyDomainBoundaries(root, ts);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log('Pure domain boundaries and import graph verified.');
}
