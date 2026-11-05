-- Preserve the deployed function and its privileges; replace only starter selection.
DO $patch$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.pin_and_spin_api(text,text,text,jsonb,text)'::regprocedure) INTO definition;
  IF position('order by seat offset (r.starter % n) limit 1;' in definition) = 0 THEN
    RAISE EXCEPTION 'Expected starter selection not found; inspect the deployed function';
  END IF;
  EXECUTE replace(definition,
    'order by seat offset (r.starter % n) limit 1;',
    'order by seat offset (case when r.mode=''classic'' then floor(random() * n)::integer else r.starter % n end) limit 1;');
END;
$patch$;
