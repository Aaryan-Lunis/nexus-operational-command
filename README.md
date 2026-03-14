# NEXUS — Operational Command

> Real-time operational monitoring dashboard with AI-powered agents, incident management, and live event streaming.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and optionally GEMINI_API_KEY

# 3. Set up database
# Run schema.sql in your Supabase SQL editor

# 4. Start dev server
npm run dev
# → http://localhost:3000
```

---

## Architecture

```
src/
├── App.tsx                   # All UI: Dashboard, Auth, Views, Components
├── store/
│   └── useNexusStore.ts      # Zustand global state (topology, agents, user)
├── hooks/
│   └── useEvents.ts          # useEvents / usePersonnel / useIncidents / useRooms
├── services/
│   ├── eventService.ts       # sendEvent() + handleCommand() with 8 commands
│   └── agentEngine.ts        # AI agents: event-reactive + periodic ticks
├── lib/
│   └── supabaseClient.ts     # Supabase client singleton
└── utils/
    └── seeder.ts             # Seeds rooms + initial events on first load
```

---

## Features Implemented

### ✅ Working Command Input
Type `/command` or plain messages in the bottom bar.

| Command | Description |
|---|---|
| `/incident [service] [reason]` | Create a P1 incident room + DB record |
| `/scan [target]` | NetworkAgent scans the target, reports back in 3s |
| `/status [service]` | Instant status check response |
| `/deploy [service] [version]` | Triggers deploy + completion event in 5s |
| `/alert [message]` | Manual IncidentAgent alert |
| `/rollback [service]` | Initiates rollback sequence |
| `/resolve [incidentId]` | Marks incident RESOLVED in DB |
| `/help` | Lists all commands in the stream |

### ✅ Real-time Event Stream
- Supabase Realtime `postgres_changes` subscription
- Duplicate prevention with ID check
- Replay scrubber (0–100%) to scroll through history
- Search filter on content, user, and type
- Auto-scroll to newest events

### ✅ Sidebar Navigation (all working)
- **Global Stream** — live event feed
- **System Health** — service latency, uptime, status dashboard
- **Personnel** — live roster from `public.users`
- **Incidents** — incident tracker with severity/status badges
- **Operational Rooms** — per-room event streams (dynamically from DB)
- **Incident Rooms** — auto-appear when `/incident` command runs

### ✅ AI Agents (3 agents)

**IncidentAgent**
- Reacts to keyword events (latency, error, slow, timeout, crash…)
- Calls Gemini 1.5 Flash for AI analysis if API key present
- Falls back to heuristic response if no key
- Periodic pulse every 25s alerts on critical nodes

**SecurityAgent**
- Detects security keywords (breach, intrusion, unauthorized, attack…)
- Random threat simulation (5% per 10s tick) with auto-standby recovery

**NetworkAgent**
- Scans topology every 10s with realistic latency drift + spike simulation
- Generates periodic health reports every 60s
- Status-change alerts with auto-recovery after 30s
- Pushes live data to Network Activity graph

### ✅ System Topology (live)
- Latency bars update in real-time from agent ticks
- Status dots: green (stable) / amber (warning) / red+pulse (critical)
- Network Activity histogram driven by real latency data

### ✅ Supabase Integration
- Auth: email/password sign-in + sign-up with profile creation
- `events` table — full CRUD + Realtime
- `rooms` table — seeded on load, incident rooms created dynamically
- `incidents` table — created by `/incident`, resolved by `/resolve`
- `users` table — populated on signup, read for Personnel view
- `systems` table — topology nodes (schema.sql seeds 4 nodes)
- Row Level Security on all tables

### ✅ Gemini AI Integration
Set `GEMINI_API_KEY` in `.env` to enable:
- AI analysis of flagged events (confidence scoring)
- Reasoning + signal extraction shown in event cards
- Graceful fallback to heuristic mode if key absent or call fails

---

## Database Schema

Run `schema.sql` in Supabase SQL Editor. Tables:

- `users` — operator profiles (mirrors auth.users)
- `rooms` — GENERAL / OPS / INCIDENT rooms
- `events` — the core stream (realtime enabled)
- `incidents` — incident tracker
- `systems` — topology nodes
- `agent_actions` — agent audit log

---

## Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
GEMINI_API_KEY=your-gemini-key          # optional
VITE_GEMINI_API_KEY=your-gemini-key     # same key, exposed to frontend
APP_URL=http://localhost:3000
```

---

## What Changed vs Original

| Area | Before | After |
|---|---|---|
| Sidebar buttons | Dead (no onClick/to) | All navigate to live views |
| Command input | Wired but no global room | Fully working, 8 commands |
| Event stream | Loaded but replay broken | Live + searchable + replay |
| Agents | Static UI only | 3 live agents with AI + ticks |
| System Health | Static hardcoded nodes | Live latency simulation |
| Personnel | Not implemented | Live from `users` table |
| Incidents | Not implemented | Full tracker, linked to rooms |
| Topology | Hardcoded values | Live drift + spike simulation |
| Network Activity | Random animation | Real latency data |
| Gemini | Import but broken | Working with graceful fallback |
| Auth session | Not restored on reload | Restored via `getSession()` |
| Rooms | Only fetched | Dynamically created by agents |
