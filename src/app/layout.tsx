import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Header } from "@/components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "LocAI｜地元の野菜を、必要な量だけ",
  description: "関西の農家さんとお店を、必要な量の野菜でつなぐアプリ（デモ）",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body className="flex min-h-screen flex-col">
        <Suspense fallback={<div className="h-28 border-b-4 border-brand" />}>
          <Header />
        </Suspense>
        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</div>
        <footer className="border-t border-line bg-gray-50 px-4 py-4 text-center text-base text-sub">
          このデモの農家さん・野菜・お店はすべて架空です。実際の販売は行いません。<br />
          お金の支払いと配送の手配は、アプリの外で行います。
        </footer>
      </body>
    </html>
  );
}
