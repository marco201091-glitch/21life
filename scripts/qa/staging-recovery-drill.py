"""Manual staging-only recovery drill. Invoked over SSH by the Node runner.

Credentials/config stay on the staging VM. No cron, production target, public
listener, email delivery or push service is created. Failed evidence stays 0700.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import time
import traceback
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError


def run_drill(fixture):
    suffix = fixture['suffix']
    assert re.fullmatch(r'[a-f0-9]{12}', suffix)
    project = 'imp12-drill-' + suffix
    root = Path('/var/tmp/21life-' + project)
    assert not root.exists()
    root.mkdir(mode=0o700)
    os.umask(0o077)
    report = {'target': 'staging', 'project': project, 'passed': False}
    started = time.monotonic()
    source = Path('/opt/supabase-staging/supabase/docker')
    compose_file = root / 'compose.json'
    destination = None
    uploaded = False
    snapshot = None
    snapshot_info = None

    def command(args, *, data=None, cwd=None, timeout=180):
        result = subprocess.run(args, input=data, cwd=cwd, capture_output=True, timeout=timeout)
        if result.returncode:
            (root / 'last-command.stderr').write_bytes(result.stderr)
            raise RuntimeError('Recovery step failed: ' + args[0] + ' (private stderr retained)')
        return result.stdout

    def sql(container, query, database='postgres'):
        return command(['docker', 'exec', '-i', container, 'psql', '-X', '-qAt',
                        '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin' if container.startswith(project + '-') else 'postgres', '-d', database],
                       data=query.encode()).decode().strip()

    def dc(*args):
        return command(['docker', 'compose', '-p', project, '-f', str(compose_file), *args], timeout=240)

    def request(base, path, key, *, token=None, method='GET', body=None):
        headers = {'apikey': key, 'Authorization': 'Bearer ' + (token or key)}
        if body is not None:
            headers['Content-Type'] = 'application/json'
        req = Request(base + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
        try:
            with urlopen(req, timeout=15) as response:
                return response.status, response.read()
        except HTTPError as error:
            return error.code, error.read()

    counts_query = """
SELECT jsonb_object_agg(table_schema || '.' || table_name,
  ((xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I',
    table_schema, table_name), false, true, '')))[1]::text)::bigint)
FROM information_schema.tables
WHERE table_schema IN ('public', 'auth', 'storage') AND table_type='BASE TABLE';
"""
    try:
        if shutil.disk_usage(root).free < 2 * 1024**3:
            raise RuntimeError('Need 2 GiB free on staging before isolation.')
        existing = command(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + project])
        assert not existing.strip(), 'Refusing existing drill project.'
        config = json.loads(command(['docker', 'compose', '-p', 'supabase-dev', '-f',
                                     str(source / 'docker-compose.yml'), 'config', '--format', 'json'], cwd=source))
        assert config['services']['db']['container_name'] == 'supabase-dev-db'
        source_db = 'supabase-dev-db'
        source_storage = 'supabase-dev-storage'
        assert config['services']['storage']['environment']['STORAGE_BACKEND'] == 'file', 'Drill only supports local-file Storage.'
        storage_uid = int(command(['docker', 'exec', source_storage, 'id', '-u']).strip())
        storage_gid = int(command(['docker', 'exec', source_storage, 'id', '-g']).strip())
        env_lines = Path('/etc/phyrexian-backup-offsite.env').read_text().splitlines()
        offsite = dict(line.split('=', 1) for line in env_lines if '=' in line and not line.startswith('#'))
        remote_base = offsite['OFFSITE_RCLONE_DESTINATION'].strip().strip('"\'').rstrip('/')
        remote_name = remote_base.split(':', 1)[0]
        remotes = json.loads(command(['rclone', 'config', 'dump']))
        assert remotes[remote_name]['type'] == 'crypt', 'Drill requires an encrypted remote.'
        destination = remote_base + '/' + project

        package = root / 'source-package'
        package.mkdir(mode=0o700)
        snapshot_sql = ("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"
                        "SELECT jsonb_build_object('snapshot',pg_export_snapshot(),'pid',pg_backend_pid());\n"
                        + counts_query + "\nSELECT pg_sleep(180);\nROLLBACK;\n")
        snapshot = subprocess.Popen(['docker', 'exec', '-i', '-e', 'PGAPPNAME=' + project, source_db, 'psql', '-X', '-qAt',
                                     '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        snapshot.stdin.write(snapshot_sql.encode())
        snapshot.stdin.flush()
        snapshot_info = json.loads(snapshot.stdout.readline())
        expected_counts = json.loads(snapshot.stdout.readline())
        dump = command(['docker', 'exec', source_db, 'pg_dump', '-U', 'postgres', '-d', 'postgres',
                        '--format=custom', '--no-owner', '--no-privileges', '--snapshot=' + snapshot_info['snapshot']])
        (package / 'database.dump').write_bytes(dump)
        sql(source_db, 'SELECT pg_terminate_backend(' + str(int(snapshot_info['pid'])) + ');')
        snapshot.communicate(timeout=15)
        snapshot = None
        storage_mount = next(mount for mount in config['services']['storage']['volumes']
                             if mount['target'] == '/var/lib/storage')
        assert storage_mount['type'] == 'bind'
        storage_source = Path(storage_mount['source']).resolve()
        assert source in storage_source.parents, 'Unexpected staging Storage source.'
        # Storage metadata lives in xattrs; a plain tar loses it and GET fails.
        storage = command(['tar', '--xattrs', '--xattrs-include=*', '-C', str(storage_source), '-czf', '-', '.'])
        (package / 'storage.tar.gz').write_bytes(storage)
        # Privileges/ownership are recovered separately from the data dump.
        # This catalog snapshot never enters the repository or public artifacts.
        acl_dump = command(['docker', 'exec', source_db, 'pg_dump', '-U', 'postgres', '-d', 'postgres',
                            '--schema-only', '--no-owner']).decode()
        acl = '\n'.join(line for line in acl_dump.splitlines()
                        if line.startswith(('GRANT ', 'REVOKE ', 'ALTER DEFAULT PRIVILEGES ')))
        owners = sql(source_db, """
