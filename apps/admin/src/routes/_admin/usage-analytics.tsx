import { AnalyticsPage, ANALYTICS } from "@/components/admin/Analytics";

function Page() {
  return <AnalyticsPage config={ANALYTICS.usage} />;
}

export default Page;
