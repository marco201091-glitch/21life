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
from urllib.parse import urlsplit, urlunsplit, quote
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

        # Execute the same shell entrypoint and producer used by automatic jobs.
        # No configuration/secret is read from source services during restore.
        producer = root / 'supabase-backup-package.py'
        producer.write_text(fixture['producer_source'])
        backup_script = root / 'supabase-backup.sh'
        backup_script.write_text(fixture['backup_source'])
        automatic_dir = root / 'automatic-backups'
        command(['env', 'BACKUP_ENVIRONMENT=dev', 'BACKUP_DISABLE_ALERTS=1',
                 'HEALTH_ENV=/dev/null', 'OFFSITE_ENV=/dev/null', 'OFFSITE_RCLONE_DESTINATION=',
                 'BACKUP_DIR=' + str(automatic_dir), 'DB_CONTAINER=' + source_db,
                 'STORAGE_CONTAINER=' + source_storage,
                 'RECOVERY_COMPOSE_FILE=' + str(source / 'docker-compose.yml'),
                 'RECOVERY_COMPOSE_PROJECT=supabase-dev',
                 'RECOVERY_PACKAGE_GENERATOR=' + str(producer), 'bash', str(backup_script)], timeout=300)
        packages = list(automatic_dir.glob('supabase-dev-*'))
        assert len(packages) == 1, 'Automatic package not uniquely identified'
        package = packages[0]
        manifest = json.loads((package / 'manifest.json').read_text())
        assert manifest['schemaVersion'] == 2
        inventory = json.loads((package / 'recovery-inventory.json').read_text())
        expected_counts = inventory['snapshotCounts']
        captured = manifest['completedAt']
        checksums = {line.split('  ', 1)[1]: line.split('  ', 1)[0]
                     for line in (package / 'SHA256SUMS').read_text().splitlines()}
        assert set(checksums) == set(manifest['requiredFiles']) | {'manifest.json'}
        uploaded = True  # A partially failed upload also needs scoped cleanup.
        command(['rclone', 'copy', str(package), destination, '--checksum', '--transfers', '1',
                 '--checkers', '2', '--contimeout', '15s', '--timeout', '1m', '--retries', '2'])
        command(['rclone', 'check', str(package), destination, '--download', '--one-way', '--checkers', '2'])
        downloaded = root / 'downloaded-package'
        downloaded.mkdir(mode=0o700)
        restore_started = time.monotonic()
        command(['rclone', 'copy', destination, str(downloaded), '--checksum', '--transfers', '1',
                 '--checkers', '2', '--contimeout', '15s', '--timeout', '1m', '--retries', '2'])
        assert (downloaded / 'SHA256SUMS').read_bytes() == (package / 'SHA256SUMS').read_bytes()
        assert all(hashlib.sha256((downloaded / name).read_bytes()).hexdigest() == digest
                   for name, digest in checksums.items()), 'Downloaded backup checksum mismatch.'

        recovered_config = root / 'recovered-config'
        recovered_config.mkdir(mode=0o700)
        with tarfile.open(downloaded / 'recovery-config.tar.gz') as archive:
            for member in archive.getmembers():
                target = (recovered_config / member.name).resolve()
                assert target == recovered_config or recovered_config in target.parents
                assert member.isfile() or member.isdir(), 'Unsafe configuration member'
            archive.extractall(recovered_config, filter='data')
        config = json.loads((recovered_config / 'compose.json').read_text())
        mount_map = json.loads((recovered_config / 'mount-map.json').read_text())
        inventory = json.loads((downloaded / 'recovery-inventory.json').read_text())
        storage_uid, storage_gid = inventory['storageUid'], inventory['storageGid']
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
                    mount['source'] = str(recovered_config / mount_map[name + ':' + mount['target']])
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
        for relative_name, expected in inventory['storageFiles'].items():
            file = storage_dir / relative_name
            assert file.is_file() and hashlib.sha256(file.read_bytes()).hexdigest() == expected['sha256'], 'Storage file changed or missing'
            assert {name: os.getxattr(file, name).hex() for name in os.listxattr(file)} == expected['xattrs'], 'Storage xattr mismatch'
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
        actual_security = json.loads(sql(restored_db, "SELECT coalesce(jsonb_agg(row_to_json(r) ORDER BY r.name),'[]'::jsonb) FROM\n(SELECT n.nspname||'.'||c.relname AS name, pg_get_userbyid(c.relowner) AS owner,\n ARRAY(SELECT a::text FROM unnest(coalesce(c.relacl,'{}'::aclitem[])) a ORDER BY a::text) AS acl\n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace\n WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','p','v','m','S')) r;", 'recovery'))
        assert actual_security == inventory['tableSecurity'], 'Table owners/ACL mismatch'
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
        stored_objects = json.loads(sql(restored_db,
            "SELECT coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name,'size',metadata->'size')), '[]'::jsonb) FROM storage.objects;", 'recovery'))
        for stored in stored_objects:
            status, body = request(base, '/storage/v1/object/' + quote(stored['bucket'], safe='') + '/' + quote(stored['name'], safe='/'), service_key)
            assert status == 200, 'Database references missing/unreadable Storage object'
            if stored['size'] is not None:
                assert len(body) == int(stored['size']), 'Storage metadata size mismatch'
        report.update({'passed': True, 'tables_compared': len(expected_counts), 'auth_logins': 2,
                       'authorized_reads_writes': True, 'cross_user_reads_writes_denied': True,
                       'storage_hash_verified': True, 'all_storage_files_xattrs_verified': True, 'table_owners_acl_verified': True,
                       'storage_files_compared': len(inventory['storageFiles']),
                       'referenced_storage_objects_verified': len(stored_objects), 'private_storage_denied': True,
                       'encrypted_remote_roundtrip': True, 'automatic_package_version': 2,
                       'restore_config_from_downloaded_package': True, 'isolated_internal_network': True,
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
