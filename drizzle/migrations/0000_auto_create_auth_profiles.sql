CREATE OR REPLACE FUNCTION public.create_auth_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')), ''),
    NULLIF(NEW.raw_user_meta_data->>'avatar_url', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.create_auth_profile() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER nexus_create_auth_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_auth_profile();
INSERT INTO public.profiles (id, full_name, avatar_url)
SELECT id, NULLIF(trim(COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', '')), ''), NULLIF(raw_user_meta_data->>'avatar_url', '')
FROM auth.users
ON CONFLICT (id) DO NOTHING;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;