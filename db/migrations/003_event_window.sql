-- Local-time date windows for the public "when" filters (today, weekend, ...), computed in SQL
-- so DST is handled by Postgres' tz database. now_ts is a parameter so tests can pin time.
--   today     now → local midnight
--   tomorrow  local midnight+1 → midnight+2
--   weekend   max(now, Friday 17:00) → Monday 00:00 of the current ISO week
--   week      now → Monday 00:00 of next week
--   range     from_date 00:00 → (to_date or from_date)+1 00:00
CREATE FUNCTION event_window(kind text, now_ts timestamptz, tz text,
                             from_date date DEFAULT NULL, to_date date DEFAULT NULL)
RETURNS TABLE (range_start timestamptz, range_end timestamptz)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  local_now timestamp := now_ts AT TIME ZONE tz;
  today     date := local_now::date;
  monday    date := date_trunc('week', local_now)::date;
BEGIN
  CASE kind
    WHEN 'today' THEN
      range_start := now_ts;
      range_end   := (today + 1)::timestamp AT TIME ZONE tz;
    WHEN 'tomorrow' THEN
      range_start := (today + 1)::timestamp AT TIME ZONE tz;
      range_end   := (today + 2)::timestamp AT TIME ZONE tz;
    WHEN 'weekend' THEN
      range_start := greatest(now_ts, ((monday + 4)::timestamp + interval '17 hours') AT TIME ZONE tz);
      range_end   := (monday + 7)::timestamp AT TIME ZONE tz;
    WHEN 'week' THEN
      range_start := now_ts;
      range_end   := (monday + 7)::timestamp AT TIME ZONE tz;
    WHEN 'range' THEN
      IF from_date IS NULL THEN RAISE EXCEPTION 'range window needs from_date'; END IF;
      range_start := from_date::timestamp AT TIME ZONE tz;
      range_end   := (coalesce(to_date, from_date) + 1)::timestamp AT TIME ZONE tz;
    ELSE
      RAISE EXCEPTION 'unknown window kind: %', kind;
  END CASE;
  RETURN NEXT;
END $$;
