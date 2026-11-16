import { useSession } from "@/lib/admin/session";
import { can, type PermGroup } from "@/lib/permissions/roles";

export function useCan(group: PermGroup, level: "view" | "manage" = "view") {
  const s = useSession();
  return s ? can(s.role, group, level) : false;
}
