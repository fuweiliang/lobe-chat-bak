-- pg_search is optional for pg_like and Elasticsearch deployments.
-- Neon may list an extension as available after forbidding new installations.
-- Drizzle compares migration timestamps; previously applied migrations are unchanged.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_search') THEN
    RAISE NOTICE 'pg_search is already installed';
  ELSIF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_search')
    AND NOT ('pg_search' = ANY (
      regexp_split_to_array(COALESCE(current_setting('neon.deprecated_extensions', true), ''), '\s*,\s*')
    )) THEN
    CREATE EXTENSION pg_search;
  ELSE
    RAISE NOTICE 'pg_search is unavailable or deprecated; skipping optional BM25 search setup';
  END IF;
END $$;
