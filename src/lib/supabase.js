import { createClient } from '@supabase/supabase-js';

// Public values only. The publishable key is designed to live in the browser; real protection is the database rules (RLS).
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const configured = Boolean(url && key);
export const supabase = configured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
