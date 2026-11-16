import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, MoreHorizontal, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCollection, type Collection, type Row } from "@/lib/admin/store";
import { db, genericStatus, addNote, audit } from "@/services/admin";
import { date as fmtDate, downloadCsv } from "@/lib/admin/format";
import { useCan } from "@/components/admin-layout/useCan";
import type { PermGroup } from "@/lib/permissions/roles";
import { ActivityTimeline, EmptyState, MetricGrid, PageHeader, Panel, StatusBadge, type Metric } from "./primitives";
import { Chart, type ChartSpec } from "./charts";
import { ConfirmDialog, FormDrawer, type Field } from "./forms";
import { cn } from "@/lib/utils";

export interface Column { key: string; label: string; render?: (r: Row) => ReactNode; sortable?: boolean; className?: string; csv?: boolean }
export interface RowAction {
  label: string;
  status?: string;
  confirm?: string;
  destructive?: boolean;
  show?: (r: Row) => boolean;
  fields?: Field[] | (() => Field[]);
  run?: (r: Row, values?: Record<string, any>) => void;
  toast?: string;
}
export interface ResourceConfig {
  title: string;
  description: string;
  collection: keyof typeof db;
  entity: string;
  perm: PermGroup;
  columns: Column[];
  searchKeys: string[];
  filters?: { key: string; label: string }[];
  dateKey?: string;
  metrics?: (rows: Row[]) => Metric[];
  charts?: (rows: Row[]) => ChartSpec[];
  actions?: RowAction[];
  create?: { label: string; fields: Field[] | (() => Field[]); build: (v: Record<string, any>) => Row; validate?: (v: Record<string, any>) => Record<string, string>; after?: (r: Row) => void };
  derive?: (r: Row) => Row;
  edit?: Field[];
  canDelete?: boolean;
  detailTabs?: { label: string; render: (r: Row) => ReactNode }[];
  notes?: boolean;
  top?: (rows: Row[]) => ReactNode;
  titleKey?: string;
  pageSize?: number;
}

const RANGES: Record<string, number> = { "All time": 0, "Last 7 days": 7, "Last 30 days": 30, "Last 90 days": 90 };

