import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/env";
import { getLocale } from "@/lib/locale";
import { dict } from "@/lib/i18n";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui";
import { ChatClient } from "./ChatClient";

// "Chat with your feedback" — privacy-scoped RAG. The page only authenticates and
// renders the shell; all retrieval happens server-side (the /api/chat route +
// n8n), HARD-filtered to what the signed-in user is entitled to see.
export default async function ChatPage() {
  if (!hasSupabaseEnv()) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-md">
          <h1 className="mb-2 text-lg font-semibold">Setup needed</h1>
          <p className="text-sm text-ink-600">
            Set <code className="rounded bg-black/5 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
            <code className="rounded bg-black/5 px-1">apps/web/.env.local</code>.
          </p>
        </Card>
      </main>
    );
  }

  const me = await getCurrentEmployee();
  if (!me) redirect("/login");
  const locale = await getLocale();
  const t = dict[locale];

  return (
    <>
      <AppHeader me={me} locale={locale} active="chat" />
      <main className="mx-auto max-w-4xl px-4 py-6">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{t.chatTitle}</h1>
          <p className="mt-1 text-sm text-ink-600">{t.chatSubtitle}</p>
        </div>
        <ChatClient locale={locale} />
      </main>
    </>
  );
}
