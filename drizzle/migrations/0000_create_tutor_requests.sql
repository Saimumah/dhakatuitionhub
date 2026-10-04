CREATE TABLE public.tutor_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_class text NOT NULL,
  subject text NOT NULL,
  student_gender text NOT NULL,
  location text NOT NULL,
  guardian_phone text NOT NULL,
  whatsapp_phone text,
  tutor_preference text NOT NULL,
  requirements text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tutor_requests_created_at ON public.tutor_requests (created_at DESC);
CREATE INDEX idx_tutor_requests_guardian_phone ON public.tutor_requests (guardian_phone, created_at DESC);

GRANT ALL ON public.tutor_requests TO service_role;

ALTER TABLE public.tutor_requests ENABLE ROW LEVEL SECURITY;
