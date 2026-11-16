import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Copy,
  Eye,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { TemplateDto } from "@whatsapp-crm/shared-types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  statusMeta,
  templateCategories,
  type WaTemplate,
} from "@/components/whatsapp/templates-data";
import { TemplatePreview } from "@/components/whatsapp/TemplatePreview";
import { TemplateFormDialog } from "@/components/whatsapp/TemplateFormDialog";
import { Choice, Empty } from "@/components/genie/ui";
import {
  toSaveRequest,
  toWaTemplate,
  useDeleteTemplate,
  useSaveTemplate,
  useSubmitTemplate,
  useSyncTemplates,
  useTemplates,
} from "@/api/templates";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong. Please try again.";

function StatusBadge({ status }: { status: WaTemplate["status"] }) {
  const meta = statusMeta[status];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", meta.className)}>
      {meta.label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
  ];
  const [size, unit] = [...units].reverse().find(([s]) => seconds >= s) ?? units[0]!;
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    -Math.floor(seconds / size),
    unit,
  );
}

export default function TemplatesPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const isAdmin = user.role === "tenant_admin";

  const templatesQuery = useTemplates();
  const saveTemplate = useSaveTemplate();
  const submitTemplate = useSubmitTemplate();
  const deleteTemplate = useDeleteTemplate();
  const syncTemplates = useSyncTemplates();

  // Keep the API record next to its UI shape: the actions need the original.
  const items = useMemo(
    () => (templatesQuery.data ?? []).map((dto: TemplateDto) => ({ dto, tpl: toWaTemplate(dto) })),
    [templatesQuery.data],
  );

  const [language, setLanguage] = useState("All languages");
  const [status, setStatus] = useState("All statuses");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [previewing, setPreviewing] = useState<WaTemplate | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WaTemplate | null>(null);

  const languages = useMemo(
    () => ["All languages", ...new Set(items.map((i) => i.tpl.language))],
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      ({ tpl: t }) =>
        (category === "All" || t.category === category) &&
        (language === "All languages" || t.language === language) &&
        (status === "All statuses" || statusMeta[t.status].label === status) &&
        (!q || t.name.includes(q) || t.body.toLowerCase().includes(q)),
    );
  }, [items, query, category, language, status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: items.length };
    for (const { tpl } of items) c[tpl.category] = (c[tpl.category] ?? 0) + 1;
    return c;
  }, [items]);

  const run = async (work: () => Promise<unknown>, success: string) => {
    try {
      await work();
      toast.success(success);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const duplicate = (t: WaTemplate) =>
    run(
      () =>
        saveTemplate.mutateAsync({
          body: toSaveRequest({ ...t, name: `${t.name}_copy`.slice(0, 100) }),
        }),
      `Duplicated as draft “${t.name}_copy”`,
    );

  const copyMessage = (t: WaTemplate) => {
    navigator.clipboard?.writeText(t.body).catch(() => undefined);
    toast.success("Message body copied to clipboard");
  };

  const submit = async (t: WaTemplate) => {
    try {
      const result = await submitTemplate.mutateAsync(t.id);
      toast.success(
        result.status === "approved"
          ? `“${t.name}” is approved`
          : `“${t.name}” submitted — WhatsApp usually reviews within minutes`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = (t: WaTemplate) => {
    if (!window.confirm(`Delete “${t.name}”? This cannot be undone.`)) return;
    void run(() => deleteTemplate.mutateAsync(t.id), `Deleted “${t.name}”`);
  };

  const sync = async () => {
    try {
      const { created, updated } = await syncTemplates.mutateAsync();
      toast.success(`Synced from Meta: ${created} new, ${updated} updated`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const editable = (t: WaTemplate) => t.status === "draft" || t.status === "rejected";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Message Templates"
        subtitle="WhatsApp only allows business-started messages to use templates that Meta has approved."
        actions={
          isAdmin && (
            <>
              <Button
                variant="outline"
                disabled={syncTemplates.isPending}
                onClick={() => void sync()}
              >
                <RefreshCw className={cn(syncTemplates.isPending && "animate-spin")} /> Sync from
                Meta
              </Button>
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> New template
              </Button>
            </>
          )
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <Choice label="Language" value={language} onChange={setLanguage} options={languages} />
          <Choice
            label="Approval status"
            value={status}
            onChange={setStatus}
            options={["All statuses", "Approved", "Pending review", "Rejected", "Local draft"]}
          />
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search templates…"
            aria-label="Search templates"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["All", ...templateCategories].map((c) => (
            <Button
              variant="ghost"
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                category === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {c}
              <span className="ml-1.5 opacity-70">{counts[c] ?? 0}</span>
            </Button>
          ))}
        </div>
      </div>

      {templatesQuery.isError ? (
        <Empty
          title={errorMessage(templatesQuery.error)}
          action={
            <Button variant="outline" onClick={() => void templatesQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : templatesQuery.isPending ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading templates…</p>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed bg-card p-10 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">
            {items.length === 0 ? "No templates yet" : "No templates match"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length === 0
              ? "Create one, or sync the templates you already have in Meta."
              : "Try a different search or category."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ dto, tpl: t }) => (
            <Card key={t.id} className="flex flex-col shadow-card">
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold">{t.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[11px]">
                        {t.category}
                      </Badge>
                      <Badge variant="outline" className="text-[11px]">
                        {t.language}
                      </Badge>
                    </div>
                  </div>
                  <StatusBadge status={t.status} />
                </div>

                <div className="rounded-lg bg-chat-bg p-2.5">
                  <div className="rounded-md bg-bubble-out px-2.5 py-2 shadow-sm">
                    <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed">
                      {t.body}
                    </p>
                  </div>
                </div>

                {dto.status === "rejected" && dto.rejectionReason && (
                  <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                    {dto.rejectionReason}
                  </p>
                )}

                <div className="mt-auto flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    Updated {relativeTime(t.updatedAt)}
                  </span>
                  <div className="flex items-center gap-1">
                    {isAdmin && editable(t) && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={submitTemplate.isPending}
                        onClick={() => void submit(t)}
                      >
                        <ShieldCheck /> Submit
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Preview ${t.name}`}
                      onClick={() => setPreviewing(t)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`More actions for ${t.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setPreviewing(t)}>
                          <Eye className="h-4 w-4" /> Preview
                        </DropdownMenuItem>
                        {t.status === "approved" && (
                          <DropdownMenuItem
                            onClick={() => navigate("/campaigns", { state: { templateId: t.id } })}
                          >
                            <Send className="h-4 w-4" /> Use in a campaign
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => copyMessage(t)}>
                          <FileText className="h-4 w-4" /> Copy message
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuItem onClick={() => void duplicate(t)}>
                              <Copy className="h-4 w-4" /> Duplicate
                            </DropdownMenuItem>
                            {editable(t) && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditing(t);
                                  setFormOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" /> Edit
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => remove(t)}
                            >
                              <Trash2 className="h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!previewing} onOpenChange={(o) => !o && setPreviewing(null)}>
        <DialogContent className="max-w-md">
          {previewing && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-base">{previewing.name}</DialogTitle>
                <div className="flex items-center gap-2 pt-1">
                  <Badge variant="secondary" className="text-[11px]">
                    {previewing.category}
                  </Badge>
                  <Badge variant="outline" className="text-[11px]">
                    {previewing.language}
                  </Badge>
                  <StatusBadge status={previewing.status} />
                </div>
              </DialogHeader>
              <TemplatePreview template={previewing} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => copyMessage(previewing)}>
                  <Copy className="h-4 w-4" /> Copy message
                </Button>
                {previewing.status === "approved" && (
                  <Button
                    onClick={() => navigate("/campaigns", { state: { templateId: previewing.id } })}
                  >
                    <Send className="h-4 w-4" /> Use in a campaign
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        onSave={async (draft, id) => {
          try {
            await saveTemplate.mutateAsync({ id, body: toSaveRequest(draft) });
            toast.success(id ? "Template updated" : `Saved “${draft.name}” as a draft`);
            return true;
          } catch (err) {
            toast.error(errorMessage(err));
            return false;
          }
        }}
      />
    </div>
  );
}
