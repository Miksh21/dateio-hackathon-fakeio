import { createClient } from "@/lib/supabase/server";

// Returns the ID of the most relevant cycle: prefer 'open', then 'published',
// then 'closed', then 'draft'. Falls back to the hardcoded demo UUID so
// existing data still shows if no cycle exists in the DB yet.
const FALLBACK_CYCLE = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const STATUS_PRIORITY: Record<string, number> = {
  open: 0, published: 1, closed: 2, draft: 3,
};

export async function getCurrentCycleId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("evaluation_cycles")
    .select("id,status,created_at")
    .order("created_at", { ascending: false });

  if (!data?.length) return FALLBACK_CYCLE;

  const sorted = [...data].sort(
    (a, b) =>
      (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9),
  );
  return sorted[0].id;
}
