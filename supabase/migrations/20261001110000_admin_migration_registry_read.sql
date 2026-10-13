CREATE OR REPLACE FUNCTION public.get_admin_migration_registry()
RETURNS TABLE (version text, name text, checksum text, applied_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT migration.version, migration.name, migration.checksum, migration.applied_at
  FROM app_private.schema_migrations AS migration
  ORDER BY migration.version;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_migration_registry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_migration_registry() TO service_role;
