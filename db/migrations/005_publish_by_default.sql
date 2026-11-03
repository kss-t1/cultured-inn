-- Imported events are published right away; the review page is for fixing mistakes afterwards.
-- REVIEW stays available per source for sources that need a human look first.
ALTER TABLE sources ALTER COLUMN trust SET DEFAULT 'AUTO_PUBLISH';
UPDATE sources SET trust = 'AUTO_PUBLISH';
