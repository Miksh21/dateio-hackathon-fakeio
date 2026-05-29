"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buttonClass } from "@/components/ui";
import { Icon } from "@/components/Icon";

// Per-report "release my direct feedback" control, shown to a MANAGER on a row
// for each of their direct reports. Toggling inserts/deletes a downward_releases
// row keyed on (cycle, manager = me, report). Once released (and the cycle is
// published) THAT report can read the manager's identified downward feedback.
//
// Mirrors ReleaseToggle (feedback_releases), but at the per-report grain and for
// the OPPOSITE direction (feedback the manager GAVE, not received).
export function DownwardReleaseToggle({
  cycleId,
  managerId,
  reportId,
  reportName,
  released,
  locale,
}: {
  cycleId: string;
  managerId: string;
  reportId: string;
  reportName: string;
  released: boolean;
  locale: "en" | "cs";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cs = locale === "cs";

  async function toggle() {
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      if (released) {
        const { error } = await supabase
          .from("downward_releases")
          .delete()
          .eq("cycle_id", cycleId)
          .eq("manager_id", managerId)
          .eq("report_id", reportId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("downward_releases")
          .insert({ cycle_id: cycleId, manager_id: managerId, report_id: reportId });
        if (error) throw error;
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : ((e as { message?: string })?.message ?? String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-xl p-3 ring-1 ${released ? "bg-mint-light ring-mint" : "bg-white shadow-sm ring-black/[0.06]"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <Icon name="user" size={15} />
            <span className="truncate">{reportName}</span>
          </div>
          <p className="mt-0.5 text-xs text-ink-600">
            {released
              ? cs
                ? "Sdíleno — tento podřízený uvidí vaši přímou zpětnou vazbu (po publikaci cyklu)."
                : "Shared — this report can see your direct feedback (once the cycle is published)."
              : cs
                ? "Zatím nesdíleno — vaše přímá zpětná vazba je skrytá."
                : "Not shared yet — your direct feedback stays hidden."}
          </p>
        </div>
        <button type="button" onClick={toggle} disabled={busy} className={buttonClass(released ? "secondary" : "primary", "shrink-0")}>
          {busy ? "…" : released ? (cs ? "Zrušit sdílení" : "Unshare") : cs ? "Sdílet" : "Share"}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}
