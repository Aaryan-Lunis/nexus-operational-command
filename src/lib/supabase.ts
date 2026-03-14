import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || 'https://sawtdfojdqqgvpzcprwrz.supabase.co';
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_pNvTDBYwz5I_V5dqJI_hPQ_b0Vrolr-';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
