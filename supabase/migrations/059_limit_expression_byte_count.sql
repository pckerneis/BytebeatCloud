CREATE OR REPLACE FUNCTION public.minified_byte_length(js text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  i integer := 1;
  len integer := length(js);
  ch text;
  in_single boolean := false;
  in_double boolean := false;
  in_template boolean := false;
  escaped boolean := false;
  result text := '';
BEGIN
  WHILE i <= len LOOP
    ch := substr(js, i, 1);

    IF escaped THEN
      result := result || ch;
      escaped := false;

    ELSIF ch = '\' THEN
      result := result || ch;
      escaped := true;

    ELSIF in_single THEN
      result := result || ch;
      IF ch = '''' THEN
        in_single := false;
      END IF;

    ELSIF in_double THEN
      result := result || ch;
      IF ch = '"' THEN
        in_double := false;
      END IF;

    ELSIF in_template THEN
      result := result || ch;
      IF ch = '`' THEN
        in_template := false;
      END IF;

    ELSE
      IF ch = '''' THEN
        in_single := true;
        result := result || ch;

      ELSIF ch = '"' THEN
        in_double := true;
        result := result || ch;

      ELSIF ch = '`' THEN
        in_template := true;
        result := result || ch;

      ELSIF ch NOT IN (' ', E'\n', E'\r', E'\t') THEN
        result := result || ch;
      END IF;
    END IF;

    i := i + 1;
  END LOOP;

  RETURN octet_length(result);
END;
$$;

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS expression_max_length;

ALTER TABLE public.posts
  ADD CONSTRAINT expression_max_length
  CHECK (
    is_draft = true
    OR public.minified_byte_length(expression) <= 4096
  )
  NOT VALID;
