-- Transactional test: successful and failed assertions both roll back fixtures.
DO $$
DECLARE
  test_user uuid := gen_random_uuid();
  profile_name text;
BEGIN
  INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
  VALUES (test_user, 'profile-' || test_user || '@test.local', 'authenticated', 'authenticated', '{"full_name":" Ana Silva ","avatar_url":"https://example.com/avatar.png"}');

  SELECT full_name INTO profile_name FROM public.profiles WHERE id = test_user;
  IF profile_name IS DISTINCT FROM 'Ana Silva' THEN
    RAISE EXCEPTION 'AUTH_PROFILE_FAILED: profile name was not created';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = test_user AND avatar_url = 'https://example.com/avatar.png') THEN
    RAISE EXCEPTION 'AUTH_PROFILE_FAILED: avatar was not created';
  END IF;

  RAISE EXCEPTION 'AUTH_PROFILE_PASSED: name and avatar created; test transaction rolled back';
END $$;