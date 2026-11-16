import type { Row } from "@/lib/admin/store";
import { StatusBadge } from "@/components/admin-ui/primitives";

export function TemplatePreview({ t }: { t: Row }) {
  const vars = [...new Set(String(t.body ?? "").match(/\{\{\d+\}\}/g) ?? [])];
  return (
    <div className="space-y-4 pt-2">
      <div className="rounded-lg bg-muted p-4">
        <div className="max-w-sm rounded-lg rounded-tl-none border bg-card p-3 shadow-card">
          {t.header && <p className="mb-1 text-sm font-bold text-foreground">{t.header}</p>}
          <p className="whitespace-pre-wrap text-sm text-foreground">{t.body}</p>
          {t.footer && <p className="mt-2 text-xs text-muted-foreground">{t.footer}</p>}
          {t.buttons && (
            <div className="mt-2 divide-y border-t">
              {String(t.buttons).split(",").map((b: string) => <p key={b} className="py-1.5 text-center text-sm font-medium text-info">{b.trim()}</p>)}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Variables:</span>
        {vars.length ? vars.map((v) => <span key={v} className="rounded bg-muted px-1.5 py-0.5 font-mono">{v}</span>) : "none"}
      </div>
      <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        <StatusBadge value={t.status} className="mr-2" />
        {t.library === "Meta-approved" ? "Synced from Meta — approval status reflects the last sync." : "Local Genie record. This is not a Meta-approved template until submitted and approved by Meta."}
      </div>
    </div>
  );
}
