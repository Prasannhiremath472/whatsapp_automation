import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Megaphone, Pencil, Plus, Tag, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { ContactDto } from "@whatsapp-crm/shared-types";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  useBulkDeleteContacts,
  useBulkTag,
  useContactLocations,
  useContactTags,
  useContacts,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
} from "@/api/contacts";
import { ApiError, downloadFile } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useDebounced } from "@/hooks/use-debounced";
import { ImportContactsDialog } from "./ImportContactsDialog";
import { PagerBar } from "./Pagination";
import { Choice, Empty, Field, Modal, SearchBox, Status, Table } from "./ui";

const ALL_TAGS = "All tags";
const ALL_LOCATIONS = "All locations";
const ALL_STATUSES = "All statuses";
const LEAD_STATUSES = ["New", "Qualified", "Enrolled", "Customer", "Lost"];
const PAGE_SIZE = 25;

interface Draft {
  id: string | null;
  name: string;
  phone: string;
  email: string;
  location: string;
  leadStatus: string;
  tags: string;
  notes: string;
  optedOut: boolean;
}

const blank: Draft = {
  id: null,
  name: "",
  phone: "",
  email: "",
  location: "",
  leadStatus: "New",
  tags: "",
  notes: "",
  optedOut: false,
};

const toDraft = (c: ContactDto): Draft => ({
  id: c.id,
  name: c.name,
  phone: `+${c.phone}`,
  email: c.email ?? "",
  location: c.location ?? "",
  leadStatus: c.leadStatus,
  tags: c.tags.join(", "),
  notes: c.notes ?? "",
  optedOut: c.optedOut,
});

const splitTags = (value: string) => [
  ...new Set(
    value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  ),
];

const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong. Please try again.";

