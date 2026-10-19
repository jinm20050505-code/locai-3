// 関西の府県と主な市区町村（詳しい住所は扱わない）
export const PREFECTURES = [
  { code: "25", name: "滋賀県", cities: ["大津市", "草津市", "彦根市", "長浜市", "近江八幡市", "その他の市町"] },
  { code: "26", name: "京都府", cities: ["京都市", "南丹市", "亀岡市", "宇治市", "京丹後市", "福知山市", "その他の市町村"] },
  { code: "27", name: "大阪府", cities: ["大阪市", "堺市", "豊中市", "吹田市", "高槻市", "東大阪市", "その他の市町村"] },
  { code: "28", name: "兵庫県", cities: ["神戸市", "姫路市", "西宮市", "尼崎市", "淡路市", "丹波篠山市", "その他の市町"] },
  { code: "29", name: "奈良県", cities: ["奈良市", "橿原市", "生駒市", "天理市", "宇陀市", "その他の市町村"] },
  { code: "30", name: "和歌山県", cities: ["和歌山市", "田辺市", "紀の川市", "有田市", "その他の市町村"] },
] as const;

export const prefName = (code: string | null | undefined) => PREFECTURES.find((p) => p.code === code)?.name ?? "";
export const isPlace = (pref: string, city: string) => PREFECTURES.some((p) => p.code === pref && (p.cities as readonly string[]).includes(city));
export const placeLabel = (pref: string | null | undefined, city: string | null | undefined) => `${prefName(pref)}${city ? ` ${city}` : ""}`;
