-- pg_trgm + unaccent are "trusted" extensions (PG13+): a DB owner can create them.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() is only STABLE (it depends on search_path), so wrap it with an explicit
-- dictionary to get an IMMUTABLE function usable in index expressions.
CREATE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  RETURN public.unaccent('public.unaccent'::regdictionary, $1);

-- Full-text search: 'simple' config (Postgres ships no Polish dictionary) over unaccented text.
CREATE FUNCTION event_search_doc(title text, description text) RETURNS tsvector
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  RETURN setweight(to_tsvector('simple', f_unaccent(coalesce(title, ''))), 'A')
      || setweight(to_tsvector('simple', f_unaccent(coalesce(description, ''))), 'B');

CREATE INDEX events_search ON events USING gin (event_search_doc(title, description));
-- Trigram indexes: typo-tolerant search and (M2) duplicate detection.
CREATE INDEX events_title_trgm ON events USING gin (f_unaccent(lower(title)) gin_trgm_ops);
CREATE INDEX venues_name_trgm ON venues USING gin (f_unaccent(lower(name)) gin_trgm_ops);
CREATE INDEX organizers_name_trgm ON organizers USING gin (f_unaccent(lower(name)) gin_trgm_ops);
CREATE INDEX venues_aliases ON venues USING gin (aliases);
