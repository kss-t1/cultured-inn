-- Events proposed through the public form at /submit. The event is a DRAFT with the 'submitted'
-- review flag; this table holds what only admins see, and the IP for rate limiting.
CREATE TABLE submissions (
  id            serial PRIMARY KEY,
  event_id      int REFERENCES events(id) ON DELETE SET NULL,
  location_text text NOT NULL,
  contact_name  text,
  contact_email text,
  ip            text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX submissions_ip_created ON submissions (ip, created_at);
CREATE INDEX submissions_event ON submissions (event_id);
