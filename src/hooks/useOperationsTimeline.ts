import { useEffect, useState, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import { NexusEvent } from './useEvents';

// Event types that belong in the audit/operations timeline
const TIMELINE_TYPES = new Set([
  'COMMAND_EXECUTED',
  'AGENT_ALERT',
  'SYSTEM_EVENT',
  'INCIDENT_CREATED',
  'INCIDENT_UPDATED',
  'PERMISSION_DENIED',
]);

export type TimelineCategory = 'command' | 'agent' | 'system' | 'incident' | 'denied';

export interface TimelineEntry extends NexusEvent {
  category: TimelineCategory;
}

function categorize(type: string): TimelineCategory {
  if (type === 'COMMAND_EXECUTED')                    return 'command';
  if (type === 'AGENT_ALERT')                         return 'agent';
  if (type === 'INCIDENT_CREATED' || type === 'INCIDENT_UPDATED') return 'incident';
  if (type === 'PERMISSION_DENIED')                   return 'denied';
  return 'system';
}

export function useOperationsTimeline(limit = 50) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading]  = useState(true);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }

    let mounted = true;

    // ── Initial fetch: last `limit` relevant events across ALL rooms ──────────
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .in('type', [...TIMELINE_TYPES])
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!mounted) return;
      if (!error && data) {
        setEntries(
          data.map(e => ({ ...e, category: categorize(e.type) }))
        );
      }
      setLoading(false);
    };

    fetch();

    // ── Realtime: prepend new relevant events ────────────────────────────────
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel('ops-timeline')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events' },
        (payload) => {
          const ev = payload.new as NexusEvent;
          if (!mounted || !TIMELINE_TYPES.has(ev.type)) return;
          setEntries(prev => {
            if (prev.some(e => e.id === ev.id)) return prev;
            return [{ ...ev, category: categorize(ev.type) }, ...prev].slice(0, limit);
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [limit]);

  return { entries, loading };
}
