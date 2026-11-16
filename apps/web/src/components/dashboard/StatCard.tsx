import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, change, hint, icon: Icon }: { label: string; value: string; change: number; hint: string; icon: LucideIcon }) {
  const up = change >= 0;
  return (
    <div className="rounded-xl border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium", up ? "bg-primary-soft text-primary" : "bg-destructive/10 text-destructive")}>
          {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(change)}%
        </span>
        <span className="text-muted-foreground">{hint}</span>
      </div>
    </div>
  );
}
