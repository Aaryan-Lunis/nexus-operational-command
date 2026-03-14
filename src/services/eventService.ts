import { supabase } from '../lib/supabaseClient';
import { canDo, Role } from '../store/useNexusStore';

export interface SendEventParams {
  type: string;
  roomId: string;
  userName: string;
  content: string;
  userId?: string;
  metadata?: any;
}

export async function sendEvent({ type, roomId, userName, content, userId, metadata = {} }: SendEventParams) {
  const { data, error } = await supabase
    .from('events')
    .insert([{ type, room_id: roomId, user_name: userName, user_id: userId || null, content, metadata }])
    .select()
    .single();

  if (error) {
    console.error('Error sending event:', error);
    return null;
  }
  return data;
}

// ── Permission denial helper ──────────────────────────────────────────────────
async function denyPermission(roomId: string, userName: string, command: string, requiredRoles: string[]) {
  return sendEvent({
    type: 'PERMISSION_DENIED',
    roomId,
    userName: 'SYSTEM',
    content: `🚫 Permission denied: [${command}] requires ${requiredRoles.join(' or ')}. Your role does not allow this action.`,
    metadata: { command, required_roles: requiredRoles, attempted_by: userName },
  });
}

// ── Main command handler ──────────────────────────────────────────────────────
export async function handleCommand(
  input: string,
  roomId: string,
  userName: string,
  userId?: string,
  userRole?: Role
) {
  const trimmed = input.trim();
  if (!trimmed) return;

  // Plain message — any role can send
  if (!trimmed.startsWith('/')) {
    if (!canDo(userRole, 'SEND_MESSAGE')) {
      return denyPermission(roomId, userName, 'message', ['MEMBER', 'OPERATOR', 'ADMIN', 'OWNER']);
    }
    return sendEvent({ type: 'MESSAGE_SENT', roomId, userName, userId, content: trimmed });
  }

  const parts = trimmed.split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  // Log command execution event
  await sendEvent({ type: 'COMMAND_EXECUTED', roomId, userName, userId, content: trimmed, metadata: { role: userRole } });

  switch (command) {

    // ── /incident ── OPERATOR+ ────────────────────────────────────────────────
    case '/incident': {
      if (!canDo(userRole, 'CREATE_INCIDENT')) {
        return denyPermission(roomId, userName, '/incident', ['OPERATOR', 'ADMIN', 'OWNER']);
      }
      const target = args[0] || 'unknown-service';
      const reason = args.slice(1).join(' ') || 'Anomaly detected';

      const { data: newRoom } = await supabase
        .from('rooms')
        .insert([{ name: `INC-${target.toUpperCase()}-${Date.now()}`, type: 'INCIDENT', status: 'CRITICAL' }])
        .select()
        .single();

      const { data: incident } = await supabase
        .from('incidents')
        .insert([{ title: `Incident: ${target}`, severity: 'P1', status: 'OPEN', room_id: newRoom?.id }])
        .select()
        .single();

      return sendEvent({
        type: 'INCIDENT_CREATED',
        roomId,
        userName: 'SYSTEM',
        content: `🚨 CRITICAL: Incident opened for [${target}]. Reason: ${reason}`,
        metadata: { target, reason, incident_id: incident?.id, incident_room_id: newRoom?.id, severity: 'P1', status: 'OPEN' },
      });
    }

    // ── /investigate ── OPERATOR+ ─────────────────────────────────────────────
    case '/investigate': {
      if (!canDo(userRole, 'INVESTIGATE')) {
        return denyPermission(roomId, userName, '/investigate', ['OPERATOR', 'ADMIN', 'OWNER']);
      }
      const incidentId = args[0];
      if (incidentId) {
        await supabase.from('incidents').update({ status: 'INVESTIGATING' }).eq('id', incidentId);
      }
      return sendEvent({
        type: 'INCIDENT_UPDATED',
        roomId,
        userName: 'SYSTEM',
        content: `🔍 Incident status updated to INVESTIGATING by ${userName}. Team is actively diagnosing.`,
        metadata: { incident_id: incidentId, status: 'INVESTIGATING', updated_by: userName },
      });
    }

    // ── /mitigate ── OPERATOR+ ────────────────────────────────────────────────
    case '/mitigate': {
      if (!canDo(userRole, 'INVESTIGATE')) {
        return denyPermission(roomId, userName, '/mitigate', ['OPERATOR', 'ADMIN', 'OWNER']);
      }
      const incidentId = args[0];
      if (incidentId) {
        await supabase.from('incidents').update({ status: 'MITIGATING' }).eq('id', incidentId);
      }
      return sendEvent({
        type: 'INCIDENT_UPDATED',
        roomId,
        userName: 'SYSTEM',
        content: `🛡️ Incident status updated to MITIGATING by ${userName}. Mitigation steps in progress.`,
        metadata: { incident_id: incidentId, status: 'MITIGATING', updated_by: userName },
      });
    }

    // ── /resolve ── ADMIN+ ────────────────────────────────────────────────────
    case '/resolve': {
      if (!canDo(userRole, 'RESOLVE_INCIDENT')) {
        return denyPermission(roomId, userName, '/resolve', ['ADMIN', 'OWNER']);
      }
      const incidentId = args[0];
      if (incidentId) {
        await supabase.from('incidents').update({ status: 'RESOLVED' }).eq('id', incidentId);
      }
      return sendEvent({
        type: 'INCIDENT_UPDATED',
        roomId,
        userName: 'SYSTEM',
        content: `✅ Incident RESOLVED by ${userName}. Post-mortem scheduled. All clear.`,
        metadata: { incident_id: incidentId, status: 'RESOLVED', resolved_by: userName },
      });
    }

    // ── /scan ── OPERATOR+ ────────────────────────────────────────────────────
    case '/scan': {
      if (!canDo(userRole, 'CMD_SCAN')) {
        return denyPermission(roomId, userName, '/scan', ['OPERATOR', 'ADMIN', 'OWNER']);
      }
      const target = args[0] || 'network';
      await sendEvent({
        type: 'SYSTEM_EVENT',
        roomId,
        userName: 'NetworkAgent',
        content: `🔍 Scan initiated on [${target}] by ${userName}. Probing all endpoints...`,
        metadata: { target, scan_type: 'full', initiated_by: userName },
      });
      setTimeout(async () => {
        const latency = Math.round(Math.random() * 80 + 8);
        await sendEvent({
          type: 'AGENT_ALERT',
          roomId,
          userName: 'NetworkAgent',
          content: `✅ Scan complete for [${target}]. All endpoints reachable. Avg latency ${latency}ms. No anomalies detected.`,
          metadata: { target, result: 'clean', avg_latency: latency, services_checked: 4 },
        });
      }, 2500);
      return;
    }

    // ── /status ── MEMBER+ ────────────────────────────────────────────────────
    case '/status': {
      if (!canDo(userRole, 'CMD_STATUS')) {
        return denyPermission(roomId, userName, '/status', ['MEMBER', 'OPERATOR', 'ADMIN', 'OWNER']);
      }
      const service = args[0] || 'all';
      const latency = Math.round(Math.random() * 60 + 5);
      return sendEvent({
        type: 'SYSTEM_EVENT',
        roomId,
        userName: 'SYSTEM',
        content: `📊 Status [${service}]: Operational. Latency ${latency}ms. No active incidents.`,
        metadata: { service, status: 'nominal', latency },
      });
    }

    // ── /deploy ── OPERATOR+ ──────────────────────────────────────────────────
    case '/deploy': {
      if (!canDo(userRole, 'CMD_DEPLOY')) {
        return denyPermission(roomId, userName, '/deploy', ['OPERATOR', 'ADMIN', 'OWNER']);
      }
      const service = args[0] || 'production';
      const version = args[1] || 'latest';
      await sendEvent({
        type: 'SYSTEM_EVENT',
        roomId,
        userName: 'DEPLOY_BOT',
        content: `🚀 Deployment of [${service}@${version}] initiated by ${userName}. Rolling update in progress...`,
        metadata: { service, version, status: 'started', initiated_by: userName },
      });
      setTimeout(async () => {
        await sendEvent({
          type: 'SYSTEM_EVENT',
          roomId,
          userName: 'DEPLOY_BOT',
          content: `✅ Deployment of [${service}@${version}] complete. Health checks passing. Rollout: 100%`,
          metadata: { service, version, status: 'success' },
        });
      }, 4000);
      return;
    }

    // ── /rollback ── OPERATOR+ ────────────────────────────────────────────────
    case '/rollback': {
      if (!canDo(userRole, 'CMD_ROLLBACK')) {
        return denyPermission(roomId, userName, '/rollback', ['OPERATOR', 'ADMIN', 'OWNER']);
      }
      const service = args[0] || 'last-deploy';
      return sendEvent({
        type: 'SYSTEM_EVENT',
        roomId,
        userName: 'DEPLOY_BOT',
        content: `⏪ Rollback initiated for [${service}] by ${userName}. Reverting to last stable build.`,
        metadata: { service, initiated_by: userName },
      });
    }

    // ── /alert ── OPERATOR+ ───────────────────────────────────────────────────
    case '/alert': {
      if (!canDo(userRole, 'CMD_ALERT')) {
        return denyPermission(roomId, userName, '/alert', ['OPERATOR', 'ADMIN', 'OWNER']);
      }
      const message = args.join(' ') || 'Manual alert triggered';
      return sendEvent({
        type: 'AGENT_ALERT',
        roomId,
        userName: 'IncidentAgent',
        content: `⚠️ MANUAL ALERT from ${userName}: ${message}`,
        metadata: { triggered_by: userName, manual: true, role: userRole },
      });
    }

    // ── /room ── ADMIN+ ───────────────────────────────────────────────────────
    case '/room': {
      if (!canDo(userRole, 'CREATE_ROOM')) {
        return denyPermission(roomId, userName, '/room', ['ADMIN', 'OWNER']);
      }
      const subCmd = args[0];
      const roomName = args[1];
      if (subCmd === 'create' && roomName) {
        const roomType = (args[2] || 'OPS').toUpperCase();
        const { data: created } = await supabase
          .from('rooms')
          .insert([{ name: roomName, type: roomType, status: 'OPERATIONAL', description: `Created by ${userName}` }])
          .select()
          .single();
        return sendEvent({
          type: 'SYSTEM_EVENT',
          roomId,
          userName: 'SYSTEM',
          content: `🏗️ Room [#${roomName}] created by ${userName} (type: ${roomType})`,
          metadata: { room_id: created?.id, room_name: roomName, type: roomType, created_by: userName },
        });
      }
      return sendEvent({
        type: 'SYSTEM_ERROR',
        roomId, userName: 'SYSTEM',
        content: `Usage: /room create [name] [type]   Types: GENERAL, OPS, INCIDENT, DEPLOYMENTS`,
      });
    }

    // ── /help ── everyone ─────────────────────────────────────────────────────
    case '/help': {
      const role = userRole || 'MEMBER';
      const cmds = [
        '/status [service]             — check service status (all roles)',
        '/help                          — show this list (all roles)',
        canDo(userRole, 'CMD_SCAN')     ? '/scan [target]                — scan network (OPERATOR+)' : null,
        canDo(userRole, 'CMD_ALERT')    ? '/alert [message]              — broadcast alert (OPERATOR+)' : null,
        canDo(userRole, 'CMD_DEPLOY')   ? '/deploy [service] [version]  — rolling deploy (OPERATOR+)' : null,
        canDo(userRole, 'CMD_ROLLBACK') ? '/rollback [service]           — revert deploy (OPERATOR+)' : null,
        canDo(userRole, 'CREATE_INCIDENT') ? '/incident [svc] [reason]  — open P1 incident (OPERATOR+)' : null,
        canDo(userRole, 'INVESTIGATE')  ? '/investigate [id]             — set INVESTIGATING (OPERATOR+)' : null,
        canDo(userRole, 'INVESTIGATE')  ? '/mitigate [id]                — set MITIGATING (OPERATOR+)' : null,
        canDo(userRole, 'RESOLVE_INCIDENT') ? '/resolve [id]             — resolve incident (ADMIN+)' : null,
        canDo(userRole, 'CREATE_ROOM')  ? '/room create [name] [type]   — create channel (ADMIN+)' : null,
      ].filter(Boolean);

      return sendEvent({
        type: 'SYSTEM_EVENT',
        roomId, userName: 'SYSTEM',
        content: `📖 Commands available to [${role}]:\n${cmds.join('\n')}`,
        metadata: { type: 'help', role, command_count: cmds.length },
      });
    }

    // ── unknown ───────────────────────────────────────────────────────────────
    default:
      return sendEvent({
        type: 'SYSTEM_ERROR',
        roomId, userName: 'SYSTEM',
        content: `❌ Unknown command: ${command}. Type /help to see available commands.`,
        metadata: { command, attempted_by: userName },
      });
  }
}
