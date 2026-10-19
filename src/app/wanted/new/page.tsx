import { Suspense } from "react";
import { WantedForm } from "@/components/wanted/forms";
import { todayText } from "@/lib/dates";
import { requireRole } from "@/lib/session";

export default function NewWanted({ searchParams }: PageProps<"/wanted/new">) {
  return (
    <main className="space-y-5">
      <h1 className="text-2xl font-bold">「探しています」を公開する</h1>
      <Suspense fallback={<p>読み込んでいます…</p>}><Body searchParams={searchParams} /></Suspense>
    </main>
  );
}
async function Body({ searchParams }: { searchParams: PageProps<"/wanted/new">["searchParams"] }) {
  const user = await requireRole("buyer", "/wanted/new");
  const sp = await searchParams;
  const initial: Record<string, string | string[]> = { pref: user.prefecture ?? "", city: user.city ?? "" };
  for (const [k, v] of Object.entries(sp)) if (v !== undefined) initial[k] = k === "methods" ? (Array.isArray(v) ? v : [v]) : String(v).slice(0, 100);
  return (<><p>条件に合う出品がなかったときに、地域の農家さんに条件を知らせます。</p><WantedForm initial={initial} today={todayText()} /></>);
}
