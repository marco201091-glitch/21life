const MIGRATION_FILE = /^(\d{14})_([a-z0-9_]+)\.sql$/i;
const HASH = /^[a-f0-9]{64}$/;

function splitSqlStatements(sql) {
  const statements = [];
  let start = 0;
  let index = 0;
  let state = 'normal';
  let blockDepth = 0;
  let dollarQuote = '';
  let escapeString = false;

  while (index < sql.length) {
    const char = sql[index];
    const next = sql[index + 1];

    if (state === 'line-comment') {
      if (char === '\n') state = 'normal';
      index += 1;
      continue;
    }
    if (state === 'block-comment') {
      if (char === '/' && next === '*') {
        blockDepth += 1;
        index += 2;
      } else if (char === '*' && next === '/') {
        blockDepth -= 1;
        index += 2;
        if (blockDepth === 0) state = 'normal';
      } else {
        index += 1;
      }
      continue;
    }
    if (state === 'single-quote') {
      if (char === "'" && next === "'") index += 2;
      else if (char === '\\' && escapeString) index += 2;
      else if (char === "'") {
        state = 'normal';
        index += 1;
      } else index += 1;
      continue;
    }
    if (state === 'double-quote') {
      if (char === '"' && next === '"') index += 2;
      else if (char === '"') {
        state = 'normal';
        index += 1;
      } else index += 1;
      continue;
    }
    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarQuote, index)) {
        index += dollarQuote.length;
        state = 'normal';
        dollarQuote = '';
      } else index += 1;
      continue;
    }

    if (char === '-' && next === '-') {
      state = 'line-comment';
      index += 2;
    } else if (char === '/' && next === '*') {
      state = 'block-comment';
      blockDepth = 1;
      index += 2;
    } else if (char === "'") {
      escapeString = index > 0 && /[eE]/.test(sql[index - 1]) && (index < 2 || !/[a-z0-9_$]/i.test(sql[index - 2]));
      state = 'single-quote';
      index += 1;
    } else if (char === '"') {
      state = 'double-quote';
      index += 1;
    } else if (char === '$') {
      const delimiter = /^\$(?:[a-z_][a-z0-9_]*)?\$/i.exec(sql.slice(index))?.[0];
      if (delimiter) {
        state = 'dollar-quote';
        dollarQuote = delimiter;
        index += delimiter.length;
      } else index += 1;
    } else if (char === '\\') {
      throw new Error('Migration contains a psql command; refusing to run it.');
    } else if (char === ';') {
      statements.push({ start, end: index + 1, text: sql.slice(start, index + 1) });
      start = index + 1;
      index += 1;
    } else index += 1;
  }

  if (state !== 'normal' && state !== 'line-comment') {
    throw new Error('Migration SQL has an unterminated quote or comment.');
  }
  if (sql.slice(start).trim()) statements.push({ start, end: sql.length, text: sql.slice(start) });
  return statements;
}

function executablePrefix(statement) {
  let index = 0;
  while (index < statement.length) {
    if (/\s/.test(statement[index])) { index += 1; continue; }
    if (statement.startsWith('--', index)) {
      const end = statement.indexOf('\n', index + 2);
      index = end < 0 ? statement.length : end + 1;
      continue;
    }
    if (statement.startsWith('/*', index)) {
      let depth = 1;
      index += 2;
      while (index < statement.length && depth > 0) {
        if (statement.startsWith('/*', index)) { depth += 1; index += 2; }
        else if (statement.startsWith('*/', index)) { depth -= 1; index += 2; }
        else index += 1;
      }
      continue;
    }
    break;
  }
  return statement.slice(index).trim();
}

function isOnlyBoundaryCommand(statement, command) {
  const plain = executablePrefix(statement);
  return new RegExp('^' + command + '\\s*;?$', 'i').test(plain);
}

function hasExecutableText(statement) {
  return executablePrefix(statement).length > 0;
}

