// ログインの仕組み（Better Auth）。サーバー側だけで使う
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "./db";
import { ROLES } from "./roles";

function createAuth() {
  return betterAuth({
    database: prismaAdapter(getDb(), { provider: "postgresql" }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
    user: { additionalFields: { role: { type: ["buyer", "producer"], required: true, input: true } } },
    databaseHooks: {
      user: {
        create: {
          // 画面を通さない直接の要求でも、役割はサーバーで確かめる
          before: async (user) => {
            const role = (user as Record<string, unknown>).role;
            if (!ROLES.includes(role as (typeof ROLES)[number])) throw new APIError("BAD_REQUEST", { message: "役割を選んでください" });
            return { data: user };
          },
        },
        update: {
          before: async (data) => {
            if ("role" in data) throw new APIError("FORBIDDEN", { message: "役割はあとから変えられません" });
            return { data };
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { locaiAuth?: Auth };
export function getAuth(): Auth {
  g.locaiAuth ??= createAuth();
  return g.locaiAuth;
}
