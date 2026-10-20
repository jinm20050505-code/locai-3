import { getCurrentUser } from "@/lib/session";
import { MobileExperience } from "./mobile-experience";

export async function AppCompanion() {
  const user = await getCurrentUser();
  return <MobileExperience key={user?.id ?? "guest"} role={user?.role ?? null} />;
}
