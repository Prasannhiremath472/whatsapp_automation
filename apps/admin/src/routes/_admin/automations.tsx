import { ResourcePage } from "@/components/admin-ui/ResourcePage";
import { MODULES } from "@/lib/admin/modules";

function Page() {
  return <ResourcePage config={MODULES.automations} />;
}

export default Page;
