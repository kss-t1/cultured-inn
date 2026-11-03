-- Import pipeline (DESIGN.md §5): source ownership of events, review flags, series keys.

-- Stable identifier so seeds and the CLI can address a source.
ALTER TABLE sources ADD COLUMN key text UNIQUE;
ALTER TABLE sources ADD COLUMN last_stats jsonb NOT NULL DEFAULT '{}';

-- The source whose import created the event; only that source may update it.
ALTER TABLE events ADD COLUMN source_id int REFERENCES sources(id) ON DELETE SET NULL;
-- Set when an admin edits an imported event: later imports no longer overwrite it.
ALTER TABLE events ADD COLUMN import_locked boolean NOT NULL DEFAULT false;
-- Why the event needs a human look: needs_venue, missing_from_source, changed_at_source.
ALTER TABLE events ADD COLUMN review_flags text[] NOT NULL DEFAULT '{}';
CREATE INDEX events_review ON events (status) WHERE status = 'DRAFT' OR review_flags <> '{}';
CREATE INDEX events_start ON events (start_at);

-- Recurring series coming from feeds, e.g. "<source id>:<ICS UID>".
ALTER TABLE event_series ADD COLUMN external_key text UNIQUE;

ALTER TABLE imported_items ADD COLUMN url text;
-- Location as the source wrote it; used to learn venue aliases when an admin assigns a venue.
ALTER TABLE imported_items ADD COLUMN location_text text;
ALTER TABLE imported_items ADD COLUMN missing_since timestamptz;
CREATE INDEX imported_items_event ON imported_items (event_id);
