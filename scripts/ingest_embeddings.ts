#!/usr/bin/env -S deno run -A
// ingest_embeddings.ts — Step 1 of the RAG pipeline.
//
// For each recipient in a cycle who has enough responses (≥ anon_min_responses),
// this script:
//   1. Pulls structured feedback from the `feedback_ingestion_payload` RPC.
//   2. Builds one chunk per (question × assignment_type) — concatenating all
//      anonymized text responses for that group into a single chunk_text.
//   3. Prepends proportionality context ("X of Y peers wrote:") so the
//      chunk itself carries frequency signal that survives retrieval.
//   4. Embeds each chunk with text-embedding-3-small (OpenAI, 1536 dims).
//   5. Upserts into feedback_chunks (idempotent: re-running is safe).
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... OPENAI_API_KEY=... \
//   deno run -A scripts/ingest_embeddings.ts <cycle_id>
//
// The cycle must be in 'published' or 'closed' status (enforced by the RPC
// only returning submitted assignments).

import { createClient } from "npm:@supabase/supabase-js@2";

// ── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL      = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")
                       ?? Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY       = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY    = Deno.env.get("OPENAI_API_KEY")!;
const EMBEDDING_MODEL   = "text-embedding-3-small";
const EMBEDDING_DIMS    = 1536;
const EMBED_BATCH_SIZE  = 20; // OpenAI allows up to 2048 inputs per call

