import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client. Created lazily by client components so pages still
// render if the anon key isn't set yet during local setup.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
