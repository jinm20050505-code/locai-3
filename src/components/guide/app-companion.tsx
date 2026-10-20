import { getCurrentUser } from "@/lib/session";
import { MobileExperience } from "./mobile-experience";

export async function AppCompanion() {
  const user = await getCurrentUser();
  return <MobileExperience role={user?.role ?? null} />;
}
