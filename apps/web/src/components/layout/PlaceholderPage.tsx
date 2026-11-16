import type { LucideIcon } from "lucide-react";
import { PageHeader } from "./PageHeader";

export function PlaceholderPage({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={description} />
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed bg-card p-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold">{title} is coming soon</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          This module is being built. The layout and navigation are ready.
        </p>
      </div>
    </div>
  );
}
