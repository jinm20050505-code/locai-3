import { Suspense } from "react";
import { LoginForm } from "@/components/auth/forms";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">ログイン</h1>
      <Suspense fallback={null}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  return <LoginForm next={typeof sp.next === "string" ? sp.next : ""} />;
}
