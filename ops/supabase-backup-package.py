"""Versioned recovery package producer shared by scheduled backup and Dev drill.

Run as the operator able to read Compose bind mounts. Output is PRIVATE: it
contains service credentials and must only leave the host through encrypted backup.
No service is stopped or reconfigured; database snapshot transaction is read-only.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time


def command(args, *, data=None, cwd=None, timeout=180):
    result = subprocess.run(args, input=data, capture_output=True, cwd=cwd, timeout=timeout)
    if result.returncode:
        # stderr may include connection URLs: do not propagate it to public logs.
        raise RuntimeError('Recovery package step failed: ' + args[0])
    return result.stdout


def read_source_sql(db_container, query):
    """Catalog reads are server-enforced read-only, even if future SQL is wrong."""
    return command(['docker', 'exec', '-i', db_container, 'psql', '-X', '-qAt',
                    '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'],
                   data=('BEGIN READ ONLY;\n' + query + '\nROLLBACK;').encode()).decode()


def produce_package(output, compose_file, project, db_container, storage_container):
    output = Path(output).resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError('Recovery output must be empty')
    output.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(output, 0o700)
    compose_file = Path(compose_file).resolve(strict=True)
    config = json.loads(command(['docker', 'compose', '-p', project, '-f', str(compose_file),
                                 'config', '--format', 'json'], cwd=compose_file.parent))
    assert config['services']['db']['container_name'] == db_container, 'DB target mismatch'
    assert config['services']['storage']['container_name'] == storage_container, 'Storage target mismatch'
    assert config['services']['storage']['environment']['STORAGE_BACKEND'] == 'file'
    inspected = json.loads(command(['docker', 'inspect', db_container, storage_container]))
    for item in inspected:
        assert item['Config']['Labels']['com.docker.compose.project'] == project, 'Compose label mismatch'
    storage_source = next(Path(m['Source']).resolve(strict=True) for m in inspected[1]['Mounts']
                          if m['Destination'] == '/var/lib/storage' and m['Type'] == 'bind')

    def sql(query):
        return read_source_sql(db_container, query)

    # Same schema rows as the DB snapshot; caller can verify before generating any
    # new logins/writes on the restored clone.
    counts_query = """SELECT jsonb_object_agg(table_schema || '.' || table_name,
      ((xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I',
      table_schema, table_name), false, true, '')))[1]::text)::bigint)
      FROM information_schema.tables WHERE table_schema IN ('public','auth','storage')
      AND table_type='BASE TABLE';"""
    snapshot = subprocess.Popen(['docker', 'exec', '-i', db_container, 'psql', '-X', '-qAt',
                                 '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'],
                                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    started = time.time()
    try:
        snapshot.stdin.write(('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n'
                              'SELECT pg_export_snapshot();\n' + counts_query + '\n').encode())
        snapshot.stdin.flush()
        snapshot_id = snapshot.stdout.readline().decode().strip()
        assert snapshot_id and all(c in '0123456789ABCDEFabcdef-' for c in snapshot_id), 'Snapshot export failed'
        counts = json.loads(snapshot.stdout.readline())
        dump = command(['docker', 'exec', db_container, 'pg_dump', '-U', 'supabase_admin', '-d', 'postgres',
                        '--format=custom', '--no-owner', '--no-privileges', '--snapshot=' + snapshot_id])
        (output / 'database.dump').write_bytes(dump)
    finally:
        if snapshot.poll() is None:
            try:
                snapshot.communicate(input=b'ROLLBACK;\n', timeout=15)
            except (subprocess.TimeoutExpired, BrokenPipeError):
                snapshot.kill()
                snapshot.communicate(timeout=15)
        if snapshot.returncode != 0:
            raise RuntimeError('Snapshot session failed')

    # Unlike tar inside the Storage container, host GNU tar retains Storage xattrs.
    storage_inventory = {}
    for file in storage_source.rglob('*'):
        if file.is_file():
            assert not file.is_symlink(), 'Storage symlink requires review'
            storage_inventory[str(file.relative_to(storage_source))] = {
                'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
                'xattrs': {name: os.getxattr(file, name).hex() for name in os.listxattr(file)}
            }
    storage = command(['tar', '--xattrs', '--xattrs-include=*', '--numeric-owner',
                       '-C', str(storage_source), '-czf', '-', '.'])
    (output / 'storage.tar.gz').write_bytes(storage)
    acl_dump = command(['docker', 'exec', db_container, 'pg_dump', '-U', 'supabase_admin', '-d',
                        'postgres', '--schema-only', '--no-owner']).decode()
    acl = '\n'.join(line for line in acl_dump.splitlines()
                    if line.startswith(('GRANT ', 'REVOKE ', 'ALTER DEFAULT PRIVILEGES ')))
    owners = sql("""
