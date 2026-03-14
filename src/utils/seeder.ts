import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export async function seedInitialData() {
  if (!isSupabaseConfigured()) return;

  // ── Step 1: Ensure rooms exist ────────────────────────────────────────────
  const { data: existingRooms } = await supabase.from('rooms').select('name');
  const existingNames = new Set((existingRooms || []).map((r: any) => r.name));

  const defaultRooms = [
    { name: 'global',       description: 'Global Operational Stream',  type: 'GENERAL',     status: 'OPERATIONAL' },
    { name: 'ops',          description: 'Operations Command Center',  type: 'OPS',         status: 'OPERATIONAL' },
    { name: 'deployments',  description: 'Deployment Pipeline',        type: 'DEPLOYMENTS', status: 'OPERATIONAL' },
    { name: 'security-ops', description: 'Security Operations Center', type: 'OPS',         status: 'OPERATIONAL' },
  ];
  const toInsert = defaultRooms.filter(r => !existingNames.has(r.name));
  if (toInsert.length > 0) {
    await supabase.from('rooms').insert(toInsert);
  }

  // ── Step 2: Get all rooms by name ─────────────────────────────────────────
  const { data: rooms } = await supabase.from('rooms').select('*');
  if (!rooms || rooms.length === 0) return;
  const byName: Record<string, any> = Object.fromEntries(rooms.map((r: any) => [r.name, r]));

  // ── Step 3: Check PER-ROOM whether events exist — not globally ────────────
  // This is the key fix: don't skip if OTHER rooms have events
  for (const roomName of ['global', 'ops', 'deployments', 'security-ops']) {
    const room = byName[roomName];
    if (!room) continue;

    const { count } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id);

    if (count && count > 0) continue; // this room already seeded

    // ── Seed events for this specific room ──────────────────────────────────
    const now = new Date();
    const t = (minAgo: number) => new Date(now.getTime() - minAgo * 60000).toISOString();

    const eventsByRoom: Record<string, any[]> = {
      global: [
        { type: 'SYSTEM_EVENT',     user_name: 'SYSTEM',       content: '⚡ Nexus Operational Command initialized. All systems nominal.', metadata: { system: true }, created_at: t(14) },
        { type: 'MESSAGE_SENT',     user_name: 'Alex Chen',    content: 'Morning check-in. All services green on my end.', created_at: t(12) },
        { type: 'MESSAGE_SENT',     user_name: 'Sarah Miller', content: 'Heads up — payment cluster latency climbing in us-east-1.', created_at: t(10) },
        { type: 'AGENT_ALERT',      user_name: 'IncidentAgent',content: '⚠️ Latency spike in payment cluster. Escalating for review.', metadata: { reasoning: 'Latency keyword match', signals: ['latency', 'payment', 'us-east-1'], confidence: 0.91, ai_powered: true }, created_at: t(9) },
        { type: 'COMMAND_EXECUTED', user_name: 'Alex Chen',    content: '/scan payment-processor', metadata: { role: 'OPERATOR' }, created_at: t(8) },
        { type: 'AGENT_ALERT',      user_name: 'NetworkAgent', content: '⚠️ payment-processor responding at 280ms — above 250ms SLA threshold.', metadata: { target: 'payment-processor', avg_latency: 280 }, created_at: t(7) },
        { type: 'INCIDENT_CREATED', user_name: 'SYSTEM',       content: '🚨 CRITICAL: Incident opened for [payment-processor]. Reason: Latency spike > 250ms SLA', metadata: { target: 'payment-processor', severity: 'P1', status: 'OPEN' }, created_at: t(6) },
        { type: 'MESSAGE_SENT',     user_name: 'Alex Chen',    content: 'Taking point on this. Moving to incident room.', created_at: t(5) },
        { type: 'SYSTEM_EVENT',     user_name: 'NetworkAgent', content: '📊 Topology: 4 nodes online | Avg latency 89ms | ⚠️ 1 warning', metadata: { avg_latency: 89, warning_count: 1, periodic: true }, created_at: t(2) },
        { type: 'MESSAGE_SENT',     user_name: 'Sarah Miller', content: 'payment-processor latency dropping back to normal. Watching it.', created_at: t(1) },
      ],
      ops: [
        { type: 'SYSTEM_EVENT',     user_name: 'SYSTEM',       content: '⚡ #ops initialized. Operations Command Center active.', created_at: t(13) },
        { type: 'MESSAGE_SENT',     user_name: 'Sarah Miller', content: 'Capacity report: us-east-1 at 78% — recommend scaling before peak hours.', created_at: t(11) },
        { type: 'COMMAND_EXECUTED', user_name: 'Sarah Miller', content: '/status auth-service-cluster', metadata: { role: 'OPERATOR' }, created_at: t(9) },
        { type: 'SYSTEM_EVENT',     user_name: 'SYSTEM',       content: '📊 Status [auth-service-cluster]: Operational. Latency 14ms. No active incidents.', metadata: { service: 'auth-service-cluster', latency: 14 }, created_at: t(9) },
        { type: 'MESSAGE_SENT',     user_name: 'Alex Chen',    content: 'Running pre-deploy checklist for v2.4.1. All gates green.', created_at: t(6) },
        { type: 'COMMAND_EXECUTED', user_name: 'Alex Chen',    content: '/scan network', metadata: { role: 'OPERATOR' }, created_at: t(4) },
        { type: 'AGENT_ALERT',      user_name: 'NetworkAgent', content: '✅ Scan complete. All 4 endpoints reachable. Avg latency 22ms.', metadata: { avg_latency: 22, services_checked: 4 }, created_at: t(3) },
        { type: 'AGENT_ALERT',      user_name: 'SecurityAgent',content: '🔒 Unusual auth pattern from IP 185.220.101.x. Rate limiting applied.', metadata: { automated: true, threat_type: 'rate_limit' }, created_at: t(1) },
      ],
      deployments: [
        { type: 'SYSTEM_EVENT',     user_name: 'SYSTEM',       content: '⚡ #deployments initialized. Deployment pipeline monitoring active.', created_at: t(12) },
        { type: 'COMMAND_EXECUTED', user_name: 'Sarah Miller', content: '/deploy checkout-api v2.4.0', metadata: { role: 'OPERATOR' }, created_at: t(10) },
        { type: 'SYSTEM_EVENT',     user_name: 'DEPLOY_BOT',   content: '🚀 Deployment of [checkout-api@v2.4.0] initiated by Sarah Miller. Rolling update in progress...', metadata: { service: 'checkout-api', version: 'v2.4.0', status: 'started' }, created_at: t(10) },
        { type: 'SYSTEM_EVENT',     user_name: 'DEPLOY_BOT',   content: '✅ Deployment of [checkout-api@v2.4.0] complete. Health checks passing. Rollout: 100%', metadata: { service: 'checkout-api', version: 'v2.4.0', status: 'success' }, created_at: t(9) },
        { type: 'MESSAGE_SENT',     user_name: 'Alex Chen',    content: 'v2.4.0 looking good. Error rates nominal. Monitoring for 15m.', created_at: t(8) },
        { type: 'MESSAGE_SENT',     user_name: 'Sarah Miller', content: 'Confirmed stable. Proceeding with nexus-core v2.4.1.', created_at: t(6) },
        { type: 'COMMAND_EXECUTED', user_name: 'Alex Chen',    content: '/deploy nexus-core v2.4.1', metadata: { role: 'OPERATOR' }, created_at: t(5) },
        { type: 'SYSTEM_EVENT',     user_name: 'DEPLOY_BOT',   content: '🚀 Deployment of [nexus-core@v2.4.1] initiated by Alex Chen. Rolling update in progress...', metadata: { service: 'nexus-core', version: 'v2.4.1', status: 'started' }, created_at: t(5) },
        { type: 'SYSTEM_EVENT',     user_name: 'DEPLOY_BOT',   content: '✅ Deployment of [nexus-core@v2.4.1] complete. Health checks passing. Rollout: 100%', metadata: { service: 'nexus-core', version: 'v2.4.1', status: 'success' }, created_at: t(4) },
        { type: 'MESSAGE_SENT',     user_name: 'Alex Chen',    content: 'Both deploys complete and healthy. Closing deploy window.', created_at: t(2) },
      ],
      'security-ops': [
        { type: 'SYSTEM_EVENT',     user_name: 'SYSTEM',       content: '⚡ #security-ops initialized. SecurityAgent monitoring active.', created_at: t(12) },
        { type: 'AGENT_ALERT',      user_name: 'SecurityAgent',content: '🔒 Port scan on edge-gateway-01 from 91.108.4.x. Firewall rule ACL-2847 triggered.', metadata: { threat_type: 'port_scan', node: 'edge-gateway-01', automated: true }, created_at: t(8) },
        { type: 'MESSAGE_SENT',     user_name: 'Sarah Miller', content: 'Confirmed blocked. Adding to threat watchlist. No breach detected.', created_at: t(7) },
        { type: 'COMMAND_EXECUTED', user_name: 'Sarah Miller', content: '/status edge-gateway-01', metadata: { role: 'OPERATOR' }, created_at: t(6) },
        { type: 'SYSTEM_EVENT',     user_name: 'SYSTEM',       content: '📊 Status [edge-gateway-01]: Operational. Latency 24ms. Firewall active.', metadata: { service: 'edge-gateway-01', latency: 24 }, created_at: t(6) },
        { type: 'AGENT_ALERT',      user_name: 'SecurityAgent',content: '🔒 3 failed auth attempts on nexus-core-db from session d4e8f2. Session terminated.', metadata: { threat_type: 'brute_force', node: 'nexus-core-db', sessions_terminated: 1 }, created_at: t(3) },
        { type: 'MESSAGE_SENT',     user_name: 'Alex Chen',    content: 'Session terminated. User notified. Adding IP to blocklist.', created_at: t(2) },
      ],
    };

    const eventsToInsert = (eventsByRoom[roomName] || []).map(e => ({
      ...e,
      room_id: room.id,
    }));

    if (eventsToInsert.length > 0) {
      const { error } = await supabase.from('events').insert(eventsToInsert);
      if (error) console.error(`[Seeder] Error seeding ${roomName}:`, error);
      else console.log(`[Seeder] ✅ Seeded ${eventsToInsert.length} events into #${roomName}`);
    }
  }
}
