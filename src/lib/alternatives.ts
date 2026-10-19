// 欲しい野菜がないときの「代わりの野菜」（アプリの決まりで選ぶ。AI がなくても使える）
import { normalize } from "./kana";

const GROUPS: { name: string; items: string[] }[] = [
  { name: "実を食べる野菜", items: ["なす", "かもなす", "とまと", "みにとまと", "きゅうり", "ぴーまん", "まんがんじとうがらし", "ししとう", "かぼちゃ", "おくら"] },
  { name: "葉を食べる野菜", items: ["ほうれんそう", "こまつな", "みずな", "みぶな", "ねぎ", "くじょうねぎ", "はくさい", "きゃべつ", "しゅんぎく"] },
  { name: "根を食べる野菜", items: ["だいこん", "かぶ", "しょうごいんかぶ", "にんじん", "さといも", "ごぼう", "えびいも", "たまねぎ"] },
];

/** 探した野菜と同じ仲間の野菜の名前（そろえた形）。仲間が分からなければ null */
export function sameGroup(q: string): { group: string; items: string[] } | null {
  const n = normalize(q);
  if (!n) return null;
  const g = GROUPS.find((x) => x.items.some((i) => i.includes(n) || n.includes(i)));
  return g ? { group: g.name, items: g.items } : null;
}
