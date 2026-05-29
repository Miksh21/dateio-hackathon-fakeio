import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { dict } from "@/lib/i18n";

export default async function Home() {
  if (!hasSupabaseEnv()) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-xl bg-white p-6 text-sm ring-1 ring-gray-200">
          <h1 className="mb-2 text-lg font-semibold">Setup needed</h1>
          <p className="text-gray-600">
            Set <code className="rounded bg-gray-100 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
            <code className="rounded bg-gray-100 px-1">apps/web/.env.local</code> and restart{" "}
            <code className="rounded bg-gray-100 px-1">npm run dev</code>.
          </p>
        </div>
      </main>
    );
  }

  const me = await getCurrentEmployee();
  if (!me) redirect("/login");

  const t = dict.en;
  const cards = [
    { href: "/forms", title: t.myForms, sub: "Give your feedback", show: true },
    { href: "/results", title: t.results, sub: "Feedback you received", show: true },
    { href: "/report", title: "Report", sub: "Completion by team / manager", show: me.is_super_admin || me.role !== "ic" },
    { href: "/admin", title: t.admin, sub: "Cycles, graph, questions", show: me.is_super_admin },
  ].filter((c) => c.show);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t.appName}</h1>
          <p className="text-sm text-gray-500">
            {me.first_name} {me.last_name} · {me.role}
            {me.is_super_admin ? " · admin" : ""}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100">
            {t.signOut}
          </button>
        </form>
      </header>

      <nav className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-xl bg-white p-4 ring-1 ring-gray-200 transition hover:ring-gray-400"
          >
            <div className="font-medium">{c.title}</div>
            <p className="text-sm text-gray-500">{c.sub}</p>
          </Link>
        ))}
      </nav>
    </main>
  );
}
