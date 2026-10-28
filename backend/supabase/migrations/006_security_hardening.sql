-- Migration: 006_security_hardening
--
-- Finishes the Task-2 security review:
--   1. remove the default `anon` / `authenticated` table access;
--   2. pin the search_path of the `updated_at` trigger function and close the
--      `rls_auto_enable` event-trigger's RPC surface;
--   3. move the `pg_trgm` extension out of the API-exposed `public` schema;
--   4. set explicit limits on the private `media` Storage bucket.
--
-- Context: the browser never talks to PostgREST or Storage directly. Every
-- product request goes through the Next.js API, which verifies the Privy
-- access token and queries Postgres with the service-role key (bypasses RLS).
-- `anon` / `authenticated` therefore have no legitimate surface here. These
-- statements do not touch `service_role`, the `auth` schema, or the
-- `storage` schema's own objects, and RLS stays enabled.
--
-- Safe to run on a fresh database (idempotent).

-- -------------------------------------------------------------
-- 1. Public-schema tables and sequences: no anon/authenticated.
--    (RLS was already enabled with zero policies; this removes the
--    capability to reach it at all.)
-- -------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Keep future objects in `public` from regaining the default grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- -------------------------------------------------------------
-- 2. Functions.
--    (a) trigger_set_updated_at: invoker function with a mutable
--        search_path (advisor `function_search_path_mutable`). It only
--        assigns NOW(), so pin it to pg_catalog + temp.
--    (b) rls_auto_enable: this is Supabase's own RLS event trigger, not part
--        of the app schema. Its body is already search_path-pinned, but the
--        default EXECUTE grant exposed it as an RPC to PUBLIC / anon /
--        authenticated. Event triggers still fire (system-invoked, owner
--        `postgres`); only the RPC path is removed.
-- -------------------------------------------------------------
ALTER FUNCTION public.trigger_set_updated_at()
  SET search_path = pg_catalog, pg_temp;

REVOKE ALL ON FUNCTION public.trigger_set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_set_updated_at() FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;

-- -------------------------------------------------------------
-- 3. Extensions: keep the API schema free of extension objects.
--    `pg_trgm` is relocatable and is not referenced by any app index or
--    query. `extensions` already exists on Supabase (it holds pgcrypto and
--    uuid-ossp); the CREATE below is for a plain Postgres target.
-- -------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- -------------------------------------------------------------
-- 4. Storage: explicit limits for the private `media` bucket.
--    Single bucket => one ceiling for all modalities:
--      * 52428800 bytes (50 MiB) — matches Supabase's default project-level
--        ceiling, so the effective limit is the same whether the project
--        global is 50 MiB or higher;
--      * raster images + common web/QuickTime video containers.
--    (The per-request signed-URL flow is unchanged.)
-- -------------------------------------------------------------
UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
      'image/png',
      'image/jpeg',
      'image/webp',
      'video/mp4',
      'video/webm',
      'video/quicktime'
    ]
WHERE id = 'media';
