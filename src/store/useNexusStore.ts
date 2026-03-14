import { create } from 'zustand';

export type Role = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'MEMBER';

// Permission matrix — maps roles to allowed actions
export const PERMISSIONS = {
  // Room management
  CREATE_ROOM:      ['OWNER', 'ADMIN'],
  DELETE_ROOM:      ['OWNER'],
  // User management
  MANAGE_USERS:     ['OWNER', 'ADMIN'],
  // Incident management
  CREATE_INCIDENT:  ['OWNER', 'ADMIN', 'OPERATOR'],
  RESOLVE_INCIDENT: ['OWNER', 'ADMIN'],
  INVESTIGATE:      ['OWNER', 'ADMIN', 'OPERATOR'],
  // Commands
  CMD_DEPLOY:       ['OWNER', 'ADMIN', 'OPERATOR'],
  CMD_ROLLBACK:     ['OWNER', 'ADMIN', 'OPERATOR'],
  CMD_SCAN:         ['OWNER', 'ADMIN', 'OPERATOR'],
  CMD_STATUS:       ['OWNER', 'ADMIN', 'OPERATOR', 'MEMBER'],
  CMD_ALERT:        ['OWNER', 'ADMIN', 'OPERATOR'],
  CMD_HELP:         ['OWNER', 'ADMIN', 'OPERATOR', 'MEMBER'],
  // Messaging
  SEND_MESSAGE:     ['OWNER', 'ADMIN', 'OPERATOR', 'MEMBER'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function canDo(role: Role | undefined, action: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[action] as readonly string[]).includes(role);
}

export interface NexusUser {
  id: string;
  name: string;
  role: Role;
  avatar?: string;
  title?: string;
  email?: string;
  status?: 'online' | 'away' | 'offline';
  created_at?: string;
}

export interface TopologyNode {
  id: string;
  status: 'stable' | 'warning' | 'critical';
  latency: number;
  last_check?: string;
  uptime?: number;
}

export interface TopologyEdge {
  from: string;
  to: string;
}

export interface Agent {
  id: string;
  name: string;
  status: 'active' | 'standby' | 'error';
  description: string;
  lastAction?: string;
  eventsProcessed?: number;
}

interface NexusState {
  currentUser: NexusUser | null;
  topology: { nodes: TopologyNode[]; edges: TopologyEdge[] };
  agents: Agent[];
  personnel: NexusUser[];
  replayTime: number;
  activeView: string;
  networkActivity: number[];

  setCurrentUser: (user: NexusUser | null) => void;
  setTopology: (topology: any) => void;
  updateNodeStatus: (nodeId: string, status: TopologyNode['status'], latency?: number) => void;
  setAgents: (agents: Agent[]) => void;
  updateAgent: (agentId: string, updates: Partial<Agent>) => void;
  setPersonnel: (personnel: NexusUser[]) => void;
  setReplayTime: (time: number) => void;
  setActiveView: (view: string) => void;
  pushNetworkActivity: (value: number) => void;
}

export const useNexusStore = create<NexusState>((set) => ({
  currentUser: null,
  topology: {
    nodes: [
      { id: 'edge-gateway-01', status: 'stable', latency: 24, uptime: 99.98 },
      { id: 'auth-service-cluster', status: 'stable', latency: 12, uptime: 99.99 },
      { id: 'payment-processor', status: 'stable', latency: 45, uptime: 99.95 },
      { id: 'nexus-core-db', status: 'stable', latency: 8, uptime: 100 },
    ],
    edges: [],
  },
  agents: [
    { id: 'incident-agent', name: 'IncidentAgent', status: 'active', description: 'Monitoring Events', eventsProcessed: 0 },
    { id: 'security-agent', name: 'SecurityAgent', status: 'standby', description: 'Standby', eventsProcessed: 0 },
    { id: 'network-agent', name: 'NetworkAgent', status: 'active', description: 'Scanning Topology', eventsProcessed: 0 },
  ],
  personnel: [],
  replayTime: 100,
  activeView: 'stream',
  // Realistic network activity baseline: low with periodic spikes, seeded from time
  networkActivity: Array.from({ length: 40 }, (_, i) => {
    const base = 22; // ~avg latency baseline
    const wave = Math.sin(i * 0.4) * 12; // gentle sine wave
    const noise = (Math.sin(i * 2.7 + 1) * 6); // high-freq noise
    const spike = (i === 8 || i === 22 || i === 31) ? 85 : 0; // realistic spikes
    return Math.max(4, Math.round(base + wave + noise + spike));
  }),

  setCurrentUser: (user) => set({ currentUser: user }),
  setTopology: (topology) => set({ topology }),
  updateNodeStatus: (nodeId, status, latency) =>
    set((state) => ({
      topology: {
        ...state.topology,
        nodes: state.topology.nodes.map((n) =>
          n.id === nodeId
            ? { ...n, status, latency: latency ?? n.latency, last_check: new Date().toISOString() }
            : n
        ),
      },
    })),
  setAgents: (agents) => set({ agents }),
  updateAgent: (agentId, updates) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === agentId ? { ...a, ...updates } : a)),
    })),
  setPersonnel: (personnel) => set({ personnel }),
  setReplayTime: (time) => set({ replayTime: time }),
  setActiveView: (view) => set({ activeView: view }),
  pushNetworkActivity: (value) =>
    set((state) => ({
      networkActivity: [...state.networkActivity.slice(1), value],
    })),
}));