export function ContactsPage() {
  const navigate = useNavigate();
  const { user, tenant } = useSession();
  const isAdmin = user.role === "tenant_admin";

  const [query, setQuery] = useState("");
  const [tag, setTag] = useState(ALL_TAGS);
  const [location, setLocation] = useState(ALL_LOCATIONS);
  const [status, setStatus] = useState(ALL_STATUSES);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const search = useDebounced(query.trim());
  const filters = {
    page,
    pageSize: PAGE_SIZE,
    ...(search ? { q: search } : {}),
    ...(tag !== ALL_TAGS ? { tag } : {}),
    ...(location !== ALL_LOCATIONS ? { location } : {}),
    ...(status !== ALL_STATUSES ? { leadStatus: status } : {}),
  };

  const contacts = useContacts(filters);
  const tags = useContactTags();
  const locations = useContactLocations();
  const create = useCreateContact();
  const update = useUpdateContact();
  const remove = useDeleteContact();
  const bulkTagMutation = useBulkTag();
  const bulkDelete = useBulkDeleteContacts();

  const rows = contacts.data?.data ?? [];
  const total = contacts.data?.meta.total ?? 0;
  const allOnPageSelected = rows.length > 0 && rows.every((c) => selected.has(c.id));
  const tagOptions = useMemo(
    () => [ALL_TAGS, ...(tags.data?.map((t) => t.name) ?? [])],
    [tags.data],
  );
  const locationOptions = useMemo(
    () => [ALL_LOCATIONS, ...(locations.data ?? [])],
    [locations.data],
  );

  // Any filter change returns to the first page.
  const withReset =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const save = async () => {
    if (!editing) return;
    const body = {
      name: editing.name.trim(),
      phone: editing.phone.trim(),
      email: editing.email.trim(),
      location: editing.location.trim(),
      leadStatus: editing.leadStatus,
      notes: editing.notes,
      tags: splitTags(editing.tags),
      defaultCountryCode: "91",
    };
    try {
      if (editing.id)
        await update.mutateAsync({ id: editing.id, body: { ...body, optedOut: editing.optedOut } });
      else await create.mutateAsync(body);
      toast.success("Contact saved");
      setEditing(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const deleteOne = async (c: ContactDto) => {
    if (!window.confirm(`Delete ${c.name || `+${c.phone}`}? This cannot be undone.`)) return;
    try {
      await remove.mutateAsync(c.id);
      toggle(c.id, false);
      toast.success("Contact deleted");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const applyBulkTag = async () => {
    try {
      const { affected } = await bulkTagMutation.mutateAsync({
        contactIds: [...selected],
        tag: bulkTag.trim(),
        action: "add",
      });
      toast.success(`Tag added to ${affected} contact${affected === 1 ? "" : "s"}`);
      setBulkTag("");
      setSelected(new Set());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const deleteSelected = async () => {
    if (
      !window.confirm(
        `Delete ${selected.size} contacts? Contacts with conversation history are kept.`,
      )
    )
      return;
    try {
      const { deleted, blocked } = await bulkDelete.mutateAsync([...selected]);
      toast.success(
        `Deleted ${deleted}${blocked ? ` · ${blocked} kept (have conversations)` : ""}`,
      );
      setSelected(new Set());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const sendCampaign = () =>
    navigate("/campaigns", {
      state: { newCampaign: { mode: "contacts", tags: [], contactIds: [...selected] } },
    });

  const exportCsv = async () => {
    try {
      await downloadFile("/contacts/export", "genie-contacts.csv", {
        q: search || undefined,
        tag: tag !== ALL_TAGS ? tag : undefined,
        location: location !== ALL_LOCATIONS ? location : undefined,
        leadStatus: status !== ALL_STATUSES ? status : undefined,
      });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-5 genie-table">
      <PageHeader
        title="Contacts"
        subtitle={`${total.toLocaleString()} contact${total === 1 ? "" : "s"} · ${tenant.name}`}
        actions={
          <>
            <Button variant="outline" onClick={() => void exportCsv()}>
              <Download /> Export
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload /> Import CSV
            </Button>
            <Button onClick={() => setEditing({ ...blank })}>
              <Plus /> Add contact
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <SearchBox
          value={query}
          onChange={withReset(setQuery)}
          placeholder="Search name, phone or email…"
        />
        <Choice label="Tag" value={tag} onChange={withReset(setTag)} options={tagOptions} />
        <Choice
          label="Location"
          value={location}
          onChange={withReset(setLocation)}
          options={locationOptions}
        />
        <Choice
          label="Lead status"
          value={status}
          onChange={withReset(setStatus)}
          options={[ALL_STATUSES, ...LEAD_STATUSES]}
        />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-primary-soft p-3">
          <span className="pb-2 text-sm font-medium">{selected.size} selected</span>
          <div className="w-48">
            <Field
              label="Add tag"
              value={bulkTag}
              onChange={setBulkTag}
              placeholder="e.g. Diwali list"
            />
          </div>
          <Button
            variant="outline"
            disabled={!bulkTag.trim() || bulkTagMutation.isPending}
            onClick={() => void applyBulkTag()}
          >
            <Tag /> Apply tag
          </Button>
          {isAdmin && (
            <Button onClick={sendCampaign}>
              <Megaphone /> Send campaign
            </Button>
          )}
          {isAdmin && (
            <Button variant="ghost" onClick={() => void deleteSelected()}>
              <Trash2 className="text-destructive" /> Delete
            </Button>
          )}
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {contacts.isError ? (
        <Empty
          title={errorMessage(contacts.error)}
          action={
            <Button variant="outline" onClick={() => void contacts.refetch()}>
              Try again
            </Button>
          }
        />
      ) : contacts.isPending ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading contacts…</p>
      ) : rows.length === 0 ? (
        <Empty
          title={
            search || tag !== ALL_TAGS || location !== ALL_LOCATIONS || status !== ALL_STATUSES
              ? "No contacts match these filters"
              : "No contacts yet"
          }
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload /> Import CSV
              </Button>
              <Button onClick={() => setEditing({ ...blank })}>
                <Plus /> Add contact
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <Table
            headers={["", "Contact", "Phone", "Tags", "Source", "Last interaction", "Actions"]}
          >
            <tr className="bg-muted/20">
              <td>
                <input
                  aria-label="Select all contacts on this page"
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={(e) => rows.forEach((c) => toggle(c.id, e.target.checked))}
                />
              </td>
              <td colSpan={6} className="text-xs text-muted-foreground">
                {rows.length} shown
              </td>
            </tr>
            {rows.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td>
                  <input
                    aria-label={`Select ${c.name || c.phone}`}
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={(e) => toggle(c.id, e.target.checked)}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="text-left font-medium hover:underline"
                    onClick={() => setEditing(toDraft(c))}
                  >
                    {c.name || <span className="text-muted-foreground">(no name)</span>}
                  </button>
                  {c.email && <p className="mt-0.5 text-xs text-muted-foreground">{c.email}</p>}
                </td>
                <td className="whitespace-nowrap text-xs tabular-nums">+{c.phone}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {c.optedOut && (
                      <span className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive">
                        Opted out
                      </span>
                    )}
                    {c.tags.map((t) => (
                      <Status key={t}>{t}</Status>
                    ))}
                  </div>
                </td>
                <td>{c.source}</td>
                <td className="whitespace-nowrap text-muted-foreground">
                  {c.lastInteractionAt ? new Date(c.lastInteractionAt).toLocaleDateString() : "—"}
                </td>
                <td>
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${c.name || c.phone}`}
                      onClick={() => setEditing(toDraft(c))}
                    >
                      <Pencil />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${c.name || c.phone}`}
                        onClick={() => void deleteOne(c)}
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <PagerBar
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
            label="contacts"
          />
        </>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit contact" : "Add contact"}
      >
        {editing && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                value={editing.name}
                onChange={(v) => setEditing({ ...editing, name: v })}
                required
              />
              <Field
                label="WhatsApp number (with country code)"
                value={editing.phone}
                onChange={(v) => setEditing({ ...editing, phone: v })}
                placeholder="+91 98765 43210"
                required
              />
              <Field
                label="Email"
                type="email"
                value={editing.email}
                onChange={(v) => setEditing({ ...editing, email: v })}
              />
              <Field
                label="Location"
                value={editing.location}
                onChange={(v) => setEditing({ ...editing, location: v })}
              />
              <Choice
                label="Lead status"
                value={editing.leadStatus}
                onChange={(v) => setEditing({ ...editing, leadStatus: v })}
                options={
                  LEAD_STATUSES.includes(editing.leadStatus)
                    ? LEAD_STATUSES
                    : [editing.leadStatus, ...LEAD_STATUSES]
                }
              />
              <Field
                label="Tags (comma separated)"
                value={editing.tags}
                onChange={(v) => setEditing({ ...editing, tags: v })}
              />
            </div>
            <Field
              label="Internal notes"
              type="textarea"
              value={editing.notes}
              onChange={(v) => setEditing({ ...editing, notes: v })}
            />
            {editing.id && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.optedOut}
                  onChange={(e) => setEditing({ ...editing, optedOut: e.target.checked })}
                />
                Opted out — never include in campaigns
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending || update.isPending}>
                Save contact
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ImportContactsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(r) => toast.success(`Imported: ${r.created} added, ${r.updated} updated`)}
      />
    </div>
  );
}