export function stripOuterTransaction(sql) {
  if (typeof sql !== 'string' || !sql.trim()) throw new Error('Migration SQL is empty.');
  const statements = splitSqlStatements(sql);
  const firstIndex = statements.findIndex(({ text }) => hasExecutableText(text));
  const first = firstIndex >= 0 ? statements[firstIndex] : null;
  const last = [...statements].reverse().find(({ text }) => hasExecutableText(text));
  const hasBegin = first ? isOnlyBoundaryCommand(first.text, 'BEGIN') : false;
  const hasCommit = last ? isOnlyBoundaryCommand(last.text, 'COMMIT') : false;

  if (hasBegin !== hasCommit) {
    throw new Error('Migration has an unmatched outer BEGIN/COMMIT; refusing to run it.');
  }
  const interior = !hasBegin ? sql : statements
    .filter((statement) => statement !== first && statement !== last)
    .map((statement) => statement.text)
    .join('');
  const remaining = splitSqlStatements(interior);
  if (remaining.some(({ text }) => /^(?:BEGIN|COMMIT|END|ROLLBACK|ABORT|START|PREPARE|SAVEPOINT|RELEASE)\b/i.test(executablePrefix(text)))) {
    throw new Error('Migration contains a nested transaction boundary; refusing to run it.');
  }
  return interior;
}

export function getMigrationMetadata(filename, sql) {
  const match = MIGRATION_FILE.exec(filename);
  if (!match) throw new Error('Migration filename must be <14-digit-version>_<name>.sql.');
  stripOuterTransaction(sql);
  return { version: match[1], name: match[2] };
}

export function buildMigrationScript({ version, name, checksum, sql, lockTimeoutMs = 15_000 }) {
  if (!/^\d{14}$/.test(version) || !/^[a-z0-9_]+$/i.test(name)) throw new Error('Invalid migration metadata.');
  if (!HASH.test(checksum)) throw new Error('Migration checksum must be a lowercase SHA-256 hex digest.');
  if (!Number.isSafeInteger(lockTimeoutMs) || lockTimeoutMs < 1 || lockTimeoutMs > 120_000) {
    throw new Error('Migration lock timeout must be between 1 and 120000 milliseconds.');
  }

  const migrationSql = stripOuterTransaction(sql);
  return [
    'SET lock_timeout = ' + "'" + lockTimeoutMs + 'ms' + "';",
    'SELECT pg_advisory_xact_lock(2101212101, 1);',
    'CREATE SCHEMA IF NOT EXISTS app_private;',
    'REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;',
    'CREATE TABLE IF NOT EXISTS app_private.schema_migrations (',
    '  version text PRIMARY KEY,',
    '  name text NOT NULL,',
    '  checksum text NOT NULL CHECK (checksum ~ ' + "'^[a-f0-9]{64}$'" + '),',
    '  applied_at timestamptz NOT NULL DEFAULT now(),',
    '  applied_by text NOT NULL DEFAULT current_user',
    ');',
    'REVOKE ALL ON app_private.schema_migrations FROM PUBLIC, anon, authenticated;',
    'SELECT EXISTS (SELECT 1 FROM app_private.schema_migrations WHERE version = ' + "'" + version + "'" + ') AS migration_exists,',
    '  COALESCE((SELECT checksum = ' + "'" + checksum + "'" + ' FROM app_private.schema_migrations WHERE version = ' + "'" + version + "'" + '), false) AS migration_matches \\gset',
    '\\if :migration_exists',
    '\\if :migration_matches',
    '\\echo Migration ' + version + ' already applied; checksum verified.',
    '\\quit',
    '\\else',
    'SELECT 1 / 0; -- checksum differs; refuse before migration SQL',
    '\\endif',
    '\\endif',
    migrationSql,
    'INSERT INTO app_private.schema_migrations(version, name, checksum)',
    'VALUES (' + "'" + version + "', '" + name + "', '" + checksum + "'" + ');',
    '',
  ].join('\n');
}