const cycleId = Deno.args[0];
if (!cycleId) {
  console.error("Usage: deno run -A scripts/ingest_embeddings.ts <cycle_id>");
  Deno.exit(1);
}
if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY) {
  console.error("Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY");
  Deno.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Types ────────────────────────────────────────────────────────────────────

type QuestionGroup = {
  question_id:     string;
  question_text:   string;
  category:        string;
  sort_order:      number;
  assignment_type: string;
  total_givers:    number;
  giver_count:     number;
  comments:        string[];
};

type Rating = {
  question_text:   string;
  category:        string;
  assignment_type: string;
  avg_score:       number;
  response_count:  number;
  total_givers:    number;
};

type Payload = {
  recipient: { id: string; first_name: string; last_name: string; job_title: string };
  question_groups: QuestionGroup[];
  ratings: Rating[];
};

type Chunk = {
  cycle_id:        string;
  recipient_id:    string;
  question_id:     string | null;
  category:        string;
  assignment_type: string;
  chunk_text:      string;
  giver_count:     number;
  total_givers:    number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function assignmentLabel(type: string): string {
  const labels: Record<string, string> = {
    peer: "peer", upward: "direct report", downward: "manager", self: "self",
  };
  return labels[type] ?? type;
}

/** Build chunk_text for a question group, prefixing with proportionality context. */
function buildTextChunk(group: QuestionGroup): string {
  const { question_text, assignment_type, giver_count, total_givers, comments } = group;
  const label = assignmentLabel(assignment_type);
  const proportion = `${giver_count} of ${total_givers} ${label}${total_givers !== 1 ? "s" : ""} responded`;
  const sanitized = comments.map(sanitize).filter(Boolean);
  return [
    `Question: ${question_text}`,
    `Respondent group: ${label} (${proportion}):`,
    ...sanitized.map((c) => `- ${c}`),
  ].join("\n");
}

/** Build chunk_text for the ratings summary (one chunk per assignment_type × category). */
function buildRatingsChunk(
  ratings: Rating[],
  assignmentType: string,
  category: string,
): { text: string; giver_count: number; total_givers: number } {
  const relevant = ratings.filter(
    (r) => r.assignment_type === assignmentType && r.category === category,
  );
  const totalGivers = Math.max(...relevant.map((r) => r.total_givers), 0);
  const label = assignmentLabel(assignmentType);
  const lines = relevant.map(
    (r) => `  ${r.question_text}: avg ${r.avg_score}/5 (${r.response_count} ratings)`,
  );
  return {
    text: [
      `Numeric ratings — ${category} — from ${label}s (${totalGivers} respondents):`,
      ...lines,
    ].join("\n"),
    giver_count: totalGivers,
    total_givers: totalGivers,
  };
}

/**
 * Sanitize user-supplied text before including it in an embedding input.
 * Defense-in-depth against prompt injection: strip known injection patterns.
 * This does NOT make the text safe for direct LLM inclusion — the generation
 * script wraps content in XML tags and instructs the model to treat it as data.
 */
function sanitize(text: string): string {
  return text
    .trim()
    // Remove common injection trigger phrases (case-insensitive)
    .replace(/ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|context)/gi, "[removed]")
    .replace(/you\s+are\s+now\s+/gi, "[removed] ")
    .replace(/\bsystem\s*:/gi, "[label]:")
    .replace(/\bassistant\s*:/gi, "[label]:")
    .replace(/\buser\s*:/gi, "[label]:")
    .replace(/<\/?(?:system|assistant|user|prompt|instruction)[^>]*>/gi, "[tag]")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/** Embed a batch of strings. Returns float arrays in the same order. */
async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMS,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings error ${res.status}: ${err}`);
  }
  const json = await res.json() as { data: { embedding: number[]; index: number }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(`\nEmbedding ingestion — cycle ${cycleId}`);

// 1. Get recipients who qualify for a summary (threshold-gated by the RPC).
const { data: recipientRows, error: rErr } = await supabase.rpc("recipients_for_summary", {
  p_cycle_id: cycleId,
});
if (rErr) { console.error("recipients_for_summary error:", rErr.message); Deno.exit(1); }
const recipients: string[] = (recipientRows ?? []).map((r: { recipient_id: string }) => r.recipient_id);
console.log(`  ${recipients.length} recipient(s) qualify for embedding.`);

let totalChunks = 0;

for (const recipientId of recipients) {
  // 2. Pull structured feedback payload.
  const { data: payloadRaw, error: pErr } = await supabase.rpc("feedback_ingestion_payload", {
    p_cycle_id:     cycleId,
    p_recipient_id: recipientId,
  });
  if (pErr) {
    console.error(`  [${recipientId}] feedback_ingestion_payload error: ${pErr.message}`);
    continue;
  }
  const payload = payloadRaw as Payload;
  const name = `${payload.recipient.first_name} ${payload.recipient.last_name}`;
  console.log(`\n  → ${name} (${payload.question_groups.length} text groups, ${payload.ratings.length} rating rows)`);

  const chunks: Chunk[] = [];

  // 3a. One chunk per question × assignment_type (text responses).
  for (const group of payload.question_groups) {
    if (!group.comments?.length) continue;
    chunks.push({
      cycle_id:        cycleId,
      recipient_id:    recipientId,
      question_id:     group.question_id,
      category:        group.category,
      assignment_type: group.assignment_type,
      chunk_text:      buildTextChunk(group),
      giver_count:     group.giver_count,
      total_givers:    group.total_givers,
    });
  }

  // 3b. Ratings summary chunks grouped by assignment_type × category.
  const ratingKeys = [
    ...new Set(payload.ratings.map((r) => `${r.assignment_type}::${r.category}`)),
  ];
  for (const key of ratingKeys) {
    const [at, cat] = key.split("::");
    const built = buildRatingsChunk(payload.ratings, at, cat);
    if (!built.text) continue;
    chunks.push({
      cycle_id:        cycleId,
      recipient_id:    recipientId,
      question_id:     null,
      category:        cat,
      assignment_type: `${at}_ratings`,
      chunk_text:      built.text,
      giver_count:     built.giver_count,
      total_givers:    built.total_givers,
    });
  }

  if (!chunks.length) {
    console.log("    No chunks built — skipping.");
    continue;
  }

  // 4. Embed in batches.
  const texts = chunks.map((c) => c.chunk_text);
  const embeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const vecs = await embedBatch(batch);
    embeddings.push(...vecs);
    if (texts.length > EMBED_BATCH_SIZE) {
      Deno.stdout.writeSync(new TextEncoder().encode("."));
    }
  }

  // 5. Upsert into feedback_chunks.
  const rows = chunks.map((c, i) => ({ ...c, embedding: `[${embeddings[i].join(",")}]` }));
  const { error: uErr } = await supabase
    .from("feedback_chunks")
    .upsert(rows, { onConflict: "cycle_id,recipient_id,question_id,assignment_type" });
  if (uErr) {
    console.error(`\n    upsert error: ${uErr.message}`);
  } else {
    console.log(`\n    ✓ ${rows.length} chunk(s) upserted.`);
    totalChunks += rows.length;
  }
}

console.log(`\nDone. ${totalChunks} total chunk(s) ingested for cycle ${cycleId}.\n`);
