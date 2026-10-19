// 役割（飲食店／生産者）
export const ROLES = ["buyer", "producer"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { buyer: "飲食店", producer: "生産者（農家）" };
export const ROLE_HOME: Record<Role, string> = { buyer: "/search", producer: "/producer" };
