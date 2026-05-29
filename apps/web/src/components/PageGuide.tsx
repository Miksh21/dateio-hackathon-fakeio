"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

// Dismissible, role-aware "what is this page" guide. Remembers dismissal per id.
export function PageGuide({ id, title, points }: { id: string; title: string; points: string[] }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read persisted dismissal after mount (SSR-safe)
    if (typeof window !== "undefined" && window.localStorage.getItem(`guide:${id}`) === "off") setOpen(false);
  }, [id]);
  if (!open) return null;
  return (
    <div className="mb-6 rounded-2xl bg-aqua/10 p-4 ring-1 ring-aqua/20">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-aqua/15 text-aqua">
          <Icon name="info" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            <button
              type="button"
              onClick={() => {
                window.localStorage.setItem(`guide:${id}`, "off");
                setOpen(false);
              }}
              className="shrink-0 text-xs text-ink-600 hover:text-ink"
            >
              ✕
            </button>
          </div>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-600">
            {points.map((p, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="mt-px text-aqua">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
