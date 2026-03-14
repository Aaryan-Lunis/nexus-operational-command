import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { sendEvent } from './eventService';
import { useNexusStore } from '../store/useNexusStore';

const GEMINI_KEY = (import.meta as any).env.VITE_GEMINI_API_KEY || '';

// Keywords that trigger agent analysis
const INCIDENT_KEYWORDS = ['latency', 'error', 'slow', 'timeout', 'down', 'crash', 'rollback', 'spike', 'fail'];
const SECURITY_KEYWORDS = ['security', 'breach', 'intrusion', 'unauthorized', 'attack', 'suspicious'];

// ── Gemini AI helper ──────────────────────────────────────────────────────────
async function callGemini(prompt: string): Promise<any> {
  if (!GEMINI_KEY) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 512 },
        }),
      }
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return null;
  }
}

// ── Write to agent_actions audit table ────────────────────────────────────────
async function logAgentAction(agentName: string, actionType: string, reasoning: string, eventId?: string) {
  try {
    await supabase.from('agent_actions').insert([{
      agent_name: agentName,
      action_type: actionType,
      reasoning,
      event_id: eventId || null,
    }]);
  } catch {
    // Non-critical — don't let this crash the agent
  }
}

// ── Latency simulation ────────────────────────────────────────────────────────
function simulateLatency(base: number): number {
  const drift = (Math.random() - 0.5) * 14;
  const spike = Math.random() < 0.07 ? Math.random() * 250 : 0;
  return Math.max(1, Math.round(base + drift + spike));
}

// ── System names that should not trigger self-responses ───────────────────────
const SYSTEM_SOURCES = new Set([
  'IncidentAgent', 'SecurityAgent', 'NetworkAgent',
  'SYSTEM', 'DEPLOY_BOT', 'DECISION_BOT',
]);

