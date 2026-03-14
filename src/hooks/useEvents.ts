import { useEffect, useState, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

export interface NexusEvent {
  id: string;
  type: string;
  room_id: string;
  user_name: string;
  content: string;
  metadata: any;
  created_at: string;
}

export function useEvents(roomId?: string) {
  const [events, setEvents] = useState<NexusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchEvents = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('events')
          .select('*')
          .order('created_at', { ascending: true })
          .limit(200);

        if (roomId) {
          query = query.eq('room_id', roomId);
        }

        const { data, error } = await query;
        if (!isMounted) return;
        if (error) console.error('Error fetching events:', error);
        else setEvents(data || []);
      } catch (err) {
        console.error('Failed to fetch events:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchEvents();

    // Clean up old channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channelName = `events-${roomId || 'global'}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'events',
          filter: roomId ? `room_id=eq.${roomId}` : undefined,
        },
        (payload) => {
          if (!isMounted) return;
          const newEvent = payload.new as NexusEvent;
          setEvents((prev) => {
            // Avoid duplicates
            if (prev.some(e => e.id === newEvent.id)) return prev;
            return [...prev, newEvent];
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  return { events, loading };
}

export function usePersonnel() {
  const [personnel, setPersonnel] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }
    supabase.from('users').select('*').order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setPersonnel(data);
        setLoading(false);
      });
  }, []);

  return { personnel, loading };
}

export function useIncidents() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }

    const fetch = async () => {
      const { data, error } = await supabase
        .from('incidents')
        .select('*, rooms(name)')
        .order('created_at', { ascending: false });
      if (!error && data) setIncidents(data);
      setLoading(false);
    };
    fetch();

    const channel = supabase.channel('incidents-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { incidents, loading };
}

export function useRooms() {
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured()) { setLoading(false); return; }

    const fetch = async () => {
      const { data, error } = await supabase.from('rooms').select('*').order('created_at');
      if (!error && data) setRooms(data);
      setLoading(false);
    };
    fetch();

    const channel = supabase.channel('rooms-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { rooms, loading };
}
