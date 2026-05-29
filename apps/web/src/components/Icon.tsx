// Lightweight inline icon set (stroke = currentColor). No runtime dependency.
import type { SVGProps } from "react";

export type IconName =
  | "forms"
  | "results"
  | "report"
  | "admin"
  | "graph"
  | "check"
  | "clock"
  | "logout"
  | "user"
  | "search"
  | "sparkles"
  | "arrowLeft"
  | "chevronRight"
  | "info"
  | "plus"
  | "globe";

const PATHS: Record<IconName, string> = {
  forms: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2 M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2 M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 M9 12h6 M9 16h6",
  results: "M3 3v18h18 M7 16V9 M12 16V6 M17 16v-4",
  report: "M9 17v-2a4 4 0 0 1 4-4h4 M3 7a4 4 0 0 1 4-4 M16 3.13a4 4 0 0 1 0 7.75 M21 21v-2a4 4 0 0 0-3-3.87 M7 21v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2",
  admin: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6",
  graph: "M18 8a3 3 0 1 0-2.83-4 M6 16a3 3 0 1 0 2.83 4 M18 16a3 3 0 1 0 0 0 M6 8a3 3 0 1 0 0 0 M8.6 9.5l6.8 5 M15.4 9.5l-6.8 5",
  check: "M20 6 9 17l-5-5",
  clock: "M12 7v5l3 2 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  search: "m21 21-4.3-4.3 M17 11a6 6 0 1 0-12 0 6 6 0 0 0 12 0Z",
  sparkles: "M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3Z M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z",
  arrowLeft: "m12 19-7-7 7-7 M19 12H5",
  chevronRight: "m9 18 6-6-6-6",
  info: "M12 16v-4 M12 8h.01 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  plus: "M12 5v14 M5 12h14",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M3 12h18 M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z",
};

export function Icon({
  name,
  size = 18,
  className,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
