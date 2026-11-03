-- Core schema (DESIGN.md §3). Times are timestamptz; local-time logic uses cities.timezone.

CREATE TYPE category AS ENUM ('LARP', 'IMPRO', 'RPG', 'BOARDGAMES');
CREATE TYPE event_status AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN', 'CANCELLED');
CREATE TYPE event_origin AS ENUM ('MANUAL', 'IMPORTED');
CREATE TYPE event_language AS ENUM ('pl', 'en', 'both');
CREATE TYPE source_kind AS ENUM ('ICS', 'JSONLD', 'HTML_ADAPTER', 'FB_PAGE', 'MANUAL_URL', 'LLM_PAGE');
CREATE TYPE source_trust AS ENUM ('AUTO_PUBLISH', 'REVIEW');

CREATE TABLE cities (
  id        serial PRIMARY KEY,
  name      text NOT NULL,
  slug      text NOT NULL UNIQUE,
  lat       double precision NOT NULL,
  lon       double precision NOT NULL,
  timezone  text NOT NULL DEFAULT 'Europe/Warsaw'
);

CREATE TABLE venues (
  id                      serial PRIMARY KEY,
  city_id                 int NOT NULL REFERENCES cities(id),
  name                    text NOT NULL,
  address                 text,
  district                text,
  lat                     double precision,
  lon                     double precision,
  website                 text,
  facebook_url            text,
  is_approximate_location boolean NOT NULL DEFAULT false,
  aliases                 text[] NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK ((lat IS NULL) = (lon IS NULL))
);
CREATE INDEX venues_latlon ON venues (lat, lon);

CREATE TABLE organizers (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  website       text,
  facebook_url  text,
  instagram     text,
  contact_email text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_series (
  id          serial PRIMARY KEY,
  title       text NOT NULL,
  rrule       text NOT NULL,
  template    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id                serial PRIMARY KEY,
  city_id           int NOT NULL REFERENCES cities(id),
  title             text NOT NULL,
  slug              text NOT NULL UNIQUE,
  description       text NOT NULL DEFAULT '',
  category          category NOT NULL,
  tags              text[] NOT NULL DEFAULT '{}',
  start_at          timestamptz NOT NULL,
  end_at            timestamptz,
  venue_id          int REFERENCES venues(id) ON DELETE SET NULL,
  organizer_id      int REFERENCES organizers(id) ON DELETE SET NULL,
  price_min         numeric(10,2),
  price_max         numeric(10,2),
  currency          char(3) NOT NULL DEFAULT 'PLN',
  is_free           boolean NOT NULL DEFAULT false,
  language          event_language NOT NULL DEFAULT 'pl',
  beginner_friendly boolean NOT NULL DEFAULT false,
  ticket_url        text,
  source_url        text,
  image_url         text,
  status            event_status NOT NULL DEFAULT 'DRAFT',
  origin            event_origin NOT NULL DEFAULT 'MANUAL',
  series_id         int REFERENCES event_series(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz,
  CHECK (end_at IS NULL OR end_at >= start_at),
  CHECK (price_max IS NULL OR price_min IS NULL OR price_max >= price_min)
);
CREATE INDEX events_status_start ON events (status, start_at);
CREATE INDEX events_venue ON events (venue_id);
CREATE INDEX events_tags ON events USING gin (tags);

CREATE TABLE sources (
  id                   serial PRIMARY KEY,
  name                 text NOT NULL,
  kind                 source_kind NOT NULL,
  url                  text,
  adapter_name         text,
  config               jsonb NOT NULL DEFAULT '{}',
  default_category     category,
  default_venue_id     int REFERENCES venues(id) ON DELETE SET NULL,
  default_organizer_id int REFERENCES organizers(id) ON DELETE SET NULL,
  trust                source_trust NOT NULL DEFAULT 'REVIEW',
  enabled              boolean NOT NULL DEFAULT true,
  schedule             interval NOT NULL DEFAULT '6 hours',
  last_run_at          timestamptz,
  last_status          text,
  last_error           text,
  events_found         int NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE imported_items (
  id            serial PRIMARY KEY,
  source_id     int NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  external_id   text NOT NULL,
  content_hash  text NOT NULL,
  raw           jsonb NOT NULL,
  event_id      int REFERENCES events(id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id)
);

CREATE TABLE admin_users (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- id is HMAC-SHA256(SESSION_SECRET, cookie token), so a DB leak doesn't leak live sessions.
CREATE TABLE admin_sessions (
  id          text PRIMARY KEY,
  user_id     int NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  ip          text,
  user_agent  text
);
CREATE INDEX admin_sessions_expires ON admin_sessions (expires_at);

CREATE TABLE login_attempts (
  id        bigserial PRIMARY KEY,
  ip        text NOT NULL,
  email     text NOT NULL,
  success   boolean NOT NULL,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_ip_at ON login_attempts (ip, at);
CREATE INDEX login_attempts_email_at ON login_attempts (email, at);

-- Reference data: the only city for now.
INSERT INTO cities (name, slug, lat, lon, timezone)
VALUES ('Poznań', 'poznan', 52.4064, 16.9252, 'Europe/Warsaw');
