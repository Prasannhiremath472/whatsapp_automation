import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import type { ImportContactRow, ImportContactsResult } from "@whatsapp-crm/shared-types";
import { Button } from "@/components/ui/button";
import { importContactsInChunks } from "@/api/contacts";
import { parseCSV } from "@/lib/csv";
import { ApiError } from "@/lib/api";
import { Choice, Field, Modal } from "./ui";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 50_000;
const NONE = "— Not in file —";

/** CSV column -> contact field. Header names are matched loosely so most exports work unchanged. */
const FIELDS = [
  {
    key: "phone",
    label: "Phone number",
    required: true,
    hints: ["phone", "mobile", "whatsapp", "number", "contact"],
  },
  { key: "name", label: "Name", required: false, hints: ["name", "full name", "customer"] },
  { key: "email", label: "Email", required: false, hints: ["email", "e-mail", "mail"] },
  { key: "location", label: "Location", required: false, hints: ["location", "city", "town"] },
  { key: "leadStatus", label: "Status", required: false, hints: ["status", "stage", "lead"] },
  {
    key: "tags",
    label: "Tags (separate with ;)",
    required: false,
    hints: ["tags", "tag", "segment", "group", "label"],
  },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

function guessColumn(headers: string[], hints: readonly string[]): string {
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const hint of hints) {
    const exact = lower.indexOf(hint);
    if (exact >= 0) return headers[exact]!;
  }
  for (const hint of hints) {
    const partial = lower.findIndex((h) => h.includes(hint));
    if (partial >= 0) return headers[partial]!;
  }
  return NONE;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: (result: ImportContactsResult) => void;
}

