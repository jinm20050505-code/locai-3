import { Suspense } from "react";
import { SignupForm } from "@/components/auth/forms";

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">登録する</h1>
      <Suspense fallback={null}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
async function Form({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const sp = await searchParams;
  return <SignupForm next={typeof sp.next === "string" ? sp.next : ""} initialRole={sp.role === "producer" ? "producer" : sp.role === "buyer" ? "buyer" : ""} />;
}
