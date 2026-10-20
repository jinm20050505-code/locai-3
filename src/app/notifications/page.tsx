import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { NotificationList } from "@/components/notifications/notification-list";
async function Content() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/notifications");
  return <NotificationList key={user.id} />;
}
export default function Page() { return <Suspense fallback={<p>通知を開いています…</p>}><Content /></Suspense>; }
