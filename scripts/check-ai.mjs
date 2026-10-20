// Gemini の設定と応答の確認：npm run ai:check（鍵は表示しない）
// 1. 鍵とモデル名があるか 2. その鍵で使えるモデルの一覧 3. アプリと同じ形（JSON の形を指定）で架空の希望を1回整理させる
import { GoogleGenAI } from "@google/genai";

process.loadEnvFile(new URL("../.env.local", import.meta.url));
const key = process.env.GEMINI_API_KEY ?? "";
const model = process.env.GEMINI_MODEL ?? "";
const hide = (s) => String(s).replaceAll(key || "\u0000", "（鍵）");
console.log(`GEMINI_API_KEY：${key ? "設定あり" : "なし"}／GEMINI_MODEL：${model || "なし"}`);
if (!key) process.exit(1);

const ai = new GoogleGenAI({ apiKey: key });
try {
  const names = [];
  for await (const m of await ai.models.list()) if (m.supportedActions?.includes("generateContent")) names.push(m.name.replace(/^models\//, ""));
  console.log(`この鍵で使えるモデル（${names.length}件）：\n  ${names.join("\n  ")}`);
  if (!model) process.exit(1);
  if (!names.includes(model)) console.log(`⚠ ${model} は一覧にありません`);

  const t = Date.now();
  const res = await ai.models.generateContent({
    model,
    contents: JSON.stringify({ 希望: "来週の金曜に、天ぷら用のなすを3kgくらい。予算は2000円まで（架空）" }),
    config: {
      systemInstruction: "飲食店の店主が書いた仕入れの希望を、検索の条件に整理します。書かれていないことは null にしてください。",
      responseMimeType: "application/json",
      responseJsonSchema: { type: "object", properties: { 食材: { type: ["string", "null"] }, 希望数量kg: { type: ["number", "null"] }, 予算円: { type: ["integer", "null"] }, 用途: { type: ["string", "null"] } }, required: ["食材", "希望数量kg", "予算円", "用途"] },
      temperature: 0.3, maxOutputTokens: 1000, abortSignal: AbortSignal.timeout(20_000),
    },
  });
  const data = JSON.parse(res.text ?? "");
  console.log(`応答（${Date.now() - t}ms）：${JSON.stringify(data)}`);
  console.log(data.食材?.includes("なす") && data.希望数量kg === 3 && data.予算円 === 2000 ? "OK  指定した形で、内容も合っている" : "NG  形または内容が想定と違う");
} catch (e) {
  console.log(`NG  呼び出しに失敗：${hide(e?.status ?? "")} ${hide(e?.message ?? e).slice(0, 300)}`);
  process.exit(1);
}
