// 欲しい野菜がないときの「代わりの野菜」（アプリの決まりで選ぶ。AI がなくても使える）。
// 仲間分けはアプリで決めた仮のもの（仕様の例：万願寺唐辛子 → 伏見甘長）
import { searchTerms } from "./kana";

const GROUPS: { name: string; items: string[] }[] = [
  { name: "実を食べる野菜", items: ["なす", "かもなす", "とまと", "みにとまと", "きゅうり", "ぴーまん", "まんがんじとうがらし", "ふしみあまなが", "ししとう", "かぼちゃ", "おくら"] },
  { name: "葉を食べる野菜", items: ["ほうれんそう", "こまつな", "みずな", "みぶな", "ねぎ", "くじょうねぎ", "はくさい", "きゃべつ", "しゅんぎく"] },
  { name: "根を食べる野菜", items: ["だいこん", "かぶ", "しょうごいんかぶ", "にんじん", "さといも", "ごぼう", "えびいも", "たまねぎ"] },
];

/** 探した野菜と同じ仲間の野菜の名前（そろえた形）。別名（漢字・カタカナ）でも見つける。仲間が分からなければ null */
export function sameGroup(q: string): { group: string; items: string[] } | null {
  const terms = searchTerms(q);
  if (!terms.length) return null;
  const g = GROUPS.find((x) => x.items.some((i) => terms.some((t) => t.includes(i) || i.includes(t))));
  return g ? { group: g.name, items: g.items } : null;
}
