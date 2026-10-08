import { useMemo, useRef, useState } from "react";
import { AppLayout } from "../components/AppLayout";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { csvRowsToRecipients, parseCsv, type ParsedCsvRecipient } from "../lib/csv";
import {
  useBroadcastCampaigns,
  useBroadcastTemplates,
  useCreateBroadcastCampaign,
  useCreateBroadcastTemplate,
  type BroadcastTemplate,
} from "../api/broadcast";

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700",
    sending: "bg-amber-100 text-amber-700",
    failed: "bg-red-100 text-red-700",
    draft: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[status] ?? styles.draft}`}>{status}</span>
  );
}

function NewTemplateForm() {
  const createTemplate = useCreateBroadcastTemplate();
  const [form, setForm] = useState({
    name: "",
    body: "",
    metaTemplateName: "",
    metaTemplateLanguage: "en_US",
    metaVariableCount: "0",
  });
  const [showMetaFields, setShowMetaFields] = useState(false);

  const handleCreate = () => {
    if (!form.name.trim() || !form.body.trim()) return;
    createTemplate.mutate(
      {
        name: form.name.trim(),
        body: form.body.trim(),
        ...(showMetaFields && form.metaTemplateName.trim()
          ? {
              metaTemplateName: form.metaTemplateName.trim(),
              metaTemplateLanguage: form.metaTemplateLanguage.trim() || "en_US",
              metaVariableCount: Number.parseInt(form.metaVariableCount, 10) || 0,
            }
          : {}),
      },
      {
        onSuccess: () =>
          setForm({ name: "", body: "", metaTemplateName: "", metaTemplateLanguage: "en_US", metaVariableCount: "0" }),
      },
    );
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">New Template</h2>
      <div className="space-y-2">
        <Input placeholder="Template name (internal label)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <textarea
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          rows={3}
          placeholder="Message body — used as free text for existing contacts, or as a display preview for an approved Meta template"
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
        />

        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={showMetaFields} onChange={(e) => setShowMetaFields(e.target.checked)} />
          This uses an approved WhatsApp Message Template (required for recipients who haven't messaged you recently)
        </label>

        {showMetaFields && (
          <div className="grid grid-cols-3 gap-2 rounded-md bg-amber-50 p-3">
            <div className="col-span-2">
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Meta template name</label>
              <Input
                placeholder="e.g. order_update"
                value={form.metaTemplateName}
                onChange={(e) => setForm((f) => ({ ...f, metaTemplateName: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Language code</label>
              <Input value={form.metaTemplateLanguage} onChange={(e) => setForm((f) => ({ ...f, metaTemplateLanguage: e.target.value }))} />
            </div>
            <div className="col-span-3">
              <label className="mb-1 block text-[11px] font-medium text-gray-500">Number of {"{{1}}"}-style variables</label>
              <Input
                type="number"
                min={0}
                value={form.metaVariableCount}
                onChange={(e) => setForm((f) => ({ ...f, metaVariableCount: e.target.value }))}
              />
            </div>
          </div>
        )}

        <Button onClick={handleCreate} disabled={!form.name.trim() || !form.body.trim() || createTemplate.isPending}>
          Create Template
        </Button>
      </div>
    </div>
  );
}

function CsvUploadPanel({
  recipients,
  onParsed,
}: {
  recipients: ParsedCsvRecipient[];
  onParsed: (recipients: ParsedCsvRecipient[], fileName: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    const parsed = csvRowsToRecipients(rows);
    setFileName(file.name);
    onParsed(parsed, file.name);
  };

  const validCount = recipients.filter((r) => !r.error).length;
  const errorCount = recipients.length - validCount;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver ? "border-emerald-500 bg-emerald-50" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {fileName ? (
          <div>
            <p className="text-sm font-medium text-gray-900">{fileName}</p>
            <p className="mt-1 text-xs text-gray-500">
              {validCount} valid recipient{validCount === 1 ? "" : "s"}
              {errorCount > 0 && <span className="text-red-600"> · {errorCount} with errors</span>}
              {" — click to replace"}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-gray-700">Drop a CSV file here, or click to browse</p>
            <p className="mt-1 text-xs text-gray-400">
              Columns: phone number (with country code), name (optional), then template variables in order
            </p>
          </div>
        )}
      </div>

      {recipients.length > 0 && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-gray-200">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 font-medium text-gray-500">Row</th>
                <th className="px-2 py-1.5 font-medium text-gray-500">Phone</th>
                <th className="px-2 py-1.5 font-medium text-gray-500">Name</th>
                <th className="px-2 py-1.5 font-medium text-gray-500">Variables</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recipients.slice(0, 200).map((r) => (
                <tr key={r.rowNumber} className={r.error ? "bg-red-50" : ""}>
                  <td className="px-2 py-1 text-gray-400">{r.rowNumber}</td>
                  <td className="px-2 py-1 font-mono">{r.error ? r.waId || "—" : `+${r.waId}`}</td>
                  <td className="px-2 py-1">{r.name ?? "—"}</td>
                  <td className="px-2 py-1">
                    {r.error ? <span className="text-red-600">{r.error}</span> : r.templateVariables.join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {recipients.length > 200 && (
            <p className="border-t border-gray-100 p-2 text-center text-xs text-gray-400">
              Showing first 200 of {recipients.length} rows
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function NewCampaignForm({ templates }: { templates: BroadcastTemplate[] }) {
  const createCampaign = useCreateBroadcastCampaign();
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [recipients, setRecipients] = useState<ParsedCsvRecipient[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const validRecipients = useMemo(() => recipients.filter((r) => !r.error), [recipients]);

  const variableMismatchCount = useMemo(() => {
    if (!selectedTemplate?.metaTemplateName || selectedTemplate.metaVariableCount === null) return 0;
    return validRecipients.filter((r) => r.templateVariables.length !== selectedTemplate.metaVariableCount).length;
  }, [validRecipients, selectedTemplate]);

  const handleCreate = () => {
    setError(null);
    if (!name.trim() || !templateId || validRecipients.length === 0) return;
    if (variableMismatchCount > 0) {
      setError(
        `${variableMismatchCount} recipient(s) don't have exactly ${selectedTemplate?.metaVariableCount} variable value(s) — fix the CSV before sending.`,
      );
      return;
    }

    createCampaign.mutate(
      {
        name: name.trim(),
        templateId,
        contactIds: [],
        csvRecipients: validRecipients.map((r) => ({
          waId: r.waId,
          name: r.name,
          templateVariables: r.templateVariables,
        })),
      },
      {
        onSuccess: () => {
          setName("");
          setTemplateId("");
          setRecipients([]);
        },
        onError: (err) => {
          const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
          setError(typeof message === "string" ? message : "Failed to create campaign.");
        },
      },
    );
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">New Campaign</h2>
      <div className="space-y-3">
        <Input placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />

        <select
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">Select a template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {t.metaTemplateName ? `(Meta: ${t.metaTemplateName})` : "(free text)"}
            </option>
          ))}
        </select>

        {selectedTemplate?.metaTemplateName && (
          <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
            This template expects <strong>{selectedTemplate.metaVariableCount}</strong> variable value
            {selectedTemplate.metaVariableCount === 1 ? "" : "s"} per recipient (columns 3+ in your CSV).
          </p>
        )}

        <CsvUploadPanel recipients={recipients} onParsed={setRecipients} />

        {variableMismatchCount > 0 && (
          <p className="text-xs text-red-600">
            {variableMismatchCount} recipient(s) have the wrong number of template variables for this template.
          </p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}

        <Button
          onClick={handleCreate}
          disabled={!name.trim() || !templateId || validRecipients.length === 0 || createCampaign.isPending}
        >
          {createCampaign.isPending ? "Sending…" : `Send to ${validRecipients.length} recipient${validRecipients.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}

function CampaignsPanel() {
  const { data: campaigns, isLoading } = useBroadcastCampaigns();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Campaigns</h2>
      {isLoading && <p className="text-xs text-gray-400">Loading…</p>}
      <div className="divide-y divide-gray-100">
        {campaigns?.map((c) => (
          <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
            <div>
              <div className="font-medium text-gray-900">{c.name}</div>
              <div className="text-xs text-gray-500">{c.template.name}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right text-xs text-gray-500">
                <div>
                  {c._counts.sent}/{c._counts.total} sent
                </div>
                {c._counts.failed > 0 && <div className="text-red-600">{c._counts.failed} failed</div>}
              </div>
              <StatusPill status={c.status} />
            </div>
          </div>
        ))}
        {campaigns?.length === 0 && <p className="py-2 text-xs text-gray-400">No campaigns yet.</p>}
      </div>
    </div>
  );
}

export function BroadcastAdminPage() {
  const { data: templates } = useBroadcastTemplates();

  return (
    <AppLayout>
      <div className="p-6">
        <div className="mx-auto max-w-5xl">
          <h1 className="mb-6 text-lg font-semibold text-gray-900">Campaigns</h1>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-4">
              <NewTemplateForm />
              <CampaignsPanel />
            </div>
            <div>{templates && <NewCampaignForm templates={templates} />}</div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
