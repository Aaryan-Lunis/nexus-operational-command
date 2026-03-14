import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useParams,
  Link,
  useLocation,
} from 'react-router-dom';
import {
  Activity, Shield, Terminal, Users, Zap, AlertTriangle, CheckCircle2,
  MessageSquare, Command, Search, Settings, LogOut, Globe, Lock,
  Network, Server, Cpu, Database, Clock, TrendingUp, Eye, RefreshCw,
  ChevronRight, Play, Pause, History, XCircle, AlertCircle, Wifi, Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNexusStore, NexusUser, canDo } from './store/useNexusStore';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';
import { useEvents, usePersonnel, useIncidents, useRooms, NexusEvent } from './hooks/useEvents';
import { useOperationsTimeline, TimelineEntry, TimelineCategory } from './hooks/useOperationsTimeline';
import { handleCommand } from './services/eventService';
import { setupAgentEngine } from './services/agentEngine';
import { seedInitialData } from './utils/seeder';

// ─────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────

const SidebarItem = ({ icon: Icon, label, active, onClick, badge, to }: any) => {
  const inner = (
    <div
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group cursor-pointer ${
        active
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'
      }`}
    >
      <Icon size={16} className={active ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'} />
      <span className="text-sm font-medium flex-1 text-left">{label}</span>
      {badge && (
        <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${
          badge === 'LIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 animate-pulse' :
          badge === 'P1' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
          'bg-zinc-800 text-zinc-400 border-zinc-700'
        }`}>
          {badge}
        </span>
      )}
    </div>
  );
  if (to) return <Link to={to} className="block w-full">{inner}</Link>;
  return <button onClick={onClick} className="w-full">{inner}</button>;
};

const StatusDot = ({ status }: { status: string }) => (
  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
    status === 'stable' || status === 'OPERATIONAL' || status === 'RESOLVED'
      ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
      : status === 'warning' || status === 'OPEN'
      ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]'
      : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)] animate-pulse'
  }`} />
);

const Badge = ({ label, variant }: { label: string; variant: 'green' | 'red' | 'amber' | 'indigo' | 'zinc' }) => {
  const cls = {
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    red: 'bg-red-500/10 text-red-400 border-red-500/30',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    indigo: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    zinc: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  }[variant];
  return <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wider ${cls}`}>{label}</span>;
};

// ─────────────────────────────────────────────
// EVENT CARD
// ─────────────────────────────────────────────

