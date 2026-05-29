import Link from "next/link";
import { Icon, type IconName } from "./Icon";
import { LocaleToggle } from "./LocaleToggle";
import { cn } from "./ui";
import { dict, type Locale } from "@/lib/i18n";
import { DEMO_MODE } from "@/lib/demo";

type Me = { first_name: string; last_name: string; role: string; is_super_admin: boolean };

// Persistent branded top bar with role-aware navigation. `active` highlights the
// current section (pass the matching nav key). Rendered by each authed page.
export function AppHeader({
  me,
  locale,
  active,
}: {
  me: Me;
  locale: Locale;
  active?: "forms" | "results" | "report" | "admin";
}) {
  const t = dict[locale];
  const demo = DEMO_MODE;
  const nav = (
    [
      { key: "forms", href: "/forms", label: t.myForms, icon: "forms", show: true },
      { key: "results", href: "/results", label: t.results, icon: "results", show: true },
      { key: "report", href: "/report", label: t.report, icon: "report", show: me.is_super_admin || me.role !== "ic" },
      { key: "admin", href: "/admin", label: t.admin, icon: "admin", show: me.is_super_admin },
    ] as { key: typeof active; href: string; label: string; icon: IconName; show: boolean }[]
  ).filter((n) => n.show);

  return (
    <header className="sticky top-0 z-30 bg-ink text-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-4xl items-center gap-1 px-4">
        <Link href="/" className="mr-2 flex items-center gap-2 font-semibold sm:mr-4">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-aqua text-[11px] font-bold">360</span>
          <span className="hidden text-sm sm:inline">{t.appName}</span>
        </Link>
        {demo && (
          <span
            className="mr-1 rounded-full bg-sun/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
            title="Demo sign-in is enabled — anyone can sign in as anyone"
          >
            Demo
          </span>
        )}
        <nav className="flex items-center gap-0.5">
          {nav.map((n) => (
            <Link
              key={n.key}
              href={n.href}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition",
                active === n.key ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon name={n.icon} size={16} />
              <span className="hidden md:inline">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LocaleToggle current={locale} dark />
          <div className="hidden text-right sm:block">
            <div className="text-xs font-medium leading-tight">
              {me.first_name} {me.last_name}
            </div>
            <div className="text-[10px] capitalize leading-tight text-white/60">
              {me.role}
              {me.is_super_admin ? " · admin" : ""}
            </div>
          </div>
          <form action="/auth/signout" method="post">
            <button
              className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label={t.signOut}
              title={t.signOut}
            >
              <Icon name="logout" size={18} />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
