import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // In dev, this helps you notice misconfiguration quickly.
  // In production you should ensure these are set in the environment.
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase URL or anon key is not set. Auth and database features will not work.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
