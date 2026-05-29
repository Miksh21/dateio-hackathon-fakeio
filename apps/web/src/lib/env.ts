/** True when the public Supabase env is configured (lets pages render a setup
 * notice instead of crashing before the anon key is set during local setup). */
export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** n8n "feedback-chat" webhook config for the RAG chat. SERVER-ONLY — these are
 * never NEXT_PUBLIC_ and must not reach the browser (the secret authenticates the
 * webhook). Read only inside the /api/chat route handler. Returns null when not
 * configured so the route can degrade gracefully. */
export function getChatWebhookConfig(): { url: string; secret: string } | null {
  const url = process.env.N8N_CHAT_WEBHOOK_URL;
  const secret = process.env.N8N_CHAT_SECRET;
  if (!url || !secret) return null;
  return { url, secret };
}
