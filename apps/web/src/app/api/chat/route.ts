import { NextResponse, type NextRequest } from "next/server";
import { getCurrentEmployee } from "@/lib/auth";
import { getChatWebhookConfig } from "@/lib/env";

// Server-only proxy for the privacy-scoped feedback chat.
//
// SECURITY (the whole point): the asker identity is taken from the authenticated
// Supabase SESSION (getCurrentEmployee → employees row), NEVER from the request
// body. A client cannot ask "as" someone else. We then call the n8n
// `feedback-chat` webhook with a shared secret (server-side env, never exposed to
// the browser). n8n embeds the question, runs chat_search(asker, cycle, …) which
// HARD-filters to the asker's entitled recipients, and returns a grounded answer.
//
// The active published cycle id. Matches the constant used by the app pages.
const ACTIVE_CYCLE = "cccccccc-cccc-cccc-cccc-cccccccccccc";

export async function POST(request: NextRequest) {
  // 1. Identify the asker from the session — the trust anchor.
  const me = await getCurrentEmployee();
  if (!me) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // 2. Parse the question (cycle_id is server-pinned; never trust a client id for
  //    the asker, and default the cycle to the active one).
  let question = "";
  let cycleId = ACTIVE_CYCLE;
  try {
    const body = await request.json();
    question = typeof body?.question === "string" ? body.question.trim() : "";
    if (typeof body?.cycle_id === "string" && body.cycle_id) cycleId = body.cycle_id;
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  // 3. Resolve the webhook config (server-only).
  const cfg = getChatWebhookConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Chat is not configured on this server (missing N8N_CHAT_WEBHOOK_URL / N8N_CHAT_SECRET)." },
      { status: 503 },
    );
  }

  // 4. Call n8n. The instance is VPN-only, so handle unreachable gracefully.
  let upstream: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    upstream = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asker_id: me.id, // session-verified — the only id we trust
        cycle_id: cycleId,
        question,
        secret: cfg.secret,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
  } catch {
    // Network error / abort — almost always the VPN-only n8n being unreachable.
    return NextResponse.json(
      {
        error:
          "The chat service is currently unreachable. It runs on the internal network — check that the VPN is connected and try again.",
      },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: "The chat service returned an error. Please try again in a moment." },
      { status: 502 },
    );
  }

  let data: { answer?: string; used_chunks?: number } = {};
  try {
    data = await upstream.json();
  } catch {
    return NextResponse.json(
      { error: "The chat service returned an unexpected response." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    answer: typeof data.answer === "string" ? data.answer : "",
    used_chunks: typeof data.used_chunks === "number" ? data.used_chunks : 0,
  });
}
