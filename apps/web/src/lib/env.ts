/** True when the public Supabase env is configured (lets pages render a setup
 * notice instead of crashing before the anon key is set during local setup). */
export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
