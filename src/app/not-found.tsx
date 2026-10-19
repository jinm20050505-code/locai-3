import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">ページが見つかりません</h1>
      <p>アドレスが変わったか、見る権限がないページです。</p>
      <LinkButton href="/">トップに戻る</LinkButton>
    </main>
  );
}
