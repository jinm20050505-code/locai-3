// 代わりの野菜の AI の説明（AI が使えないときは、その旨だけを出す）
import { aiConfigured } from "@/server/ai";
import { AiAlternativesButton } from "./ai-alternatives-button";

export function AiAlternatives({ wanted, candidates }: { wanted: string; candidates: { id: string; name: string }[] }) {
  if (!aiConfigured()) return <p className="text-base text-sub">AI による説明は、いまは使えません（候補はアプリの決まりで選んでいます）。</p>;
  return <AiAlternativesButton wanted={wanted} candidates={candidates} />;
}
