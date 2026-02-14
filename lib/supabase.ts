import { createClient } from '@supabase/supabase-js';

import { supabaseStorage } from '@/lib/supabase-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variables Supabase manquantes dans .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: supabaseStorage,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
