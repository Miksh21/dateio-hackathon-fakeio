// Shared presentational primitives (Dateio brand). Safe in server & client
// components — no hooks. Interactive <Button> is plain markup; attach handlers
// from a client component.
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cn(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-aqua text-white hover:bg-aqua-700",
  secondary: "bg-white text-ink ring-1 ring-black/10 hover:bg-black/[0.03]",
  ghost: "text-ink-600 hover:bg-black/[0.05] hover:text-ink",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function buttonClass(variant: Variant = "primary", extra?: string): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    extra,
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/[0.06]", className)}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export type Tone = "neutral" | "aqua" | "mint" | "sky" | "lavender" | "pearl" | "sun" | "ink";
const TONES: Record<Tone, string> = {
  neutral: "bg-black/[0.05] text-ink-600",
  aqua: "bg-aqua/10 text-aqua",
  mint: "bg-mint-light text-aqua-700",
  sky: "bg-sky/20 text-ink",
  lavender: "bg-lavender/25 text-ink",
  pearl: "bg-pearl/30 text-ink",
  sun: "bg-sun/25 text-ink",
  ink: "bg-ink text-white",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone])}>
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  max,
  tone = "aqua",
}: {
  value: number;
  max: number;
  tone?: "aqua" | "sun" | "red" | "mint";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color =
    tone === "red" ? "bg-red-500" : tone === "sun" ? "bg-sun" : tone === "mint" ? "bg-mint" : "bg-aqua";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-black/[0.07]">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2.5 text-center ring-1 ring-black/[0.05]">
      <div className="text-xl font-semibold text-ink">{value}</div>
      <div className="text-xs text-ink-600">{label}</div>
      {hint && <div className="mt-0.5 text-[10px] text-ink-600/70">{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/10 bg-white/60 px-6 py-12 text-center">
      {icon && <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-black/[0.04] text-ink-600/60">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 text-xs text-ink-600">{hint}</p>}
    </div>
  );
}
