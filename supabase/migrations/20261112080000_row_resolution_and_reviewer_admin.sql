ALTER TABLE public.invoice_review_members
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'reviewer',
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoice_review_members_role_check') THEN
    ALTER TABLE public.invoice_review_members ADD CONSTRAINT invoice_review_members_role_check CHECK (role IN ('admin', 'reviewer'));
  END IF;
END $$;

ALTER TABLE public.invoice_review_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_review_members FROM anon, authenticated;
GRANT SELECT ON public.invoice_review_members TO authenticated;
GRANT UPDATE (must_change_password) ON public.invoice_review_members TO authenticated;
DROP POLICY IF EXISTS invoice_review_members_update_own_password_flag ON public.invoice_review_members;
CREATE POLICY invoice_review_members_update_own_password_flag ON public.invoice_review_members
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));

UPDATE public.invoice_review_members m SET role = 'admin'
FROM auth.users u WHERE u.id = m.user_id AND lower(u.email) = lower('brunomnox@gmail.com');

DO $$ DECLARE current_pk text; BEGIN
  IF EXISTS (SELECT 1 FROM public.invoice_resolutions LIMIT 1) THEN
    RAISE EXCEPTION 'Invoice resolutions already exist; migrate these rows explicitly before changing their key.';
  END IF;
  ALTER TABLE public.invoice_resolutions ADD COLUMN IF NOT EXISTS record_id text;
  SELECT c.conname INTO current_pk FROM pg_constraint c
    WHERE c.conrelid = 'public.invoice_resolutions'::regclass AND c.contype = 'p';
  IF current_pk IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.invoice_resolutions DROP CONSTRAINT %I', current_pk);
  END IF;
  ALTER TABLE public.invoice_resolutions ALTER COLUMN record_id SET NOT NULL;
  ALTER TABLE public.invoice_resolutions ADD CONSTRAINT invoice_resolutions_pkey PRIMARY KEY (report_id, record_id);
END $$;