SELECT format('ALTER SCHEMA %I OWNER TO %I;', nspname, pg_get_userbyid(nspowner))
FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema';
SELECT format('ALTER %s %s OWNER TO %I;', CASE relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW'
 WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, c.oid::regclass, pg_get_userbyid(relowner))
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND relkind IN ('r','p','S','v','m')
AND NOT EXISTS(SELECT 1 FROM pg_depend WHERE objid=c.oid AND classid='pg_class'::regclass AND deptype='e')
AND NOT (relkind='S' AND EXISTS(SELECT 1 FROM pg_depend WHERE objid=c.oid
 AND classid='pg_class'::regclass AND refclassid='pg_class'::regclass AND deptype IN ('a','i')));
SELECT format('ALTER %s %s OWNER TO %I;', CASE prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
 p.oid::regprocedure, pg_get_userbyid(proowner)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
AND NOT EXISTS(SELECT 1 FROM pg_depend WHERE objid=p.oid AND classid='pg_proc'::regclass AND deptype='e');
""")
        recovery_acl = owners + '\n' + acl
        globals_dump = command(['docker', 'exec', source_db, 'pg_dumpall', '-U', 'supabase_admin',
                                '--roles-only', '--no-role-passwords']).decode()
        globals_sql = '\n'.join(
            'DO $roles$ BEGIN ' + line + ' EXCEPTION WHEN duplicate_object THEN NULL; END $roles$;'
            if line.startswith('CREATE ROLE ') else line
            for line in globals_dump.splitlines())
        (package / 'recovery-roles.sql').write_text(globals_sql)
        (package / 'recovery-privileges.sql').write_text(recovery_acl)

        checksums = {name: hashlib.sha256((package / name).read_bytes()).hexdigest()
                     for name in ['database.dump', 'storage.tar.gz', 'recovery-roles.sql', 'recovery-privileges.sql']}
        (package / 'SHA256SUMS').write_text(''.join(digest + '  ' + name + '\n' for name, digest in checksums.items()))
        captured = time.time()
        (package / 'manifest.json').write_text(json.dumps({'name': project, 'timestamp': captured,
                                                         'source_project': 'supabase-dev', 'database_bytes': len(dump)}))
        uploaded = True  # A partially failed upload also needs scoped cleanup.
        command(['rclone', 'copy', str(package), destination, '--checksum', '--transfers', '1',
                 '--checkers', '2', '--contimeout', '15s', '--timeout', '1m', '--retries', '2'])
        downloaded = root / 'downloaded-package'
        downloaded.mkdir(mode=0o700)
        restore_started = time.monotonic()
        command(['rclone', 'copy', destination, str(downloaded), '--checksum', '--transfers', '1',
                 '--checkers', '2', '--contimeout', '15s', '--timeout', '1m', '--retries', '2'])
        assert (downloaded / 'SHA256SUMS').read_bytes() == (package / 'SHA256SUMS').read_bytes()
        assert all(hashlib.sha256((downloaded / name).read_bytes()).hexdigest() == digest
                   for name, digest in checksums.items()), 'Downloaded backup checksum mismatch.'

        services = {}
        for name in ['db', 'auth', 'rest', 'storage', 'kong']:
            service = copy.deepcopy(config['services'][name])
            service['container_name'] = project + '-' + name
            for key in ['ports', 'labels', 'depends_on', 'networks', 'profiles', 'extra_hosts', 'network_mode']:
                service.pop(key, None)
            service['networks'] = {'drill': None}
            service['restart'] = 'no'
            service['mem_limit'] = {'db': '1g', 'auth': '256m', 'rest': '256m', 'storage': '512m', 'kong': '256m'}[name]
            for mount in service.get('volumes', []):
                if mount['target'] == '/var/lib/postgresql/data':
                    mount.clear()
                    mount.update({'type': 'volume', 'source': 'drill-db-data', 'target': '/var/lib/postgresql/data'})
                elif mount['target'] == '/etc/postgresql-custom':
                    mount.clear()
                    mount.update({'type': 'volume', 'source': 'drill-db-config', 'target': '/etc/postgresql-custom'})
                elif mount['target'] == '/var/lib/storage':
                    mount['source'] = str(root / 'storage')
                    mount['type'] = 'bind'
                    mount.pop('bind', None)
                else:
                    mount['read_only'] = True
            environment = service.get('environment', {})
            for key in ['GOTRUE_DB_DATABASE_URL', 'PGRST_DB_URI', 'DATABASE_URL']:
                if key in environment:
                    uri = urlsplit(environment[key])
                    environment[key] = urlunsplit((uri.scheme, uri.netloc.replace('supabase-dev-db', 'db'),
                                                   '/recovery', uri.query, uri.fragment))
            if name == 'auth':
                environment.update({'GOTRUE_EXTERNAL_GOOGLE_ENABLED': 'false', 'GOTRUE_SITE_URL': 'http://localhost',
                                    'GOTRUE_URI_ALLOW_LIST': '', 'API_EXTERNAL_URL': 'http://localhost'})
                for key in list(environment):
                    if key.startswith('GOTRUE_SMTP_'):
                        environment.pop(key)
                environment['GOTRUE_SMTP_HOST'] = '127.0.0.1'
                environment['GOTRUE_SMTP_PORT'] = '9'
            if name == 'storage':
                environment['ENABLE_IMAGE_TRANSFORMATION'] = 'false'
            services[name] = service
        compose_file.write_text(json.dumps({'services': services, 'networks': {'drill': {'internal': True}},
                                            'volumes': {'drill-db-data': {}, 'drill-db-config': {}}}))
        storage_dir = root / 'storage'
        storage_dir.mkdir(mode=0o700)
        with tarfile.open(downloaded / 'storage.tar.gz') as archive:
            for member in archive.getmembers():
                target = (storage_dir / member.name).resolve()
                assert target == storage_dir or storage_dir in target.parents, 'Unsafe Storage archive path.'
                assert not member.issym() and not member.islnk(), 'Storage links require manual review.'
                assert member.isfile() or member.isdir(), 'Storage special files require manual review.'
        command(['tar', '--xattrs', '--xattrs-include=*', '-xzf', str(downloaded / 'storage.tar.gz'),
                 '-C', str(storage_dir), '--no-same-owner'])
        for path in [storage_dir, *storage_dir.rglob('*')]:
            os.chown(path, storage_uid, storage_gid)
        dc('up', '-d', '--no-deps', 'db')
        restored_db = project + '-db'
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            # The image starts a temporary Unix-socket server during init, then
            # stops it. TCP becomes available only on the final server.
            ready = subprocess.run(['docker', 'exec', restored_db, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], capture_output=True)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Isolated database did not become ready.')
        sql(restored_db, (downloaded / 'recovery-roles.sql').read_text())
        sql(restored_db, 'CREATE DATABASE recovery TEMPLATE template0;')
        command(['docker', 'exec', '-i', restored_db, 'pg_restore', '-U', 'supabase_admin', '-d', 'recovery',
                 '--no-owner', '--no-privileges', '--exit-on-error'], data=(downloaded / 'database.dump').read_bytes())
        sql(restored_db, (downloaded / 'recovery-privileges.sql').read_text(), 'recovery')
        actual_counts = json.loads(sql(restored_db, counts_query, 'recovery'))
        assert actual_counts == expected_counts, 'Restored table row counts differ from exported DB snapshot.'
        dc('up', '-d', '--no-deps', 'auth', 'rest', 'storage', 'kong')
        inspected = json.loads(command(['docker', 'inspect', project + '-kong']))[0]
        assert not inspected['HostConfig'].get('PortBindings'), 'Drill must not publish any host port.'
        network = next(iter(inspected['NetworkSettings']['Networks']))
        assert json.loads(command(['docker', 'network', 'inspect', network]))[0]['Internal']
        # Docker disables NAT/port publication on this internal network. The
        # VM can reach its private bridge address without a public listener.
        address = inspected['NetworkSettings']['Networks'][network]['IPAddress']
        base = 'http://' + address + ':8000'
        key = services['kong']['environment']['SUPABASE_ANON_KEY']
        service_key = services['kong']['environment']['SUPABASE_SERVICE_KEY']
        tokens = []
        deadline = time.monotonic() + 90
        for user in fixture['users']:
            while True:
                try:
                    status, body = request(base, '/auth/v1/token?grant_type=password', key, method='POST',
                                           body={'email': user['email'], 'password': fixture['password']})
                    if status == 200:
                        token = json.loads(body)
                        assert token['user']['id'] == user['id']
                        tokens.append(token['access_token'])
                        break
                except OSError:
                    pass
                if time.monotonic() > deadline:
                    raise RuntimeError('Restored Auth login failed (details withheld).')
                time.sleep(1)
        for index, user in enumerate(fixture['users']):
            status, body = request(base, '/rest/v1/decks?select=id,user_id&user_id=eq.' + user['id'], key, token=tokens[index])
            assert status == 200 and len(json.loads(body)) == 1, 'Authorized deck read failed.'
            other = fixture['users'][1 - index]['id']
            status, body = request(base, '/rest/v1/decks?select=id&user_id=eq.' + other, key, token=tokens[index])
            assert status == 200 and json.loads(body) == [], 'Cross-user read was not denied.'
            status, _ = request(base, '/rest/v1/decks', key, token=tokens[index], method='POST',
                                body={'user_id': user['id'], 'name': 'Restored authorized write', 'commander': 'Fixture'})
            assert status == 201, 'Authorized deck write failed.'
            status, _ = request(base, '/rest/v1/decks', key, token=tokens[index], method='POST',
                                body={'user_id': other, 'name': 'Cross-user write must fail', 'commander': 'Fixture'})
            assert status in (401, 403), 'Cross-user write was not denied.'
        object_path = '/storage/v1/object/' + fixture['bucket'] + '/probe.txt'
        deadline = time.monotonic() + 90
        while True:
            status, body = request(base, object_path, service_key)
            if status not in (502, 503, 504) or time.monotonic() > deadline:
                break
            time.sleep(1)
        report['storage_download_status'] = status
        assert status == 200 and hashlib.sha256(body).hexdigest() == fixture['storage_hash'], 'Restored Storage download failed.'
        status, _ = request(base, object_path, key, token=tokens[1])
        assert status in (400, 401, 403, 404), 'Private Storage was readable cross-user.'
        report.update({'passed': True, 'tables_compared': len(expected_counts), 'auth_logins': 2,
                       'authorized_reads_writes': True, 'cross_user_reads_writes_denied': True,
                       'storage_hash_verified': True, 'private_storage_denied': True,
                       'encrypted_remote_roundtrip': True, 'isolated_internal_network': True,
                       'outbound_email_push_disabled': True, 'checksums': checksums,
                       'backup_age_seconds': round(time.time() - captured, 2),
                       'restore_seconds': round(time.monotonic() - restore_started, 2),
                       'total_seconds': round(time.monotonic() - started, 2)})
    except Exception as error:
        report['error'] = type(error).__name__ + ': ' + str(error)
        (root / 'failure.traceback').write_text(traceback.format_exc())
        if compose_file.exists():
            diagnostic = subprocess.run(['docker', 'compose', '-p', project, '-f', str(compose_file), 'logs', '--tail', '60'], capture_output=True)
            (root / 'failure.logs').write_bytes(diagnostic.stdout + diagnostic.stderr)
    finally:
        if snapshot is not None:
            if snapshot_info is not None:
                try:
                    sql('supabase-dev-db', "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid="
                        + str(int(snapshot_info['pid'])) + " AND application_name='" + project + "';")
                except Exception:
                    report['snapshot_cleanup'] = False
            snapshot.kill()
            snapshot.wait(timeout=15)
        if compose_file.exists():
            try:
                dc('down', '--volumes', '--remove-orphans')
                report['isolated_stack_cleanup'] = True
            except Exception:
                report['isolated_stack_cleanup'] = False
                report['passed'] = False
        if uploaded and destination:
            try:
                assert destination.endswith('/' + project)
                command(['rclone', 'purge', destination])
                report['temporary_offsite_cleanup'] = True
            except Exception:
                report['temporary_offsite_cleanup'] = False
                report['passed'] = False
        if report['passed']:
            assert root.resolve().parent == Path('/var/tmp') and root.name == '21life-' + project
            for path in root.iterdir():
                if path.is_dir() and not path.is_symlink():
                    shutil.rmtree(path)
                else:
                    path.unlink()
            report['local_sensitive_data_cleanup'] = True
        else:
            report['private_failure_evidence_retained'] = True
        (root / 'report.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report), flush=True)
    return report