// ── Main engine setup ─────────────────────────────────────────────────────────
export function setupAgentEngine() {
  if (!isSupabaseConfigured()) return () => {};
  console.log('[AgentEngine] Initialized — IncidentAgent, SecurityAgent, NetworkAgent active');

  const store = useNexusStore.getState;

  // ── 1. Reactive: monitor new events ──────────────────────────────────────────
  const eventChannel = supabase
    .channel('agent-monitor')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, async (payload) => {
      const ev = payload.new as any;
      if (!ev || SYSTEM_SOURCES.has(ev.user_name)) return;

      const content = (ev.content || '').toLowerCase();

      // Determine which agent should respond
      const isIncident = INCIDENT_KEYWORDS.some(kw => content.includes(kw));
      const isSecurity = SECURITY_KEYWORDS.some(kw => content.includes(kw));
      if (!isIncident && !isSecurity) return;

      const agentName = isSecurity ? 'SecurityAgent' : 'IncidentAgent';
      const agentId = isSecurity ? 'security-agent' : 'incident-agent';

      // Update agent state
      store().updateAgent(agentId, {
        status: 'active',
        description: 'Analyzing event...',
        eventsProcessed: (store().agents.find(a => a.id === agentId)?.eventsProcessed || 0) + 1,
        lastAction: new Date().toISOString(),
      });

      // Try Gemini AI analysis
      let agentMessage: string;
      let reasoning = '';
      let signals: string[] = [];
      let confidence = 0;
      let aiPowered = false;

      if (GEMINI_KEY) {
        const analysis = await callGemini(`
You are Nexus Intelligence, an autonomous operational AI agent monitoring an internal engineering platform.
Analyze this event and determine if automated intervention is needed.

Event Type: ${ev.type}
Source: ${ev.user_name}
Content: ${ev.content}
Room: ${ev.room_id}

If you detect an anomaly (latency issue, service error, security threat, rollback discussion), respond with JSON:
{
  "detected": true,
  "agent": "IncidentAgent" | "SecurityAgent",
  "reasoning": "One sentence: what triggered this and why it matters",
  "confidence": 0.0 to 1.0,
  "signals": ["keyword or pattern that triggered this"],
  "message": "The alert message to broadcast to the ops team",
  "severity": "low" | "medium" | "high"
}
Otherwise: {"detected": false}
        `);

        if (analysis?.detected && (analysis.confidence || 0) > 0.5) {
          agentMessage = analysis.message;
          reasoning = analysis.reasoning;
          signals = analysis.signals || [];
          confidence = analysis.confidence;
          aiPowered = true;

          // Reflect severity in topology
          if (analysis.agent === 'IncidentAgent' && analysis.severity === 'high') {
            store().updateNodeStatus('payment-processor', 'warning', 320);
          }
          if (analysis.agent === 'SecurityAgent') {
            store().updateNodeStatus('edge-gateway-01', 'critical', 980);
            setTimeout(() => store().updateNodeStatus('edge-gateway-01', 'stable', 24), 30000);
          }
        }
      }

      // Heuristic fallback
      if (!agentMessage) {
        agentMessage = isSecurity
          ? `🔒 Security pattern flagged in message from ${ev.user_name}. Initiating security sweep on edge nodes.`
          : `⚠️ Operational anomaly detected in message from ${ev.user_name}. Pattern: "${content.slice(0, 60)}..."`;
        reasoning = isSecurity ? 'Security keyword match' : 'Incident keyword match';
        signals = isSecurity
          ? SECURITY_KEYWORDS.filter(kw => content.includes(kw))
          : INCIDENT_KEYWORDS.filter(kw => content.includes(kw));
        confidence = 0.7;
      }

      // Emit agent alert event
      const alertEvent = await sendEvent({
        type: 'AGENT_ALERT',
        roomId: ev.room_id,
        userName: agentName,
        content: agentMessage,
        metadata: {
          trigger_event_id: ev.id,
          reasoning,
          signals,
          confidence,
          ai_powered: aiPowered,
          agent: agentName,
        },
      });

      // Log to agent_actions audit table
      await logAgentAction(
        agentName,
        'EVENT_ANALYSIS',
        reasoning,
        ev.id
      );

      // Reset agent status after action
      setTimeout(() => {
        store().updateAgent(agentId, {
          status: 'active',
          description: 'Monitoring Events',
        });
      }, 8000);
    })
    .subscribe();

  // ── 2. Periodic: NetworkAgent topology scans every 10s ───────────────────────
  let tickCount = 0;
  const topologyInterval = setInterval(async () => {
    tickCount++;
    const { topology } = store();

    const { data: globalRoom } = await supabase
      .from('rooms').select('id').eq('name', 'global').single();
    if (!globalRoom) return;

    // Update latencies
    topology.nodes.forEach((node) => {
      const newLatency = simulateLatency(node.latency);
      const newStatus = newLatency > 500 ? 'critical' : newLatency > 150 ? 'warning' : 'stable';
      const prevStatus = node.status;
      store().updateNodeStatus(node.id, newStatus as any, newLatency);
      store().pushNetworkActivity(newLatency);

      // Alert on degradation
      if (newStatus !== 'stable' && newStatus !== prevStatus) {
        sendEvent({
          type: 'AGENT_ALERT',
          roomId: globalRoom.id,
          userName: 'NetworkAgent',
          content: `📡 [${node.id}] degraded to ${newStatus.toUpperCase()}. Latency: ${newLatency}ms (threshold: ${newStatus === 'critical' ? '500' : '150'}ms).`,
          metadata: { node_id: node.id, status: newStatus, latency: newLatency, threshold_breached: true },
        }).then(alertEvent => {
          logAgentAction('NetworkAgent', 'TOPOLOGY_ALERT', `Node ${node.id} degraded to ${newStatus}`, alertEvent?.id);
        });
        // Schedule recovery
        setTimeout(() => store().updateNodeStatus(node.id, 'stable', Math.round(node.latency * 0.85)), 25000);
      }
    });

    // Every 60s: topology summary report
    if (tickCount % 6 === 0) {
      const { topology: t } = store();
      const avgLatency = Math.round(t.nodes.reduce((s, n) => s + n.latency, 0) / t.nodes.length);
      const critical = t.nodes.filter(n => n.status === 'critical');
      const warning = t.nodes.filter(n => n.status === 'warning');

      const summaryEvent = await sendEvent({
        type: 'SYSTEM_EVENT',
        roomId: globalRoom.id,
        userName: 'NetworkAgent',
        content: `📊 Topology report: ${t.nodes.length} nodes online | Avg latency ${avgLatency}ms | ${critical.length > 0 ? `⚠️ ${critical.length} critical` : warning.length > 0 ? `${warning.length} warning` : '✅ All healthy'}.`,
        metadata: {
          avg_latency: avgLatency,
          critical_count: critical.length,
          warning_count: warning.length,
          nodes: t.nodes.map(n => ({ id: n.id, status: n.status, latency: n.latency })),
          periodic: true,
        },
      });
      await logAgentAction('NetworkAgent', 'PERIODIC_REPORT', `Avg latency ${avgLatency}ms, ${critical.length} critical`, summaryEvent?.id);

      store().updateAgent('network-agent', {
        status: 'active',
        description: `Last scan: ${new Date().toLocaleTimeString()}`,
        eventsProcessed: (store().agents.find(a => a.id === 'network-agent')?.eventsProcessed || 0) + 1,
      });
    }

    // 4% chance: random security probe
    if (Math.random() < 0.04) {
      const threats = [
        'Unusual auth pattern from external IP 185.220.101.x. Rate limiting applied.',
        'Port scan on edge-gateway-01 detected. Firewall rule activated.',
        '3 failed auth attempts — same session token. Account flagged for review.',
      ];
      const threat = threats[Math.floor(Math.random() * threats.length)];
      const secEvent = await sendEvent({
        type: 'AGENT_ALERT',
        roomId: globalRoom.id,
        userName: 'SecurityAgent',
        content: `🔒 ${threat}`,
        metadata: { automated: true, threat_type: 'heuristic_probe' },
      });
      await logAgentAction('SecurityAgent', 'SECURITY_PROBE', threat, secEvent?.id);
      store().updateAgent('security-agent', { status: 'active', description: 'Threat detected!' });
      setTimeout(() => store().updateAgent('security-agent', { status: 'standby', description: 'Standby' }), 15000);
    }
  }, 10000);

  // ── 3. Periodic: IncidentAgent node health check every 25s ───────────────────
  const incidentInterval = setInterval(async () => {
    const { topology } = store();
    const criticals = topology.nodes.filter(n => n.status === 'critical');
    if (criticals.length === 0) {
      store().updateAgent('incident-agent', {
        eventsProcessed: (store().agents.find(a => a.id === 'incident-agent')?.eventsProcessed || 0) + 1,
        lastAction: new Date().toISOString(),
        description: 'Monitoring Events',
      });
      return;
    }

    const { data: globalRoom } = await supabase.from('rooms').select('id').eq('name', 'global').single();
    if (!globalRoom) return;

    const alertEvent = await sendEvent({
      type: 'AGENT_ALERT',
      roomId: globalRoom.id,
      userName: 'IncidentAgent',
      content: `🚨 ${criticals.length} critical node(s) detected: ${criticals.map(n => n.id).join(', ')}. Recommend immediate investigation. Use /incident to open a response room.`,
      metadata: { critical_nodes: criticals.map(n => n.id), count: criticals.length, automated: true },
    });
    await logAgentAction(
      'IncidentAgent',
      'CRITICAL_ESCALATION',
      `${criticals.length} nodes critical: ${criticals.map(n => n.id).join(', ')}`,
      alertEvent?.id
    );
    store().updateAgent('incident-agent', {
      status: 'active',
      description: `${criticals.length} critical node(s)`,
      eventsProcessed: (store().agents.find(a => a.id === 'incident-agent')?.eventsProcessed || 0) + 1,
    });
  }, 25000);

  return () => {
    supabase.removeChannel(eventChannel);
    clearInterval(topologyInterval);
    clearInterval(incidentInterval);
    console.log('[AgentEngine] Stopped');
  };
}
