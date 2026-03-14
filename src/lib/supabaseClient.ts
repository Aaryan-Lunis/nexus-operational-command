import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || 'https://sawtdfojdqgqvpzcpwrz.supabase.co';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_pNvTDBYwz5I_V5dqJI_hPQ_b0Vrolr-';

export const isSupabaseConfigured = () => {
  return !!(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('http'));
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Prevents Supabase from trying to parse OAuth tokens from the URL
    // which causes a second auth flow and lock collision in dev
    detectSessionInUrl: false,
    // Use PKCE — more robust than implicit, avoids token-reuse on double mount
    flowType: 'pkce',
    // Keep session in localStorage so page refreshes don't re-authenticate
    persistSession: true,
    // Explicit storage key avoids conflicts if multiple Supabase instances exist
    storageKey: 'nexus-auth-token',
    // Suppress the Web Locks warning spam in dev
    lock: undefined,
  },
  realtime: {
    params: { eventsPerSecond: 20 },
  },
});
