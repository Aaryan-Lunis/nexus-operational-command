-- ============================================================
-- NEXUS Operational Command — Full Database Schema v2
-- Run this in Supabase SQL editor (idempotent — safe to re-run)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TABLES ──────────────────────────────────────────────────

-- Users (mirrors Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'MEMBER',   -- OWNER | ADMIN | OPERATOR | MEMBER
  title       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Rooms / Channels
CREATE TABLE IF NOT EXISTS public.rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  type        TEXT DEFAULT 'GENERAL',            -- GENERAL | OPS | INCIDENT | DEPLOYMENTS
  status      TEXT DEFAULT 'OPERATIONAL',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Events (core stream — every message, command, alert)
CREATE TABLE IF NOT EXISTS public.events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,                     -- MESSAGE_SENT | COMMAND_EXECUTED | INCIDENT_CREATED |
                                                 -- INCIDENT_UPDATED | AGENT_ALERT | SYSTEM_EVENT |
                                                 -- SYSTEM_ERROR | PERMISSION_DENIED | USER_JOINED
  room_id     UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_name   TEXT,
  content     TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Incidents with full lifecycle
-- Status: OPEN → INVESTIGATING → MITIGATING → RESOLVED
CREATE TABLE IF NOT EXISTS public.incidents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  severity    TEXT DEFAULT 'P3',                 -- P1 | P2 | P3
  status      TEXT DEFAULT 'OPEN',               -- OPEN | INVESTIGATING | MITIGATING | RESOLVED
  room_id     UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  created_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Systems / topology nodes
CREATE TABLE IF NOT EXISTS public.systems (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  status      TEXT DEFAULT 'stable',
  latency     INT DEFAULT 0,
  uptime      FLOAT DEFAULT 100.0,
  last_check  TIMESTAMPTZ DEFAULT NOW(),
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Agent actions audit log
CREATE TABLE IF NOT EXISTS public.agent_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name  TEXT NOT NULL,                     -- IncidentAgent | SecurityAgent | NetworkAgent
  action_type TEXT NOT NULL,                     -- EVENT_ANALYSIS | TOPOLOGY_ALERT | PERIODIC_REPORT | etc.
  reasoning   TEXT,
  event_id    UUID REFERENCES public.events(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── SEED DATA ────────────────────────────────────────────────

-- Default channels/rooms
INSERT INTO public.rooms (name, description, type, status) VALUES
  ('global',      'Global Operational Stream',   'GENERAL',     'OPERATIONAL'),
  ('ops',         'Operations Command Center',   'OPS',         'OPERATIONAL'),
  ('deployments', 'Deployment Pipeline',         'DEPLOYMENTS', 'OPERATIONAL'),
  ('security-ops','Security Operations Center',  'OPS',         'OPERATIONAL')
ON CONFLICT (name) DO NOTHING;

-- System topology nodes
INSERT INTO public.systems (name, status, latency, uptime) VALUES
  ('edge-gateway-01',      'stable', 24,  99.98),
  ('auth-service-cluster', 'stable', 12,  99.99),
  ('payment-processor',    'stable', 45,  99.95),
  ('nexus-core-db',        'stable',  8,  100.0)
ON CONFLICT (name) DO NOTHING;

-- ── REALTIME ────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE events;
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE systems;

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.systems       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies (idempotent)
DO $$ BEGIN
  DROP POLICY IF EXISTS "auth_read_users"         ON public.users;
  DROP POLICY IF EXISTS "public_read_rooms"       ON public.rooms;
  DROP POLICY IF EXISTS "auth_read_events"        ON public.events;
  DROP POLICY IF EXISTS "auth_read_incidents"     ON public.incidents;
  DROP POLICY IF EXISTS "public_read_systems"     ON public.systems;
  DROP POLICY IF EXISTS "auth_read_agent_actions" ON public.agent_actions;
  DROP POLICY IF EXISTS "auth_insert_users"       ON public.users;
  DROP POLICY IF EXISTS "auth_insert_events"      ON public.events;
  DROP POLICY IF EXISTS "auth_insert_rooms"       ON public.rooms;
  DROP POLICY IF EXISTS "auth_insert_incidents"   ON public.incidents;
  DROP POLICY IF EXISTS "auth_update_incidents"   ON public.incidents;
  DROP POLICY IF EXISTS "auth_update_systems"     ON public.systems;
  DROP POLICY IF EXISTS "auth_insert_agent"       ON public.agent_actions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Read
CREATE POLICY "auth_read_users"         ON public.users         FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "public_read_rooms"       ON public.rooms         FOR SELECT USING (true);
CREATE POLICY "auth_read_events"        ON public.events        FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_read_incidents"     ON public.incidents     FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "public_read_systems"     ON public.systems       FOR SELECT USING (true);
CREATE POLICY "auth_read_agent_actions" ON public.agent_actions FOR SELECT USING (auth.role() = 'authenticated');

-- Write
CREATE POLICY "auth_insert_users"     ON public.users     FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "auth_insert_events"    ON public.events    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_rooms"     ON public.rooms     FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_rooms"     ON public.rooms     FOR UPDATE  USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_incidents" ON public.incidents FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "auth_update_incidents" ON public.incidents FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_update_systems"   ON public.systems   FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "auth_insert_agent"     ON public.agent_actions FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_events_room_id    ON public.events(room_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON public.events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type       ON public.events(type);
CREATE INDEX IF NOT EXISTS idx_incidents_status  ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_agent_actions_agent ON public.agent_actions(agent_name);
