import { AnalyticsPage, ANALYTICS } from "@/components/admin/Analytics";

function Page() {
  return <AnalyticsPage config={ANALYTICS.platform} />;
}

export default Page;
