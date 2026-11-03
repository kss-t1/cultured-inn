-- Facebook Pages behind a login wall are read with an account's cookies (FB_COOKIES) instead of
-- the paid Apify scraper, so they no longer need a slower schedule to save credit.
-- Only rows still at the old 3-day interval change; an admin's own setting is kept.
UPDATE sources SET schedule = interval '24 hours'
WHERE kind = 'FB_PAGE' AND schedule = interval '72 hours'
  AND key IN ('fb-larpowy-ogrod', 'fb-wargamer', 'fb-cooliozum', 'fb-leniwe-raz',
              'fb-czworka-na-szynach', 'fb-improlaki', 'fb-rymparzysci');