export function ImportContactsDialog({ open, onClose, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({
    phone: NONE,
    name: NONE,
    email: NONE,
    location: NONE,
    leadStatus: NONE,
    tags: NONE,
  });
  const [countryCode, setCountryCode] = useState("91");
  const [extraTags, setExtraTags] = useState("");
  const [updateExisting, setUpdateExisting] = useState(true);
  const [consent, setConsent] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportContactsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headers = rows[0] ?? [];
  const dataRows = useMemo(() => rows.slice(1), [rows]);
  const importing = progress !== null && result === null;

  const reset = () => {
    setFileName("");
    setRows([]);
    setResult(null);
    setError(null);
    setProgress(null);
    setConsent(false);
    if (fileInput.current) fileInput.current.value = "";
  };
  const close = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_BYTES)
      return setError("That file is larger than 10 MB. Split it into smaller files.");
    const parsed = parseCSV(await file.text());
    if (parsed.length < 2)
      return setError("The file has no data rows. It needs a header row and at least one contact.");
    if (parsed.length - 1 > MAX_ROWS)
      return setError(`Files are limited to ${MAX_ROWS.toLocaleString()} contacts at a time.`);

    const head = parsed[0]!.map((h) => h.trim());
    setFileName(file.name);
    setRows([head, ...parsed.slice(1)]);
    setMapping(
      Object.fromEntries(FIELDS.map((f) => [f.key, guessColumn(head, f.hints)])) as Record<
        FieldKey,
        string
      >,
    );
  };

  const cell = (row: string[], key: FieldKey): string => {
    const column = mapping[key];
    if (column === NONE) return "";
    return (row[headers.indexOf(column)] ?? "").trim();
  };

  const run = async () => {
    setError(null);
    const payload: ImportContactRow[] = dataRows.map((row) => {
      const tags = cell(row, "tags")
        .split(/[;|]/)
        .map((t) => t.trim())
        .filter(Boolean);
      return {
        phone: cell(row, "phone"),
        name: cell(row, "name"),
        email: cell(row, "email"),
        location: cell(row, "location"),
        leadStatus: cell(row, "leadStatus"),
        ...(tags.length ? { tags } : {}),
      };
    });
    const tags = extraTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    setProgress({ done: 0, total: payload.length });
    try {
      const summary = await importContactsInChunks(
        {
          updateExisting,
          consentConfirmed: true,
          ...(countryCode.trim()
            ? { defaultCountryCode: countryCode.trim().replace(/\D/g, "") }
            : {}),
          ...(tags.length ? { tags } : {}),
        },
        payload,
        (done, total) => setProgress({ done, total }),
      );
      setResult(summary);
      onImported(summary);
    } catch (err) {
      setProgress(null);
      setError(err instanceof ApiError ? err.message : "The import failed. Please try again.");
    }
  };

  const columnOptions = [NONE, ...headers.filter(Boolean)];
  const canImport = dataRows.length > 0 && mapping.phone !== NONE && consent && !importing;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import contacts from CSV"
      description="Upload a spreadsheet exported as CSV."
      wide
    >
      {result ? (
        <ImportSummary result={result} onDone={close} />
      ) : (
        <div className="space-y-5">
          <input
            ref={fileInput}
            hidden
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />

          {!fileName ? (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center hover:border-primary/60 hover:bg-primary-soft/40"
            >
              <Upload className="size-6 text-muted-foreground" />
              <span className="text-sm font-medium">Choose a CSV file</span>
              <span className="text-xs text-muted-foreground">
                Needs a header row and a phone number column. Up to 50,000 contacts.
              </span>
            </button>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <FileSpreadsheet className="size-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {dataRows.length.toLocaleString()} rows found
                  </p>
                </div>
                <Button variant="ghost" size="sm" disabled={importing} onClick={reset}>
                  Change file
                </Button>
              </div>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Match your columns</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {FIELDS.map((f) => (
                    <Choice
                      key={f.key}
                      label={f.required ? `${f.label} *` : f.label}
                      value={mapping[f.key]}
                      onChange={(v) => setMapping((m) => ({ ...m, [f.key]: v }))}
                      options={columnOptions}
                    />
                  ))}
                </div>
                {dataRows[0] && mapping.phone !== NONE && (
                  <p className="text-xs text-muted-foreground">
                    First row: {cell(dataRows[0], "name") || "(no name)"} ·{" "}
                    {cell(dataRows[0], "phone")}
                  </p>
                )}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Options</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Country code for numbers without one"
                    value={countryCode}
                    onChange={setCountryCode}
                    placeholder="91"
                  />
                  <Field
                    label="Tag every imported contact (comma separated)"
                    value={extraTags}
                    onChange={setExtraTags}
                    placeholder="Diwali list"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(e) => setUpdateExisting(e.target.checked)}
                  />
                  Update contacts that already exist (matched by phone number)
                </label>
                <label className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  <span>
                    I confirm these people agreed to receive WhatsApp messages from my business.
                    WhatsApp can restrict accounts that message people without permission.
                  </span>
                </label>
              </section>
            </>
          )}

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
            </p>
          )}

          {fileName && (
            <div className="flex items-center justify-end gap-3 border-t pt-4">
              {progress && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
                </span>
              )}
              <Button variant="outline" onClick={close} disabled={importing}>
                Cancel
              </Button>
              <Button onClick={() => void run()} disabled={!canImport}>
                {importing && <Loader2 className="animate-spin" />}
                Import {dataRows.length.toLocaleString()} contacts
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ImportSummary({ result, onDone }: { result: ImportContactsResult; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <CheckCircle2 className="size-5" />
        <p className="font-semibold">Import finished</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Added", result.created],
          ["Updated", result.updated],
          ["Skipped", result.skipped],
          ["Invalid", result.invalid.length],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {(value as number).toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
      {result.invalid.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Rows that could not be imported</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-3 text-xs">
            {result.invalid.slice(0, 50).map((i) => (
              <li key={`${i.row}-${i.phone}`}>
                Row {i.row + 1}: <span className="font-mono">{i.phone || "(empty)"}</span> —{" "}
                {i.reason}
              </li>
            ))}
          </ul>
          {result.invalid.length > 50 && (
            <p className="text-xs text-muted-foreground">…and {result.invalid.length - 50} more.</p>
          )}
        </div>
      )}
      <div className="flex justify-end">
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
