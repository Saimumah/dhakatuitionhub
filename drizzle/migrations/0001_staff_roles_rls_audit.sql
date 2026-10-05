CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'moderator');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_owner_only ON public.user_roles ((role)) WHERE role = 'owner';
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.staff_profiles (
  user_id uuid PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  can_manage_moderators boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_profiles TO authenticated;
GRANT ALL ON public.staff_profiles TO service_role;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- helper functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_staff_role(_user_id uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.role FROM public.user_roles r
  JOIN public.staff_profiles p ON p.user_id = r.user_id
  WHERE r.user_id = _user_id AND p.is_active
$$;

CREATE OR REPLACE FUNCTION public.is_active_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_staff_role(_user_id) IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.can_manage_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_staff_role(_user_id) = 'owner'
    OR EXISTS (SELECT 1 FROM public.user_roles r JOIN public.staff_profiles p ON p.user_id = r.user_id
               WHERE r.user_id = _user_id AND r.role = 'admin' AND p.is_active AND p.can_manage_moderators)
$$;

CREATE OR REPLACE FUNCTION public.owner_exists()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner')
$$;
GRANT EXECUTE ON FUNCTION public.owner_exists() TO anon, authenticated;

-- policies
CREATE POLICY "own role or managers read roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_staff(auth.uid()));
CREATE POLICY "own profile or managers read profiles" ON public.staff_profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_staff(auth.uid()));
CREATE POLICY "owner reads audit log" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.get_staff_role(auth.uid()) = 'owner');

-- owner protection (applies to every role, including service role)
CREATE OR REPLACE FUNCTION public.protect_owner_role()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' THEN RAISE EXCEPTION 'Owner account cannot be removed'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'owner' THEN RAISE EXCEPTION 'Owner role cannot be changed'; END IF;
    IF NEW.role = 'owner' THEN RAISE EXCEPTION 'Nobody can be promoted to owner'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.role = 'owner' AND current_setting('app.claiming_owner', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'Owner can only be set during first setup';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_owner_role BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_role();

CREATE OR REPLACE FUNCTION public.protect_owner_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.has_role(OLD.user_id, 'owner') THEN RAISE EXCEPTION 'Owner account cannot be removed'; END IF;
    RETURN OLD;
  END IF;
  IF public.has_role(NEW.user_id, 'owner') AND NOT NEW.is_active THEN
    RAISE EXCEPTION 'Owner account cannot be disabled';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_owner_profile BEFORE UPDATE OR DELETE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_owner_profile();

-- first-time owner claim: only when no owner exists and the email is verified
CREATE OR REPLACE FUNCTION public.claim_ownership(_full_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _email text; _confirmed timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  PERFORM pg_advisory_xact_lock(424242);
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'owner') THEN RETURN false; END IF;
  SELECT email, email_confirmed_at INTO _email, _confirmed FROM auth.users WHERE id = _uid;
  IF _confirmed IS NULL THEN RAISE EXCEPTION 'Email not verified'; END IF;
  PERFORM set_config('app.claiming_owner', 'yes', true);
  DELETE FROM public.user_roles WHERE user_id = _uid;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'owner');
  PERFORM set_config('app.claiming_owner', 'no', true);
  INSERT INTO public.staff_profiles (user_id, full_name, email) VALUES (_uid, coalesce(nullif(trim(_full_name), ''), 'Owner'), _email)
    ON CONFLICT (user_id) DO UPDATE SET is_active = true;
  INSERT INTO public.audit_logs (actor_id, actor_email, actor_role, action) VALUES (_uid, _email, 'owner', 'owner_setup');
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.claim_ownership(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ownership(text) TO authenticated;

-- activity logging callable by active staff (actor taken from session)
CREATE OR REPLACE FUNCTION public.log_activity(_action text, _details jsonb DEFAULT '{}'::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _role public.app_role := public.get_staff_role(auth.uid());
BEGIN
  IF _role IS NULL THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF _action NOT IN ('login', 'logout') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  INSERT INTO public.audit_logs (actor_id, actor_email, actor_role, action, details)
  SELECT auth.uid(), p.email, _role::text, _action, coalesce(_details, '{}'::jsonb)
  FROM public.staff_profiles p WHERE p.user_id = auth.uid();
END $$;
REVOKE EXECUTE ON FUNCTION public.log_activity(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_activity(text, jsonb) TO authenticated;

-- applications: status + notification tracking + staff-only access
ALTER TABLE public.tutor_requests
  ADD COLUMN app_no bigint GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','searching','found','selected','completed','cancelled')),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN notification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN notification_error text;

GRANT SELECT ON public.tutor_requests TO authenticated;
GRANT UPDATE (status, updated_at) ON public.tutor_requests TO authenticated;
GRANT ALL ON public.tutor_requests TO service_role;

CREATE POLICY "active staff read applications" ON public.tutor_requests FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));
CREATE POLICY "active staff update applications" ON public.tutor_requests FOR UPDATE TO authenticated
  USING (public.is_active_staff(auth.uid())) WITH CHECK (public.is_active_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.log_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND auth.uid() IS NOT NULL THEN
    NEW.updated_at := now();
    INSERT INTO public.audit_logs (actor_id, actor_email, actor_role, action, details)
    SELECT auth.uid(), p.email, public.get_staff_role(auth.uid())::text, 'status_changed',
      jsonb_build_object('application_no', NEW.app_no, 'from', OLD.status, 'to', NEW.status)
    FROM public.staff_profiles p WHERE p.user_id = auth.uid();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER log_status_change BEFORE UPDATE ON public.tutor_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_status_change();