const typeConfig: Record<string, { icon: any; color: string; bg: string; border: string }> = {
  AGENT_ALERT:       { icon: Zap,          color: 'text-indigo-400', bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  INCIDENT_CREATED:  { icon: AlertTriangle, color: 'text-red-400',    bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  INCIDENT_UPDATED:  { icon: RefreshCw,     color: 'text-amber-400',  bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  COMMAND_EXECUTED:  { icon: Terminal,      color: 'text-emerald-400',bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  SYSTEM_EVENT:      { icon: Server,        color: 'text-cyan-400',   bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20' },
  SYSTEM_ERROR:      { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  PERMISSION_DENIED: { icon: Lock,          color: 'text-orange-400', bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
  MESSAGE_SENT:      { icon: MessageSquare, color: 'text-zinc-400',   bg: 'bg-zinc-800/50',    border: 'border-zinc-700/50' },
  USER_JOINED:       { icon: Users,         color: 'text-emerald-400',bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
};

const INCIDENT_LIFECYCLE = ['OPEN', 'INVESTIGATING', 'MITIGATING', 'RESOLVED'];

const EventCard: React.FC<{ event: NexusEvent }> = ({ event }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = typeConfig[event.type] || typeConfig['MESSAGE_SENT'];
  const IconComp = cfg.icon;
  const hasMetadata = event.metadata && Object.keys(event.metadata).length > 0;
  const incidentStatus = event.metadata?.status;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={`relative rounded-xl border transition-all ${cfg.bg} ${cfg.border}`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-1.5 rounded-lg ${cfg.bg} border ${cfg.border} flex-shrink-0`}>
            <IconComp size={14} className={cfg.color} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-xs font-bold uppercase tracking-wide ${cfg.color}`}>{event.user_name}</span>
              <span className="text-[10px] text-zinc-600 font-mono">{new Date(event.created_at).toLocaleTimeString()}</span>
              <Badge
                label={event.type.replace(/_/g, ' ')}
                variant={
                  event.type === 'AGENT_ALERT' ? 'indigo' :
                  event.type === 'INCIDENT_CREATED' || event.type === 'SYSTEM_ERROR' || event.type === 'PERMISSION_DENIED' ? 'red' :
                  event.type === 'INCIDENT_UPDATED' ? 'amber' :
                  event.type === 'COMMAND_EXECUTED' ? 'green' : 'zinc'
                }
              />
              {incidentStatus && (
                <Badge
                  label={incidentStatus}
                  variant={incidentStatus === 'RESOLVED' ? 'green' : incidentStatus === 'OPEN' ? 'red' : 'amber'}
                />
              )}
            </div>
            <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{event.content}</p>

            {/* AI reasoning inline preview */}
            {event.metadata?.reasoning && !expanded && (
              <p className="mt-1.5 text-[11px] text-indigo-300/70 italic truncate">
                AI: "{event.metadata.reasoning}"
              </p>
            )}
          </div>

          {/* Expand toggle */}
          {hasMetadata && (
            <button
              onClick={() => setExpanded(e => !e)}
              className={`flex-shrink-0 p-1 rounded-md transition-colors ${
                expanded ? `${cfg.bg} ${cfg.color}` : 'text-zinc-600 hover:text-zinc-400'
              }`}
              title={expanded ? 'Collapse metadata' : 'Expand metadata'}
            >
              <ChevronRight size={13} className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>

        {/* Expanded metadata panel */}
        <AnimatePresence>
          {expanded && hasMetadata && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className={`mt-3 ml-8 p-3 rounded-xl border ${cfg.bg} ${cfg.border} space-y-2`}>
                {/* Incident lifecycle progress */}
                {incidentStatus && INCIDENT_LIFECYCLE.includes(incidentStatus) && (
                  <div className="mb-3">
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Incident Lifecycle</p>
                    <div className="flex items-center gap-1">
                      {INCIDENT_LIFECYCLE.map((stage, i) => {
                        const stageIdx = INCIDENT_LIFECYCLE.indexOf(incidentStatus);
                        const isPast = i < stageIdx;
                        const isCurrent = i === stageIdx;
                        return (
                          <React.Fragment key={stage}>
                            <div className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                              isCurrent ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' :
                              isPast ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                              'bg-zinc-900 text-zinc-600 border-zinc-800'
                            }`}>{stage}</div>
                            {i < INCIDENT_LIFECYCLE.length - 1 && (
                              <div className={`flex-1 h-px ${isPast ? 'bg-emerald-500/30' : 'bg-zinc-800'}`} />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* AI signals */}
                {event.metadata.signals?.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Signals</p>
                    <div className="flex flex-wrap gap-1">
                      {event.metadata.signals.map((s: string, i: number) => (
                        <span key={i} className="px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-[9px] text-indigo-400 border border-indigo-500/30">{s}</span>
                      ))}
                      {event.metadata.confidence !== undefined && (
                        <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-[9px] text-indigo-400 border border-indigo-500/30">
                          {Math.round(event.metadata.confidence * 100)}% confidence
                        </span>
                      )}
                      {event.metadata.ai_powered && (
                        <span className="px-1.5 py-0.5 rounded-full bg-violet-500/20 text-[9px] text-violet-400 border border-violet-500/30">✨ AI</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Key-value metadata */}
                <div>
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Metadata</p>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(event.metadata)
                      .filter(([k]) => !['signals', 'confidence', 'reasoning', 'ai_powered', 'status'].includes(k))
                      .slice(0, 8)
                      .map(([k, v]) => (
                        <div key={k} className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[9px] text-zinc-600 uppercase tracking-wider flex-shrink-0">{k}:</span>
                          <span className="text-[9px] text-zinc-300 font-mono truncate">{String(v)}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Full AI reasoning */}
                {event.metadata.reasoning && (
                  <div className="pt-2 border-t border-zinc-800/50">
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-1">AI Reasoning</p>
                    <p className="text-[11px] text-indigo-300 italic">"{event.metadata.reasoning}"</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// ─────────────────────────────────────────────
// SYSTEM HEALTH VIEW
// ─────────────────────────────────────────────

const SystemHealthView = () => {
  const { topology, updateNodeStatus } = useNexusStore();
  // Per-node latency history for sparklines: nodeId → last 12 readings
  const [history, setHistory] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(
      useNexusStore.getState().topology.nodes.map(n => [
        n.id,
        Array.from({ length: 12 }, (_, i) => {
          const base = n.latency;
          return Math.max(1, Math.round(base + Math.sin(i * 0.6) * (base * 0.25) + (Math.random() - 0.5) * (base * 0.15)));
        }),
      ])
    )
  );

  // Live 3-second tick — updates all node latencies and sparkline history
  useEffect(() => {
    const tick = setInterval(() => {
      const { topology: t } = useNexusStore.getState();
      setHistory(prev => {
        const next = { ...prev };
        t.nodes.forEach(node => {
          const drift = (Math.random() - 0.5) * node.latency * 0.2;
          const spike = Math.random() < 0.06 ? node.latency * (1 + Math.random() * 2) : 0;
          const newLat = Math.max(1, Math.round(node.latency + drift + spike));
          const newStatus = newLat > 500 ? 'critical' : newLat > 150 ? 'warning' : 'stable';
          updateNodeStatus(node.id, newStatus, newLat);
          next[node.id] = [...(prev[node.id] || []).slice(-11), newLat];
        });
        return next;
      });
    }, 3000);
    return () => clearInterval(tick);
  }, []);

  const overall = topology.nodes.every(n => n.status === 'stable') ? 'OPERATIONAL' :
    topology.nodes.some(n => n.status === 'critical') ? 'DEGRADED' : 'PARTIAL OUTAGE';
  const avgLatency = Math.round(topology.nodes.reduce((s, n) => s + n.latency, 0) / topology.nodes.length);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
      {/* Header KPIs */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'System Status',   value: overall,     icon: Activity,      color: overall === 'OPERATIONAL' ? 'text-emerald-400' : overall === 'DEGRADED' ? 'text-red-400' : 'text-amber-400' },
          { label: 'Services Online', value: `${topology.nodes.filter(n => n.status !== 'critical').length}/${topology.nodes.length}`, icon: Server, color: 'text-cyan-400' },
          { label: 'Avg Latency',     value: `${avgLatency}ms`, icon: Clock,   color: avgLatency > 150 ? 'text-red-400' : avgLatency > 80 ? 'text-amber-400' : 'text-emerald-400' },
          { label: 'Critical Nodes',  value: topology.nodes.filter(n => n.status === 'critical').length.toString(), icon: AlertTriangle, color: topology.nodes.some(n => n.status === 'critical') ? 'text-red-400' : 'text-zinc-500' },
        ].map((m) => (
          <div key={m.label} className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
            <div className="flex items-center gap-2 mb-2">
              <m.icon size={14} className={m.color} />
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{m.label}</span>
            </div>
            <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Live Service Status */}
      <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">Service Status</h3>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] text-emerald-400 font-bold">LIVE</span>
            </div>
          </div>
          <span className="text-[9px] text-zinc-600 font-mono">updates every 3s</span>
        </div>
        <div className="space-y-3">
          {topology.nodes.map((node) => {
            const hist = history[node.id] || [node.latency];
            const maxH = Math.max(...hist, 1);
            return (
              <div key={node.id} className={`flex items-center gap-4 p-3 rounded-xl border transition-all duration-500 ${
                node.status === 'critical' ? 'bg-red-500/5 border-red-500/20' :
                node.status === 'warning' ? 'bg-amber-500/5 border-amber-500/20' :
                'bg-zinc-950/50 border-zinc-800/30'
              }`}>
                <StatusDot status={node.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200">{node.id}</p>
                  <p className="text-[10px] text-zinc-500">
                    Updated {node.last_check ? new Date(node.last_check).toLocaleTimeString() : 'just now'}
                  </p>
                </div>
                {/* Sparkline */}
                <div className="flex items-end gap-px h-8 w-16">
                  {hist.map((v, i) => {
                    const h = Math.max(10, Math.round((v / maxH) * 100));
                    const isLatest = i === hist.length - 1;
                    return (
                      <div key={i} className="flex-1 rounded-t-[1px] transition-all duration-500"
                        style={{
                          height: `${h}%`,
                          background: isLatest
                            ? (node.status === 'stable' ? 'rgba(16,185,129,0.9)' : node.status === 'warning' ? 'rgba(245,158,11,0.9)' : 'rgba(239,68,68,0.9)')
                            : (node.status === 'stable' ? 'rgba(16,185,129,0.25)' : node.status === 'warning' ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'),
                        }}
                      />
                    );
                  })}
                </div>
                <div className="w-28 text-right">
                  <span className={`text-lg font-bold font-mono transition-colors duration-300 ${
                    node.latency > 500 ? 'text-red-400' : node.latency > 150 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>{node.latency}ms</span>
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        node.status === 'stable' ? 'bg-emerald-500' : node.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, (node.latency / 600) * 100)}%` }}
                    />
                  </div>
                </div>
                <Badge label={node.status} variant={node.status === 'stable' ? 'green' : node.status === 'warning' ? 'amber' : 'red'} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Uptime */}
      <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
        <h3 className="text-sm font-bold text-white mb-4">Uptime (30 days)</h3>
        <div className="space-y-4">
          {topology.nodes.map((node) => {
            const uptime = node.uptime ?? 99.9;
            const incident = uptime < 99.9;
            return (
              <div key={node.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-300 font-medium">{node.id}</span>
                  <span className={`text-xs font-mono font-bold ${incident ? 'text-amber-400' : 'text-emerald-400'}`}>{uptime.toFixed(3)}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${incident ? 'bg-amber-500/70' : 'bg-emerald-500/70'}`}
                    style={{ width: `${uptime}%` }}
                  />
                </div>
                <p className="text-[9px] text-zinc-600">{incident ? `${(100 - uptime).toFixed(3)}% downtime — ${Math.round((100 - uptime) * 432)} min this month` : 'No incidents this month'}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// PERSONNEL VIEW
// ─────────────────────────────────────────────

// Demo roster — shown alongside real DB users to fill out the Personnel view
const DEMO_PERSONNEL = [
  { id: 'demo-1', name: 'Alex Chen',    title: 'Principal Engineer',   role: 'OPERATOR', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=AlexChen',    status: 'online' },
  { id: 'demo-2', name: 'Sarah Miller', title: 'Site Reliability Lead', role: 'ADMIN',    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=SarahMiller',  status: 'online' },
  { id: 'demo-3', name: 'James Park',   title: 'Security Engineer',    role: 'OPERATOR', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=JamesPark',    status: 'away' },
  { id: 'demo-4', name: 'Mia Torres',   title: 'DevOps Engineer',      role: 'OPERATOR', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MiaTorres',    status: 'online' },
  { id: 'demo-5', name: 'Raj Patel',    title: 'Observer',             role: 'MEMBER',   avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=RajPatel',     status: 'offline' },
];

const statusColors: Record<string, string> = {
  online: 'bg-emerald-500',
  away:   'bg-amber-500',
  offline: 'bg-zinc-600',
};

const PersonnelView = () => {
  const { personnel, loading } = usePersonnel();
  const { currentUser } = useNexusStore();

  // Merge real DB users + demo roster, deduplicate by name
  const realNames = new Set([...(personnel || []).map((u: any) => u.name), currentUser?.name].filter(Boolean));
  const demoToShow = DEMO_PERSONNEL.filter(d => !realNames.has(d.name));
  const allPersonnel = [
    ...(personnel.length > 0 ? personnel : currentUser ? [currentUser] : []),
    ...demoToShow,
  ];

  const roleOrder = { OWNER: 0, ADMIN: 1, OPERATOR: 2, MEMBER: 3 };
  const sorted = [...allPersonnel].sort((a: any, b: any) =>
    (roleOrder[a.role as keyof typeof roleOrder] ?? 9) - (roleOrder[b.role as keyof typeof roleOrder] ?? 9)
  );

  const online  = sorted.filter((u: any) => u.status !== 'offline').length;
  const offline = sorted.filter((u: any) => u.status === 'offline').length;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white">Personnel</h2>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            <span className="text-emerald-400 font-bold">{online} online</span>
            {offline > 0 && <span className="text-zinc-600"> · {offline} offline</span>}
          </p>
        </div>
        <Badge label={`${sorted.length} OPERATORS`} variant="green" />
      </div>

      {/* Role summary */}
      <div className="grid grid-cols-4 gap-2">
        {(['OWNER', 'ADMIN', 'OPERATOR', 'MEMBER'] as const).map(role => {
          const count = sorted.filter((u: any) => u.role === role).length;
          return (
            <div key={role} className="p-2 rounded-xl bg-zinc-900/50 border border-zinc-800/50 text-center">
              <p className="text-lg font-bold text-white">{count}</p>
              <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-wider">{role}</p>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-zinc-600 text-sm animate-pulse">Loading...</div>
      ) : (
        <div className="space-y-2">
          {sorted.map((user: any) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700/50 transition-colors"
            >
              <div className="relative flex-shrink-0">
                <img
                  src={user.avatar_url || user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`}
                  className="w-10 h-10 rounded-xl bg-zinc-800"
                  alt=""
                />
                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-zinc-950 ${statusColors[user.status || 'online']}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{user.name}</p>
                <p className="text-[10px] text-zinc-500">{user.title || 'Operator'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-medium capitalize ${
                  user.status === 'online' ? 'text-emerald-400' : user.status === 'away' ? 'text-amber-400' : 'text-zinc-600'
                }`}>{user.status || 'online'}</span>
                <Badge
                  label={user.role || 'MEMBER'}
                  variant={user.role === 'OWNER' ? 'red' : user.role === 'ADMIN' ? 'indigo' : user.role === 'OPERATOR' ? 'amber' : 'zinc'}
                />
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};


// ─────────────────────────────────────────────
// OPERATIONS TIMELINE VIEW  (OWNER only)
// ─────────────────────────────────────────────

const CATEGORY_STYLE: Record<TimelineCategory, {
  color: string; bg: string; border: string; dot: string; label: string;
}> = {
  command:  { color: 'text-emerald-400', bg: 'bg-emerald-500/8',  border: 'border-emerald-500/20', dot: 'bg-emerald-500', label: 'CMD' },
  agent:    { color: 'text-indigo-400',  bg: 'bg-indigo-500/8',   border: 'border-indigo-500/20',  dot: 'bg-indigo-500',  label: 'AGENT' },
  system:   { color: 'text-cyan-400',    bg: 'bg-cyan-500/8',     border: 'border-cyan-500/20',    dot: 'bg-cyan-500',    label: 'SYS' },
  incident: { color: 'text-red-400',     bg: 'bg-red-500/8',      border: 'border-red-500/20',     dot: 'bg-red-500',     label: 'INC' },
  denied:   { color: 'text-orange-400',  bg: 'bg-orange-500/8',   border: 'border-orange-500/20',  dot: 'bg-orange-400',  label: 'DENY' },
};

const ROLE_STYLE: Record<string, string> = {
  OWNER:    'text-red-400',
  ADMIN:    'text-indigo-400',
  OPERATOR: 'text-amber-400',
  MEMBER:   'text-zinc-400',
};

function extractTarget(entry: TimelineEntry): string {
  const m = entry.metadata || {};
  // Command target — pull service / target / topic from metadata or content
  if (m.target)  return m.target;
  if (m.service) return m.service;
  // Parse from content: /cmd arg1 arg2 → arg1
  const parts = (entry.content || '').split(' ');
  if (parts.length > 1 && parts[0].startsWith('/')) return parts.slice(1).join(' ').slice(0, 40);
  return '';
}

function extractRole(entry: TimelineEntry): string {
  return entry.metadata?.role || '';
}

const OperationsTimelineView = () => {
  const { entries, loading } = useOperationsTimeline(50);
  const [filter, setFilter] = useState<TimelineCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  const filtered = entries.filter(e => {
    if (filter !== 'all' && e.category !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.user_name?.toLowerCase().includes(q) ||
        e.content?.toLowerCase().includes(q) ||
        extractTarget(e).toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts: Record<string, number> = { all: entries.length };
  entries.forEach(e => { counts[e.category] = (counts[e.category] || 0) + 1; });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex-shrink-0 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Operations Timeline</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">Live operator activity across the system</p>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest">Owner View</span>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-5 gap-2">
          {(Object.entries(CATEGORY_STYLE) as [TimelineCategory, typeof CATEGORY_STYLE[TimelineCategory]][]).map(([cat, s]) => (
            <button
              key={cat}
              onClick={() => setFilter(filter === cat ? 'all' : cat)}
              className={`p-2.5 rounded-xl border text-center transition-all ${
                filter === cat
                  ? `${s.bg} ${s.border} ${s.color}`
                  : 'bg-zinc-900/50 border-zinc-800/50 text-zinc-500 hover:border-zinc-700'
              }`}
            >
              <p className="text-lg font-bold">{counts[cat] || 0}</p>
              <p className="text-[8px] font-bold uppercase tracking-wider mt-0.5">{s.label}</p>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by user, command, or target…"
            className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl pl-8 pr-4 py-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700 placeholder-zinc-600"
          />
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[72px_1fr_1fr_120px_60px] gap-3 px-3">
          {['Time', 'User', 'Command / Action', 'Target', 'Type'].map(h => (
            <span key={h} className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">{h}</span>
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-1.5 custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-zinc-600 text-sm animate-pulse">
            Loading timeline…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-zinc-700 space-y-2">
            <Clock size={28} className="opacity-20" />
            <p className="text-sm">No activity matches this filter.</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {filtered.map((entry, idx) => {
              const s = CATEGORY_STYLE[entry.category];
              const role = extractRole(entry);
              const target = extractTarget(entry);
              const isNew = idx === 0;
              return (
                <motion.div
                  key={entry.id}
                  layout
                  initial={isNew ? { opacity: 0, x: -16, scale: 0.98 } : false}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className={`grid grid-cols-[72px_1fr_1fr_120px_60px] gap-3 items-center px-3 py-2.5 rounded-xl border transition-colors ${s.bg} ${s.border}`}
                >
                  {/* Time */}
                  <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
                    {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>

                  {/* User + role */}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-zinc-200 truncate">{entry.user_name}</p>
                    {role && (
                      <p className={`text-[9px] font-bold uppercase tracking-wider ${ROLE_STYLE[role] || 'text-zinc-500'}`}>{role}</p>
                    )}
                  </div>

                  {/* Command / content */}
                  <p className={`text-xs font-mono truncate ${s.color}`}>
                    {entry.content?.slice(0, 55)}{(entry.content?.length || 0) > 55 ? '…' : ''}
                  </p>

                  {/* Target */}
                  <p className="text-[10px] font-mono text-zinc-500 truncate">{target || '—'}</p>

                  {/* Category badge */}
                  <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${s.bg} ${s.color} ${s.border} text-center`}>
                    {s.label}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// INCIDENTS VIEW
// ─────────────────────────────────────────────

const IncidentsView = () => {
  const { incidents, loading } = useIncidents();

  const severityColor = (s: string) => ({ P1: 'red', P2: 'amber', P3: 'zinc' } as any)[s] || 'zinc';

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white">Active Incidents</h2>
        <Badge label={`${incidents.filter(i => i.status === 'OPEN').length} OPEN`} variant={incidents.some(i => i.status === 'OPEN') ? 'red' : 'green'} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32 text-zinc-600 text-sm animate-pulse">Loading incidents...</div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-zinc-600 space-y-3">
          <CheckCircle2 size={40} className="opacity-20 text-emerald-500" />
          <p className="text-sm">No active incidents. All systems nominal.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc: any) => (
            <motion.div
              key={inc.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-2xl border transition-all ${
                inc.status === 'OPEN'
                  ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/30'
                  : 'bg-zinc-900/30 border-zinc-800/40 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={16} className={inc.status === 'OPEN' ? 'text-red-400 mt-0.5' : 'text-zinc-500 mt-0.5'} />
                  <div>
                    <p className="text-sm font-bold text-white">{inc.title}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      Room: {inc.rooms?.name || 'Global'} · {new Date(inc.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge label={inc.severity || 'P3'} variant={severityColor(inc.severity)} />
                  <Badge label={inc.status} variant={inc.status === 'OPEN' ? 'red' : 'green'} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// MAIN EVENT STREAM VIEW
// ─────────────────────────────────────────────

const EventStreamView = ({
  events, loading, replayTime, onSearch
}: {
  events: NexusEvent[];
  loading: boolean;
  replayTime: number;
  onSearch: (q: string) => void;
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const visibleEvents = useMemo(() => {
    let ev = events.slice(0, Math.max(1, Math.floor((replayTime / 100) * events.length)));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      ev = ev.filter((e) => e.content.toLowerCase().includes(q) || e.user_name.toLowerCase().includes(q) || e.type.toLowerCase().includes(q));
    }
    return ev;
  }, [events, replayTime, searchQuery]);

  useEffect(() => {
    if (scrollRef.current && replayTime === 100) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleEvents, replayTime]);

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-3 scroll-smooth custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 space-y-3">
            <Activity size={24} className="animate-pulse text-emerald-500" />
            <p className="text-sm">Syncing with network...</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {visibleEvents.map((event) => <EventCard key={event.id} event={event} />)}
            {visibleEvents.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-zinc-700 space-y-2">
                <Terminal size={48} className="opacity-20" />
                <p className="text-sm">No events in this stream.</p>
                <p className="text-xs text-zinc-600">Type /help to see available commands.</p>
              </div>
            )}
          </AnimatePresence>
        )}
      </div>
    </>
  );
};

// ─────────────────────────────────────────────
// RIGHT PANEL
// ─────────────────────────────────────────────

const RightPanel: React.FC<{ events: NexusEvent[] }> = ({ events }) => {
  const { topology, agents, networkActivity, pushNetworkActivity } = useNexusStore();

  // Tick every 2s: push real avg topology latency + event burst into graph
  useEffect(() => {
    const tick = setInterval(() => {
      const { topology: t } = useNexusStore.getState();
      const avgLatency = Math.round(
        t.nodes.reduce((sum, n) => sum + n.latency, 0) / Math.max(1, t.nodes.length)
      );
      // Add burst for recent high-severity events
      const recentAlerts = events.filter(e =>
        e.type === 'AGENT_ALERT' && Date.now() - new Date(e.created_at).getTime() < 15000
      ).length;
      const recentIncidents = events.filter(e =>
        e.type === 'INCIDENT_CREATED' && Date.now() - new Date(e.created_at).getTime() < 30000
      ).length;
      const burst = recentIncidents * 90 + recentAlerts * 35;
      pushNetworkActivity(Math.min(280, avgLatency + burst));
    }, 2000);
    return () => clearInterval(tick);
  }, [events.length]);

  // Build activity bars: networkActivity is the rolling window
  const liveActivity = networkActivity;

  // Live event-rate label: events in the last 60s
  const recentCount = events.filter(e => Date.now() - new Date(e.created_at).getTime() < 60000).length;

  return (
    <aside className="w-72 border-l border-zinc-800/50 bg-zinc-950/50 flex flex-col overflow-y-auto custom-scrollbar">
      <div className="p-5 space-y-7">
        {/* System Topology */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">System Topology</label>
            <Zap size={11} className="text-emerald-500 animate-pulse" />
          </div>
          <div className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 space-y-3">
            {topology.nodes.map((node) => (
              <div key={node.id} className="flex items-center gap-3">
                <StatusDot status={node.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-300 truncate">{node.id}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-700 ${
                          node.status === 'stable' ? 'bg-emerald-500/60' :
                          node.status === 'warning' ? 'bg-amber-500/60' : 'bg-red-500/60'
                        }`}
                        style={{ width: `${Math.min(100, (node.latency / 600) * 100)}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-mono w-10 text-right ${
                      node.latency > 500 ? 'text-red-400' : node.latency > 150 ? 'text-amber-400' : 'text-zinc-500'
                    }`}>{node.latency}ms</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Active Agents */}
        <section>
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 block">Active Agents</label>
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className={`p-3 rounded-2xl border transition-all duration-300 ${
                  agent.status === 'active'
                    ? 'bg-indigo-500/5 border-indigo-500/20'
                    : agent.status === 'error'
                    ? 'bg-red-500/5 border-red-500/20 opacity-70'
                    : 'bg-zinc-900/50 border-zinc-800/50 opacity-50'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    agent.status === 'active' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    {agent.name === 'IncidentAgent' ? <Zap size={13} /> :
                     agent.name === 'SecurityAgent' ? <Shield size={13} /> :
                     <Network size={13} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white">{agent.name}</p>
                    <p className={`text-[9px] truncate ${agent.status === 'active' ? 'text-indigo-400' : 'text-zinc-600'}`}>
                      {agent.description}
                    </p>
                  </div>
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    agent.status === 'active' ? 'bg-indigo-500 animate-pulse' : 'bg-zinc-600'
                  }`} />
                </div>
                {agent.status === 'active' && (
                  <div className="h-0.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <motion.div
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      className="h-full w-1/3 bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent"
                    />
                  </div>
                )}
                {agent.eventsProcessed !== undefined && agent.eventsProcessed > 0 && (
                  <p className="text-[9px] text-zinc-600 mt-1.5">{agent.eventsProcessed} events analyzed</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Network Activity — live, ticks every 2s from real topology data */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Network Activity</label>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] font-mono text-zinc-500">{recentCount} evt/min</span>
            </div>
          </div>
          <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800/50 overflow-hidden px-3 pt-3 pb-2">
            <div className="flex items-end gap-[2px] h-20 relative">
              {/* Reference lines */}
              <div className="absolute inset-0 pointer-events-none flex flex-col justify-between pb-0">
                <div />
                <div className="w-full h-px bg-red-500/10 border-t border-dashed border-red-500/15" />
                <div className="w-full h-px bg-amber-500/8 border-t border-dashed border-amber-500/10" />
                <div />
              </div>
              {liveActivity.map((v, i) => {
                const pct = Math.max(5, Math.min(100, (v / 280) * 100));
                const isLatest = i >= liveActivity.length - 3;
                const color = v > 160 ? [239,68,68] : v > 70 ? [245,158,11] : [16,185,129];
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t-[2px]"
                    style={{
                      height: `${pct}%`,
                      backgroundColor: `rgba(${color[0]},${color[1]},${color[2]},${isLatest ? 0.75 : 0.4})`,
                      transition: 'height 0.6s ease, background-color 0.4s ease',
                      boxShadow: isLatest ? `0 -2px 6px rgba(${color[0]},${color[1]},${color[2]},0.25)` : 'none',
                    }}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[8px] text-zinc-700 font-mono">20m ago</span>
              <span className="text-[8px] text-zinc-500 font-mono">now</span>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-zinc-800/50">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-emerald-500/60" />
                <span className="text-[8px] text-zinc-600">&lt;70ms normal</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-amber-500/60" />
                <span className="text-[8px] text-zinc-600">70–160ms warn</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-red-500/60" />
                <span className="text-[8px] text-zinc-600">&gt;160ms alert</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
};

// ─────────────────────────────────────────────
// AUTH PAGES
// ─────────────────────────────────────────────

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else if (data.session) {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(rgba(16,185,129,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="w-full max-w-md space-y-8 relative">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 mb-6">
            <Shield size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">NEXUS</h1>
          <p className="text-zinc-500 mt-2 text-sm">Operational Command Interface</p>
        </div>
        <div className="p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800/50 backdrop-blur-xl shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center flex items-center gap-2">
                <AlertCircle size={14} /> {error}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Operator ID (Email)</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 transition-colors text-sm"
                placeholder="operator@nexus.internal" required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Access Key</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 transition-colors text-sm"
                placeholder="••••••••" required />
            </div>
            <button disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/20 text-sm mt-2">
              {loading ? 'Authenticating...' : 'Authenticate →'}
            </button>
          </form>
        </div>
        <div className="text-center">
          <Link to="/signup" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            Request Network Access ↗
          </Link>
        </div>
      </div>
    </div>
  );
};

const SignupPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { data, error: authError } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name, title } },
    });
    if (authError) { setError(authError.message); setLoading(false); return; }
    if (data.user) {
      await supabase.from('users').insert([{
        id: data.user.id, email, name, title,
        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`,
        role: 'MEMBER',
      }]);
    }
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'linear-gradient(rgba(16,185,129,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.3) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="w-full max-w-md space-y-8 relative">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 mb-6">
            <Lock size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">NEXUS</h1>
          <p className="text-zinc-500 mt-2 text-sm">Request Network Access</p>
        </div>
        <div className="p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800/50 backdrop-blur-xl shadow-2xl">
          <form onSubmit={handleSignup} className="space-y-4">
            {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">{error}</div>}
            {[
              { label: 'Full Name', val: name, set: setName, type: 'text', ph: 'Alex Chen' },
              { label: 'Job Title', val: title, set: setTitle, type: 'text', ph: 'Principal Engineer' },
              { label: 'Email', val: email, set: setEmail, type: 'email', ph: 'alex@nexus.internal' },
              { label: 'Password', val: password, set: setPassword, type: 'password', ph: '••••••••' },
            ].map(f => (
              <div key={f.label} className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{f.label}</label>
                <input type={f.type} value={f.val} onChange={e => f.set(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 transition-colors text-sm"
                  placeholder={f.ph} required />
              </div>
            ))}
            <button disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/20 text-sm mt-2">
              {loading ? 'Processing...' : 'Initialize Credentials →'}
            </button>
          </form>
        </div>
        <div className="text-center">
          <Link to="/login" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">Already have access? Authenticate</Link>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// AUTH GUARD
// ─────────────────────────────────────────────

const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useNexusStore();
  // null = initializing, false = no session, true = session confirmed
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);

  useEffect(() => {
    // Subscribe to the same onAuthStateChange used by App — INITIAL_SESSION fires
    // synchronously-ish on mount and tells us definitively if a session exists.
    // Avoids a separate getSession() call that can race with the App-level listener.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        setSessionReady(!!session);
      } else if (event === 'SIGNED_IN') {
        setSessionReady(true);
      } else if (event === 'SIGNED_OUT') {
        setSessionReady(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Waiting for INITIAL_SESSION event
  if (sessionReady === null) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Activity className="text-emerald-500 animate-pulse" size={32} />
          <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest">Verifying Identity...</p>
        </div>
      </div>
    );
  }

  // Definitive: no session
  if (!sessionReady) return <Navigate to="/login" replace />;

  // Session confirmed — render. currentUser is already set provisionally by App.
  return <>{children}</>;
};

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────

type View = 'stream' | 'health' | 'personnel' | 'incidents' | 'timeline';

const Dashboard = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const { events, loading } = useEvents(roomId);
  const { rooms } = useRooms();
  const { currentUser, replayTime, setReplayTime } = useNexusStore();
  const [input, setInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const { incidents } = useIncidents();
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive active view purely from URL — no Zustand, no race conditions
  const activeView: View = (() => {
    if (roomId) return 'stream';
    if (location.pathname === '/health')    return 'health';
    if (location.pathname === '/personnel') return 'personnel';
    if (location.pathname === '/incidents') return 'incidents';
    if (location.pathname === '/timeline')  return 'timeline';
    return 'stream';
  })();

  useEffect(() => {
    const cleanup = setupAgentEngine();
    seedInitialData();
    return cleanup;
  }, []);

  // Keyboard shortcut ⌘K to focus input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const globalRoom = rooms.find(r => r.name === 'global');
    const targetRoomId = roomId || globalRoom?.id;
    if (!targetRoomId) return;
    const cmdInput = input;
    setInput('');
    await handleCommand(cmdInput, targetRoomId, currentUser?.name || 'Anonymous', currentUser?.id, currentUser?.role);
  };

  const globalRoom = rooms.find(r => r.name === 'global');
  const currentRoomName = roomId ? (rooms.find(r => r.id === roomId)?.name || 'unknown') : 'global';
  const openIncidents = incidents.filter(i => i.status === 'OPEN').length;



  return (
    <div className="h-screen bg-zinc-950 text-zinc-200 flex overflow-hidden font-sans selection:bg-emerald-500/30">
      {/* ── LEFT SIDEBAR ── */}
      <aside className="w-60 border-r border-zinc-800/50 bg-zinc-950/80 flex flex-col flex-shrink-0">
        <div className="p-5 border-b border-zinc-800/50 flex items-center gap-3">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-black shadow-lg shadow-emerald-500/30">
              <Shield size={18} />
            </div>
            <div>
              <p className="font-bold tracking-tight text-white text-sm">NEXUS</p>
              <p className="text-[9px] text-zinc-500 font-mono">OPS COMMAND</p>
            </div>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-6 custom-scrollbar">
          <section>
            <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.2em] px-3 mb-2 block">Network</label>
            <div className="space-y-0.5">
              <SidebarItem icon={Globe}     label="Global Stream" active={activeView === 'stream' && !roomId} to="/dashboard" badge="LIVE" />
              <SidebarItem icon={Activity}  label="System Health" active={activeView === 'health'}            to="/health" />
              <SidebarItem icon={Users}     label="Personnel"     active={activeView === 'personnel'}         to="/personnel" />
              {currentUser?.role === 'OWNER' && (
                <SidebarItem icon={Clock} label="Ops Timeline" active={activeView === 'timeline'} to="/timeline" badge="OWNER" />
              )}
            </div>
          </section>

          <section>
            <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.2em] px-3 mb-2 block">Channels</label>
            <div className="space-y-0.5">
              {rooms.filter(r => r.type !== 'INCIDENT').map(room => {
                const roomIcon = room.type === 'DEPLOYMENTS' ? Zap : room.type === 'OPS' ? Server : Globe;
                return (
                  <SidebarItem
                    key={room.id}
                    icon={roomIcon}
                    label={`# ${room.name}`}
                    active={roomId === room.id}
                    to={`/room/${room.id}`}
                  />
                );
              })}
              {canDo(currentUser?.role, 'CREATE_ROOM') && (
                <button
                  onClick={async () => {
                    const name = prompt('Channel name:');
                    if (!name) return;
                    const globalRoom = rooms.find(r => r.name === 'global');
                    if (globalRoom) handleCommand(`/room create ${name} OPS`, globalRoom.id, currentUser?.name || 'Admin', currentUser?.id, currentUser?.role);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  <span className="text-lg leading-none">+</span> New Channel
                </button>
              )}
            </div>
          </section>

          <section>
            <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-[0.2em] px-3 mb-2 block">Incidents</label>
            <div className="space-y-0.5">
              <SidebarItem
                icon={AlertTriangle}
                label="All Incidents"
                active={activeView === 'incidents'}
                to="/incidents"
                badge={openIncidents > 0 ? 'P1' : undefined}
              />
              {rooms.filter(r => r.type === 'INCIDENT').map(room => (
                <SidebarItem
                  key={room.id}
                  icon={AlertTriangle}
                  label={room.name.slice(0, 22)}
                  active={roomId === room.id}
                  to={`/room/${room.id}`}
                  badge="P1"
                />
              ))}
              {rooms.filter(r => r.type === 'INCIDENT').length === 0 && (
                <p className="px-3 text-[10px] text-zinc-600 italic">No active incidents</p>
              )}
            </div>
          </section>
        </div>

        {/* User footer */}
        <div className="p-3 border-t border-zinc-800/50">
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/50">
            <img
              src={currentUser?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.name}`}
              className="w-8 h-8 rounded-lg bg-zinc-800"
              alt=""
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">{currentUser?.name || 'New User'}</p>
              <div className="flex items-center gap-1">
                <p className="text-[9px] text-zinc-500 truncate">{currentUser?.title || 'Operator'}</p>
                <Badge label={currentUser?.role || 'MEMBER'} variant={
                  currentUser?.role === 'OWNER' ? 'red' :
                  currentUser?.role === 'ADMIN' ? 'indigo' :
                  currentUser?.role === 'OPERATOR' ? 'amber' : 'zinc'
                } />
              </div>
            </div>
            <button onClick={() => supabase.auth.signOut()} className="text-zinc-600 hover:text-red-400 transition-colors">
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>

      {/* ── CENTER MAIN ── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 border-b border-zinc-800/50 flex items-center justify-between px-5 bg-zinc-950/80 backdrop-blur-xl z-10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-white text-sm">
              {roomId ? `# ${currentRoomName}` : activeView === 'health' ? 'System Health' : activeView === 'personnel' ? 'Personnel' : activeView === 'incidents' ? 'Incidents' : activeView === 'timeline' ? 'Operations Timeline' : 'Global Stream'}
            </h2>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-500 text-[9px] font-bold border border-emerald-500/20">
              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              LIVE
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input
                placeholder="Search events..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-zinc-900/50 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-zinc-700 w-40 text-zinc-300"
              />
            </div>
          </div>
        </header>

        {/* Dynamic content area */}
        <div className="flex-1 flex flex-col min-h-0">
          <AnimatePresence mode="wait">
            {(activeView === 'stream' || roomId) && (
              <motion.div key="stream" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
                <EventStreamView events={events} loading={loading} replayTime={replayTime} onSearch={setSearchQuery} />
              </motion.div>
            )}
            {activeView === 'health' && !roomId && (
              <motion.div key="health" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
                <SystemHealthView />
              </motion.div>
            )}
            {activeView === 'personnel' && !roomId && (
              <motion.div key="personnel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
                <PersonnelView />
              </motion.div>
            )}
            {activeView === 'incidents' && !roomId && (
              <motion.div key="incidents" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
                <IncidentsView />
              </motion.div>
            )}
            {activeView === 'timeline' && !roomId && currentUser?.role === 'OWNER' && (
              <motion.div key="timeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col min-h-0">
                <OperationsTimelineView />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Command Input — always visible */}
        <div className="flex-shrink-0 px-5 pb-4 pt-2 bg-gradient-to-t from-zinc-950 via-zinc-950/90 to-transparent">
          <form onSubmit={handleSend} className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-indigo-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
            <div className="relative flex items-center bg-zinc-900 border border-zinc-800 group-focus-within:border-zinc-700 rounded-2xl p-2 shadow-2xl transition-colors">
              <div className="p-2 text-zinc-600">
                <Command size={16} />
              </div>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Type a message or /command... (try /help)"
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-white px-2 py-1.5 placeholder-zinc-600"
              />
              <div className="flex items-center gap-2 px-2">
                <span className="text-[9px] font-bold text-zinc-700 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700/50 font-mono">
                  ⌘K
                </span>
                <button type="submit" disabled={!input.trim()} className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </form>

          {/* Replay scrubber */}
          <div className="mt-3 flex items-center gap-3 px-1">
            <button onClick={() => setReplayTime(replayTime === 100 ? 0 : 100)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
              {replayTime === 100 ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <History size={13} className="text-zinc-700" />
            <div className="flex-1 h-0.5 bg-zinc-800 rounded-full relative group cursor-pointer">
              <div className="absolute inset-y-0 left-0 bg-emerald-500/70 rounded-full" style={{ width: `${replayTime}%` }} />
              <input
                type="range" min="0" max="100" value={replayTime}
                onChange={e => setReplayTime(parseInt(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
            <span className="text-[9px] font-mono text-zinc-600 w-8 text-right">{replayTime}%</span>
          </div>
        </div>
      </main>

      {/* ── RIGHT PANEL ── */}
      <RightPanel events={events} />
    </div>
  );
};

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────

const App = () => {
  const { setCurrentUser } = useNexusStore();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    // Two-phase user hydration:
    // Phase 1 — set provisional user immediately from JWT metadata (synchronous-feel)
    // Phase 2 — enrich asynchronously from public.users table
    const hydrateUser = async (authUser: any) => {
      // Phase 1: instant — unblocks AuthGuard immediately
      setCurrentUser({
        id: authUser.id,
        name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Operator',
        role: 'OPERATOR',
        title: authUser.user_metadata?.title || 'Operator',
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${authUser.id}`,
        email: authUser.email,
      });

      // Phase 2: async DB enrichment — runs after render, no blocking
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (profile) {
          setCurrentUser({
            id: profile.id,
            name: profile.name,
            role: (profile.role || 'OPERATOR') as any,
            title: profile.title || 'Operator',
            avatar: profile.avatar_url,
            email: profile.email,
          });
        }
      } catch {
        // Provisional user already set — safe to ignore
      }
    };

    // Single source of truth: onAuthStateChange fires INITIAL_SESSION on mount,
    // SIGNED_IN on login, SIGNED_OUT on logout. No need for a separate getSession() call.
    // This avoids double-invocation that causes the Web Locks AbortError.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setCurrentUser(null);
        return;
      }
      // Runs for: INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, USER_UPDATED
      hydrateUser(session.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
        <Route path="/health" element={<AuthGuard><Dashboard /></AuthGuard>} />
        <Route path="/personnel" element={<AuthGuard><Dashboard /></AuthGuard>} />
        <Route path="/incidents" element={<AuthGuard><Dashboard /></AuthGuard>} />
        <Route path="/timeline" element={<AuthGuard><Dashboard /></AuthGuard>} />
        <Route path="/room/:roomId" element={<AuthGuard><Dashboard /></AuthGuard>} />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
