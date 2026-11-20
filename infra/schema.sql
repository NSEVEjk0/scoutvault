CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS _realtime AUTHORIZATION supabase_admin;
\getenv scout_password POSTGRES_PASSWORD
ALTER ROLE authenticator WITH PASSWORD :'scout_password';
ALTER ROLE supabase_admin WITH PASSWORD :'scout_password';
ALTER ROLE supabase_storage_admin WITH PASSWORD :'scout_password';
GRANT anon,authenticated,service_role TO authenticator;
GRANT anon,authenticated,service_role TO supabase_storage_admin;

CREATE OR REPLACE FUNCTION public.request_wallet()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'wallet', '')
$$;

CREATE TABLE IF NOT EXISTS public.sv_bounties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id numeric(20,0) NOT NULL,
  buyer_wallet text NOT NULL,
  scout_wallet text,
  escrow_address text UNIQUE NOT NULL,
  status text NOT NULL CHECK (status IN ('draft','open','claimed','submitted','paid','cancelled','disputed')),
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_signature text,
  UNIQUE (buyer_wallet, chain_id)
);

CREATE TABLE IF NOT EXISTS public.public_bounties (
  id uuid PRIMARY KEY REFERENCES public.sv_bounties(id),
  status text NOT NULL,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  location geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography) STORED,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_bounties_geo ON public.public_bounties USING gist(location);
CREATE INDEX IF NOT EXISTS public_bounties_status ON public.public_bounties(status);

CREATE TABLE IF NOT EXISTS public.sv_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id uuid NOT NULL REFERENCES public.sv_bounties(id),
  scout_wallet text NOT NULL,
  manifest jsonb NOT NULL,
  manifest_hash text NOT NULL UNIQUE,
  photo_path text NOT NULL,
  wallet_signature text NOT NULL,
  chain_signature text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sv_challenges (
  nonce text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('auth','capture')),
  wallet text NOT NULL,
  bounty_id uuid REFERENCES public.sv_bounties(id),
  message text NOT NULL,
  code text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sv_challenges_expiry ON public.sv_challenges(expires_at);

CREATE TABLE IF NOT EXISTS public.sv_prepared (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bounty_id uuid NOT NULL REFERENCES public.sv_bounties(id),
  wallet text NOT NULL,
  action text NOT NULL,
  data jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  signature text UNIQUE,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sv_demo_sessions (
  id text PRIMARY KEY,
  buyer_wallet text NOT NULL,
  scout_wallet text NOT NULL,
  buyer_key_encrypted text NOT NULL,
  scout_key_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sv_faucet_uses (
  wallet text PRIMARY KEY,
  granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sv_bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_bounties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sv_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sv_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sv_prepared ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sv_demo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sv_faucet_uses ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
GRANT SELECT ON public.public_bounties TO anon,authenticated;
GRANT SELECT ON public.sv_bounties,public.sv_reports TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

CREATE POLICY read_public_checks ON public.public_bounties FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY read_own_checks ON public.sv_bounties FOR SELECT TO authenticated
  USING (buyer_wallet = public.request_wallet() OR scout_wallet = public.request_wallet());
CREATE POLICY read_own_reports ON public.sv_reports FOR SELECT TO authenticated
  USING (scout_wallet = public.request_wallet() OR EXISTS (
    SELECT 1 FROM public.sv_bounties b WHERE b.id = bounty_id AND b.buyer_wallet = public.request_wallet()
  ));

CREATE OR REPLACE FUNCTION public.nearby_bounties(lat double precision,lng double precision,radius_m double precision DEFAULT 2000)
RETURNS TABLE(id uuid,data jsonb,distance_m double precision)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT b.id,b.data,ST_Distance(b.location,ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography)
  FROM public.public_bounties b
  WHERE lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
    AND ST_DWithin(b.location,ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography,least(greatest(radius_m,1),2000))
  ORDER BY 3 ASC,b.created_at DESC LIMIT 100
$$;
GRANT EXECUTE ON FUNCTION public.nearby_bounties(double precision,double precision,double precision) TO anon,authenticated,service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.public_bounties;
