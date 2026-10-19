"use client";

// ログアウト。このブラウザの下書き（検索の条件・出品の入力途中）も消す（仕様 5章4）
import { logoutAction } from "@/app/actions/auth";
import { clearDraft } from "@/lib/draft";

export function LogoutButton({ className }: { className: string }) {
  return (
    <form action={logoutAction} onSubmit={() => clearDraft()}>
      <button className={className}>ログアウト</button>
    </form>
  );
}
