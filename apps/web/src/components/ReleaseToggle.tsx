"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buttonClass } from "@/components/ui";
import { Icon } from "@/components/Icon";

// Manager self-serve "release" control, shown on your own Results. Toggling
// inserts/deletes a feedback_releases row; once released (and the cycle is
// published) your reports can see your received feedback with author names.
export function ReleaseToggle({
  cycleId,
  employeeId,
  released,
  locale,
}: {
  cycleId: string;
  employeeId: string;
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
        const { error } = await supabase.from("feedback_releases").delete().eq("cycle_id", cycleId).eq("employee_id", employeeId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("feedback_releases").insert({ cycle_id: cycleId, employee_id: employeeId });
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
    <div className={`mb-6 rounded-2xl p-4 ring-1 ${released ? "bg-mint-light ring-mint" : "bg-white shadow-sm ring-black/[0.06]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Icon name={released ? "check" : "info"} size={16} />
            {released ? (cs ? "Sdíleno s týmem" : "Shared with your team") : cs ? "Sdílet svou zpětnou vazbu s týmem" : "Share your feedback with your team"}
          </div>
          <p className="mt-1 text-xs text-ink-600">
            {cs
              ? "Vaši podřízení uvidí zpětnou vazbu, kterou jste dostali, včetně jmen autorů (po publikaci cyklu). Toto je nevratné odhalení anonymity."
              : "Your reports will see the feedback you received, with author names (after the cycle is published). This reveals who said what."}
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
