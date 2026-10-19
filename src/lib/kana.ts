// 検索の言葉をそろえる（カタカナ→ひらがな、全角英数→半角、空白を除く）
export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, "");
}

// 同じ野菜の別の呼び方（どちらで探しても見つかる）
const ALIASES: string[][] = [
  ["なす", "茄子", "ナス"],
  ["かもなす", "賀茂茄子", "賀茂なす"],
  ["まんがんじとうがらし", "万願寺唐辛子", "万願寺とうがらし", "万願寺"],
  ["きゅうり", "胡瓜"],
  ["とまと", "トマト"],
  ["だいこん", "大根"],
  ["にんじん", "人参"],
  ["ねぎ", "葱", "九条ねぎ", "九条葱"],
  ["かぶ", "蕪"],
  ["ほうれんそう", "ほうれん草"],
  ["たまねぎ", "玉ねぎ", "玉葱"],
  ["さといも", "里芋"],
  ["ふしみあまなが", "伏見甘長", "伏見とうがらし", "伏見唐辛子"],
  ["ししとう", "獅子唐", "ししとうがらし"],
  ["ぴーまん", "ピーマン"],
  ["かぼちゃ", "南瓜"],
  ["こまつな", "小松菜"],
  ["みずな", "水菜"],
  ["みぶな", "壬生菜"],
  ["はくさい", "白菜"],
  ["きゃべつ", "キャベツ"],
  ["しゅんぎく", "春菊"],
  ["ごぼう", "牛蒡"],
  ["えびいも", "海老芋"],
  ["しょうごいんかぶ", "聖護院かぶ", "聖護院蕪"],
  ["みにとまと", "ミニトマト"],
];

/** 探す言葉と、その別の呼び方（すべてそろえた形） */
export function searchTerms(q: string): string[] {
  const n = normalize(q);
  if (!n) return [];
  const terms = new Set([n]);
  for (const group of ALIASES) {
    const g = group.map(normalize);
    if (g.some((x) => x === n || x.includes(n))) g.forEach((x) => terms.add(x));
  }
  return [...terms];
}

/** 名前・品種のどれかに、探す言葉が含まれるか */
export function matches(terms: string[], ...fields: (string | null | undefined)[]): boolean {
  if (terms.length === 0) return true;
  const hay = fields.filter(Boolean).map((f) => normalize(f!));
  return terms.some((t) => hay.some((h) => h.includes(t)));
}