SELECT format('ALTER SCHEMA %I OWNER TO %I;', nspname, pg_get_userbyid(nspowner))
FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema';
SELECT format('ALTER %s %s OWNER TO %I;', CASE relkind WHEN 'S' THEN 'SEQUENCE'
 WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,
 c.oid::regclass, pg_get_userbyid(relowner)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND relkind IN ('r','p','S','v','m')
AND NOT EXISTS(SELECT 1 FROM pg_depend WHERE objid=c.oid AND classid='pg_class'::regclass AND deptype='e')
AND NOT (relkind='S' AND EXISTS(SELECT 1 FROM pg_depend WHERE objid=c.oid
 AND classid='pg_class'::regclass AND refclassid='pg_class'::regclass AND deptype IN ('a','i')));
SELECT format('ALTER %s %s OWNER TO %I;', CASE prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
 p.oid::regprocedure, pg_get_userbyid(proowner)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
AND NOT EXISTS(SELECT 1 FROM pg_depend WHERE objid=p.oid AND classid='pg_proc'::regclass AND deptype='e');
-- pg_dump omits ACLs of extension-member schemas. Restore their actual grants.
SELECT format('GRANT %s ON SCHEMA %I TO %s%s;', a.privilege_type,n.nspname,
 CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
 CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema';
""")
    roles = command(['docker', 'exec', db_container, 'pg_dumpall', '-U', 'supabase_admin',
                     '--roles-only', '--no-role-passwords']).decode()
    roles = '\n'.join('DO $roles$ BEGIN ' + line + ' EXCEPTION WHEN duplicate_object THEN NULL; END $roles$;'
                      if line.startswith('CREATE ROLE ') else line for line in roles.splitlines())
    (output / 'recovery-roles.sql').write_text(roles)
    (output / 'recovery-privileges.sql').write_text("-- Reset clone schema ACLs before restoring exact grants, including extension\n-- members omitted by pg_dump. This SQL is for the isolated restore only.\nDO $schema_acl$ DECLARE r record; BEGIN\n FOR r IN SELECT n.nspname,a.grantee FROM pg_namespace n\n CROSS JOIN LATERAL aclexplode(n.nspacl) a\n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'\n LOOP EXECUTE format('REVOKE ALL ON SCHEMA %I FROM %s CASCADE;',r.nspname,\n CASE WHEN r.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(r.grantee)) END); END LOOP;\nEND $schema_acl$;\n" + owners + '\n' + acl)

    # Freeze service config and init files BEFORE restore: the clone must not read
    # any source bind mounts or source environment during its recovery steps.
    recovery = output / '.recovery-config'
    recovery.mkdir(mode=0o700)
    mount_map = {}
    for name in ['db', 'auth', 'rest', 'storage', 'kong']:
        for index, mount in enumerate(config['services'][name].get('volumes', [])):
            if mount['target'] in ['/var/lib/postgresql/data', '/etc/postgresql-custom', '/var/lib/storage']:
                continue
            if mount['type'] != 'bind':
                raise ValueError('Unsupported configuration mount type')
            source = Path(mount['source']).resolve(strict=True)
            target_name = name + '-' + str(index)
            target = recovery / target_name
            if source.is_dir():
                shutil.copytree(source, target)
            else:
                shutil.copy2(source, target)
            mount_map[name + ':' + mount['target']] = target_name
    (recovery / 'compose.json').write_text(json.dumps(config))
    (recovery / 'mount-map.json').write_text(json.dumps(mount_map))
    (output / 'recovery-config.tar.gz').write_bytes(command(['tar', '-C', str(recovery), '-czf', '-', '.']))
    shutil.rmtree(recovery)
    images = {name: {'image': config['services'][name]['image']} for name in ['db','auth','rest','storage','kong']}
    (output / 'recovery-inventory.json').write_text(json.dumps({
        'schemaVersion': 2, 'project': project, 'images': images,
        'snapshotCounts': counts, 'storageFiles': storage_inventory,
        'tableSecurity': json.loads(sql("SELECT coalesce(jsonb_agg(row_to_json(r) ORDER BY r.name),'[]'::jsonb) FROM\n(SELECT n.nspname||'.'||c.relname AS name, pg_get_userbyid(c.relowner) AS owner,\n ARRAY(SELECT a::text FROM unnest(coalesce(c.relacl,'{}'::aclitem[])) a ORDER BY a::text) AS acl\n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace\n WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','p','v','m','S')) r;")), 'storageUid': int(command(['docker','exec',storage_container,'id','-u'])),
        'storageGid': int(command(['docker','exec',storage_container,'id','-g'])),
        'schemaSecurity': json.loads(sql("SELECT coalesce(jsonb_agg(row_to_json(r) ORDER BY r.name),'[]'::jsonb) FROM (SELECT n.nspname AS name,pg_get_userbyid(n.nspowner) AS owner,ARRAY(SELECT a::text FROM unnest(coalesce(n.nspacl,'{}'::aclitem[])) a ORDER BY a::text) AS acl FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema') r;")),
        'configurationContainsSecrets': True,
        'consistency': 'Database snapshot; Storage copied separately. Object integrity must be checked on restore.'
    }))
    names = ['database.dump', 'storage.tar.gz', 'recovery-roles.sql', 'recovery-privileges.sql',
             'recovery-config.tar.gz', 'recovery-inventory.json']
    manifest = {'schemaVersion': 2, 'requiredFiles': names, 'sourceProject': project,
                'startedAt': started, 'completedAt': time.time()}
    (output / 'manifest.json').write_text(json.dumps(manifest))
    names.append('manifest.json')
    (output / 'SHA256SUMS').write_text(''.join(
        hashlib.sha256((output / name).read_bytes()).hexdigest() + '  ' + name + '\n' for name in names))
    for file in output.iterdir():
        os.chmod(file, 0o600)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ['output', 'compose-file', 'project', 'db-container', 'storage-container']:
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    produce_package(args.output, args.compose_file, args.project, args.db_container, args.storage_container)
    print('Version 2 private recovery package created; encrypt before transfer.')