export function ResourcePage({ config }: { config: ResourceConfig }) {
  const c = config;
  const coll = db[c.collection] as unknown as Collection<Row>;
  const rawRows = useCollection(coll);
  const rows = useMemo(() => (c.derive ? rawRows.map(c.derive) : rawRows), [rawRows, c.derive]);
  const canManage = useCan(c.perm, "manage");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [range, setRange] = useState("All time");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [pending, setPending] = useState<{ row: Row; action: RowAction } | null>(null);
  const [formAction, setFormAction] = useState<{ row: Row; action: RowAction } | null>(null);
  const [del, setDel] = useState<Row | null>(null);
  const size = c.pageSize ?? 10;
  const titleKey = c.titleKey ?? c.columns[0].key;

  const filterOptions = useMemo(
    () => Object.fromEntries((c.filters ?? []).map((f) => [f.key, [...new Set(rows.map((r) => String(r[f.key])))].sort()])),
    [rows, c.filters],
  );

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    const days = RANGES[range];
    let out = rows.filter(
      (r) =>
        (!ql || c.searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(ql)) || r.id.toLowerCase().includes(ql)) &&
        Object.entries(filters).every(([k, v]) => !v || v === "__all" || String(r[k]) === v) &&
        (!days || !c.dateKey || Date.now() - new Date(r[c.dateKey]).getTime() <= days * 86400000 + 3e9),
    );
    if (sort) out = [...out].sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : a[sort.key] < b[sort.key] ? -1 : 0) * sort.dir);
    return out;
  }, [rows, q, filters, sort, range, c.searchKeys, c.dateKey]);

  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = filtered.slice(page * size, page * size + size);
  const detail = detailId ? rows.find((r) => r.id === detailId) : undefined;

  const doAction = (row: Row, a: RowAction, values?: Record<string, any>) => {
    if (a.run) a.run(row, values);
    else if (a.status) genericStatus(c.collection, row.id, a.status, c.entity);
    toast.success(a.toast ?? `${a.label} · ${row[titleKey] ?? row.id}`, { description: "Demo action recorded in the audit log." });
  };
  const trigger = (row: Row, a: RowAction) => {
    if (a.fields) setFormAction({ row, action: a });
    else if (a.confirm) setPending({ row, action: a });
    else doAction(row, a);
  };

  const exportCsv = () => {
    downloadCsv(`${c.collection}-export.csv`, filtered, [{ key: "id", label: "ID" }, ...c.columns.filter((x) => x.csv !== false).map((x) => ({ key: x.key, label: x.label }))]);
    toast.success(`Exported ${filtered.length} rows`);
  };

  const visibleActions = (r: Row) => (c.actions ?? []).filter((a) => (!a.show || a.show(r)) && (!a.status || a.status !== r.status));

  return (
    <div>
      <PageHeader
        title={c.title}
        description={c.description}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download /> Export CSV</Button>
            {c.create && canManage && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus /> {c.create.label}</Button>}
          </>
        }
      />
      {c.metrics && <MetricGrid metrics={c.metrics(rows)} />}
      {c.top?.(rows)}
      {c.charts && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {c.charts(rows).map((s) => <Panel key={s.title} title={s.title}><Chart spec={s} /></Panel>)}
        </div>
      )}

      <section className="rounded-lg border bg-card shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input aria-label={`Search ${c.title}`} className="pl-8" placeholder={`Search ${c.title.toLowerCase()}…`} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
          </div>
          {(c.filters ?? []).map((f) => (
            <Select key={f.key} value={filters[f.key] ?? "__all"} onValueChange={(v) => { setFilters((s) => ({ ...s, [f.key]: v })); setPage(0); }}>
              <SelectTrigger aria-label={f.label} className="w-auto min-w-36"><SelectValue placeholder={f.label} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All {f.label.toLowerCase()}</SelectItem>
                {filterOptions[f.key].map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          ))}
          {c.dateKey && (
            <Select value={range} onValueChange={(v) => { setRange(v); setPage(0); }}>
              <SelectTrigger aria-label="Date range" className="w-auto min-w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(RANGES).map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {(q || Object.values(filters).some((v) => v && v !== "__all") || range !== "All time") && (
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); setFilters({}); setRange("All time"); }}><X /> Clear</Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                {c.columns.map((col) => (
                  <th key={col.key} className={cn("whitespace-nowrap px-4 py-2.5 font-medium", col.className)}>
                    {col.sortable === false ? col.label : (
                      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setSort((s) => ({ key: col.key, dir: s?.key === col.key && s.dir === 1 ? -1 : 1 }))}>
                        {col.label} <ArrowUpDown className="size-3" />
                      </button>
                    )}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {current.map((r) => (
                <tr key={r.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => setDetailId(r.id)}>
                  {c.columns.map((col) => (
                    <td key={col.key} className={cn("whitespace-nowrap px-4 py-3 text-foreground", col.className)}>
                      {col.render ? col.render(r) : String(r[col.key] ?? "—")}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${r[titleKey]}`}><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">{r.id}</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => setDetailId(r.id)}>View details</DropdownMenuItem>
                        {canManage && c.edit && <DropdownMenuItem onClick={() => setEditRow(r)}>Edit</DropdownMenuItem>}
                        {canManage && visibleActions(r).length > 0 && <DropdownMenuSeparator />}
                        {canManage && visibleActions(r).map((a) => (
                          <DropdownMenuItem key={a.label} className={a.destructive ? "text-destructive focus:text-destructive" : undefined} onClick={() => trigger(r, a)}>
                            {a.label}
                          </DropdownMenuItem>
                        ))}
                        {canManage && c.canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDel(r)}>Delete</DropdownMenuItem>
                          </>
                        )}
                        {!canManage && <DropdownMenuItem disabled>Read-only for your role</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!current.length && <EmptyState />}
        </div>
        <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            Showing {filtered.length ? page * size + 1 : 0}–{Math.min(filtered.length, (page + 1) * size)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-7" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft /></Button>
            <span className="px-2">Page {page + 1} / {pages}</span>
            <Button variant="outline" size="icon" className="size-7" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}><ChevronRight /></Button>
          </div>
        </div>
      </section>

      {c.create && (
        <FormDrawer
          open={createOpen}
          onOpenChange={setCreateOpen}
          title={c.create.label}
          description="Creates a local demo record."
          fields={typeof c.create.fields === "function" ? c.create.fields() : c.create.fields}
          extraValidate={c.create.validate}
          submitLabel="Create"
          onSubmit={(v) => {
            const row = c.create!.build(v);
            coll.insert(row);
            c.create!.after?.(row);
            audit(`${c.entity} created`, c.entity, row.id, "—", String(row[titleKey]));
            toast.success(`${c.entity} created`, { description: String(row[titleKey]) });
          }}
        />
      )}
      {c.edit && (
        <FormDrawer
          open={!!editRow}
          onOpenChange={(o) => !o && setEditRow(null)}
          title={`Edit ${c.entity.toLowerCase()}`}
          fields={c.edit}
          initial={editRow ?? undefined}
          onSubmit={(v) => {
            const patch = Object.fromEntries(c.edit!.map((f) => [f.key, f.type === "number" ? Number(v[f.key]) : v[f.key]]));
            const changed = c.edit!.filter((f) => String(editRow![f.key] ?? "") !== String(patch[f.key] ?? "")).map((f) => f.label);
            coll.update(editRow!.id, patch);
            audit(`${c.entity} edited`, c.entity, editRow!.id, "—", changed.join(", ") || "No changes");
            toast.success(`${c.entity} updated`);
          }}
        />
      )}
      {formAction && (
        <FormDrawer
          open
          onOpenChange={(o) => !o && setFormAction(null)}
          title={`${formAction.action.label} · ${formAction.row[titleKey]}`}
          fields={typeof formAction.action.fields === "function" ? formAction.action.fields() : formAction.action.fields!}
          submitLabel={formAction.action.label}
          onSubmit={(v) => doAction(formAction.row, formAction.action, v)}
        />
      )}
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={`${pending?.action.label}?`}
        description={pending?.action.confirm}
        destructive={pending?.action.destructive}
        confirmLabel={pending?.action.label}
        onConfirm={() => pending && doAction(pending.row, pending.action)}
      />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={`Delete ${del?.[titleKey]}?`}
        description="This removes the demo record from local storage."
        destructive
        confirmLabel="Delete"
        onConfirm={() => { audit(`${c.entity} deleted`, c.entity, del!.id, String(del![titleKey]), "Deleted"); coll.remove(del!.id); toast.success(`${c.entity} deleted`); setDetailId(null); }}
      />

      <DetailDrawer config={c} row={detail} onClose={() => setDetailId(null)} onAction={(a) => detail && trigger(detail, a)} canManage={canManage} actions={detail ? visibleActions(detail) : []} />
    </div>
  );
}

function DetailDrawer({ config: c, row, onClose, onAction, canManage, actions }: { config: ResourceConfig; row?: Row; onClose: () => void; onAction: (a: RowAction) => void; canManage: boolean; actions: RowAction[] }) {
  const audit = useCollection(db.audit);
  const [note, setNote] = useState("");
  const titleKey = c.titleKey ?? c.columns[0].key;
  const history = row ? audit.filter((a) => a.resourceId === row.id).map((a) => ({ at: a.at, title: a.action, text: a.prev !== "—" || a.next !== "—" ? `${a.prev} → ${a.next}` : undefined, by: a.actor })) : [];
  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        {row && (
          <>
            <SheetHeader className="border-b p-5">
              <p className="font-mono text-xs text-muted-foreground">{row.id}</p>
              <SheetTitle className="text-xl">{String(row[titleKey])}</SheetTitle>
              <SheetDescription>{c.entity} record · demo data</SheetDescription>
              {row.status && <div><StatusBadge value={row.status} /></div>}
              {canManage && actions.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {actions.slice(0, 5).map((a) => (
                    <Button key={a.label} size="sm" variant={a.destructive ? "outline" : "secondary"} className={a.destructive ? "text-destructive" : undefined} onClick={() => onAction(a)}>{a.label}</Button>
                  ))}
                </div>
              )}
            </SheetHeader>
            <Tabs defaultValue="overview" className="p-5">
              <TabsList className="flex-wrap">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                {c.detailTabs?.map((t) => <TabsTrigger key={t.label} value={t.label}>{t.label}</TabsTrigger>)}
                {c.notes && <TabsTrigger value="notes">Internal notes</TabsTrigger>}
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2">
                  {c.columns.map((col) => (
                    <div key={col.key}>
                      <dt className="text-xs text-muted-foreground">{col.label}</dt>
                      <dd className="mt-0.5 text-sm font-medium text-foreground">{col.render ? col.render(row) : String(row[col.key] ?? "—")}</dd>
                    </div>
                  ))}
                </dl>
              </TabsContent>
              {c.detailTabs?.map((t) => <TabsContent key={t.label} value={t.label}>{t.render(row)}</TabsContent>)}
              {c.notes && (
                <TabsContent value="notes" className="space-y-3">
                  {canManage && <>
                  <Textarea aria-label="Internal note" placeholder="Add an internal note (not visible to the client)…" value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button size="sm" disabled={!note.trim()} onClick={() => { addNote(c.collection, row.id, note.trim()); setNote(""); toast.success("Note added"); }}>Add note</Button>
                  </>}
                  <div className="space-y-2">
                    {(row.notes ?? []).map((n: any, i: number) => (
                      <div key={i} className="rounded-md border bg-muted/40 p-3 text-sm">
                        <p className="text-foreground">{n.text}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{n.by} · {fmtDate(n.at)}</p>
                      </div>
                    ))}
                    {!(row.notes ?? []).length && <p className="text-xs text-muted-foreground">No notes yet.</p>}
                  </div>
                </TabsContent>
              )}
              <TabsContent value="activity"><div className="pt-2"><ActivityTimeline items={history} /></div></TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
