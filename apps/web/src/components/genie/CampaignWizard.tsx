import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { CONTACT_VARIABLE_FIELDS, variableCount } from "@whatsapp-crm/shared-types";
import { TemplatePreview } from "@/components/whatsapp/TemplatePreview";
import { useAudiencePreview, useCampaignAction, useSaveCampaign } from "@/api/campaigns";
import { useContactTags } from "@/api/contacts";
import { toWaTemplate, useApprovedTemplates } from "@/api/templates";
import { useWhatsappAccounts } from "@/api/whatsapp";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import {
  FIELD_LABEL,
  OBJECTIVES,
  headerVariableCount,
  nowInZone,
  previewBody,
  resizeVars,
  toAudience,
  toSaveRequest,
  type VarForm,
  type WizardDraft,
} from "./campaign-helpers";
import { Choice, Field, Modal, Wizard } from "./ui";

const STEPS = ["Details", "Audience", "Message", "Personalize", "Schedule", "Review"];

const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong. Please try again.";

interface Props {
  initial: WizardDraft | null;
  onClose: () => void;
}

export function CampaignWizard({ initial, onClose }: Props) {
  const { tenant } = useSession();
  const [draft, setDraft] = useState<WizardDraft | null>(initial);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Re-initialise whenever the wizard is opened with a different draft.
  useEffect(() => {
    setDraft(initial);
    setStep(0);
  }, [initial]);

  const templatesQuery = useApprovedTemplates();
  const tagsQuery = useContactTags();
  const accountsQuery = useWhatsappAccounts();
  const save = useSaveCampaign();
  const action = useCampaignAction();

  const templates = templatesQuery.data ?? [];
  const template = templates.find((t) => t.id === draft?.templateId);
  const audience = draft ? toAudience(draft) : null;
  const audienceReady =
    !!draft &&
    (draft.audienceMode === "all" ||
      (draft.audienceMode === "tags" ? draft.tags.length > 0 : draft.contactIds.length > 0));
  const preview = useAudiencePreview(audienceReady ? audience : null);
  const sample = preview.data?.sample[0];
  const account = accountsQuery.data?.[0];
  const connected = account?.status === "connected";

  const bodyCount = template ? variableCount(template.body) : 0;
  const headerCount = headerVariableCount(template);
  const needsMedia = !!template && ["image", "video", "document"].includes(template.headerType);

  // Keep the variable forms in step with the chosen template.
  useEffect(() => {
    if (!template) return;
    setDraft((d) =>
      d && (d.bodyVars.length !== bodyCount || d.headerVars.length !== headerCount)
        ? {
            ...d,
            bodyVars: resizeVars(d.bodyVars, bodyCount),
            headerVars: resizeVars(d.headerVars, headerCount),
          }
        : d,
    );
  }, [template, bodyCount, headerCount]);

  const set = <K extends keyof WizardDraft>(key: K, value: WizardDraft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  const setVar = (kind: "bodyVars" | "headerVars", index: number, patch: Partial<VarForm>) =>
    setDraft((d) =>
      d ? { ...d, [kind]: d[kind].map((v, i) => (i === index ? { ...v, ...patch } : v)) } : d,
    );

  const scheduleError = useMemo(() => {
    if (!draft || draft.scheduleMode !== "later") return null;
    if (!draft.date || !draft.time) return "Choose a date and time.";
    const now = nowInZone(tenant.timezone);
    if (`${draft.date} ${draft.time}` <= `${now.date} ${now.time}`)
      return "Pick a time in the future.";
    return null;
  }, [draft, tenant.timezone]);

  if (!draft)
    return (
      <Modal open={false} onClose={onClose} title="Create campaign">
        {null}
      </Modal>
    );

  const missingStatic = [...draft.bodyVars, ...draft.headerVars].some(
    (v) => v.source === "static" && !v.value.trim(),
  );
  const mediaInvalid = needsMedia && !/^https:\/\/\S+$/.test(draft.headerMediaUrl.trim());

  const valid =
    step === 0
      ? draft.name.trim().length > 0
      : step === 1
        ? audienceReady && (preview.data?.eligible ?? 0) > 0
        : step === 2
          ? !!template && !mediaInvalid
          : step === 3
            ? !missingStatic
            : step === 4
              ? !scheduleError
              : connected;

  const persist = async (launch: boolean) => {
    setBusy(true);
    try {
      const saved = await save.mutateAsync({ id: draft.id, body: toSaveRequest(draft) });
      // Remember the id so a failed launch followed by a retry updates this draft
      // instead of creating a second one.
      setDraft((d) => (d ? { ...d, id: saved.id } : d));
      if (launch) {
        const launched = await action.mutateAsync({ id: saved.id, action: "launch" });
        toast.success(
          launched.status === "scheduled"
            ? "Campaign scheduled"
            : "Campaign launched — messages are being sent",
        );
      } else {
        toast.success("Draft saved");
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const eligible = preview.data?.eligible ?? 0;

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={draft.id ? "Edit campaign" : "Create campaign"}
      description="Send an approved WhatsApp template to a group of contacts."
      wide
    >
      <Wizard
        steps={STEPS}
        step={step}
        setStep={setStep}
        finishLabel={draft.scheduleMode === "later" ? "Schedule campaign" : "Launch campaign"}
        onFinish={() => void persist(true)}
        {...(draft.name.trim() ? { onDraft: () => void persist(false) } : {})}
        valid={valid && !busy}
      >
        {step === 0 && (
          <>
            <Field
              label="Campaign name"
              value={draft.name}
              onChange={(v) => set("name", v)}
              placeholder="e.g. November admissions announcement"
              required
            />
            <Choice
              label="Objective"
              value={draft.objective}
              onChange={(v) => set("objective", v)}
              options={OBJECTIVES}
            />
            <Field
              label="Description (optional)"
              type="textarea"
              value={draft.description}
              onChange={(v) => set("description", v)}
            />
          </>
        )}

        {step === 1 && (
          <>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium">Who should receive this?</legend>
              {(
                [
                  ["all", "All contacts"],
                  ["tags", "Contacts with a tag"],
                  ...(draft.contactIds.length > 0 || draft.audienceMode === "contacts"
                    ? ([["contacts", `Selected contacts (${draft.contactIds.length})`]] as const)
                    : []),
                ] as const
              ).map(([mode, label]) => (
                <label key={mode} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="audience"
                    checked={draft.audienceMode === mode}
                    onChange={() => set("audienceMode", mode)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>

            {draft.audienceMode === "tags" && (
              <div className="flex flex-wrap gap-2">
                {(tagsQuery.data ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No tags yet. Tag contacts on the Contacts page first.
                  </p>
                )}
                {(tagsQuery.data ?? []).map((t) => {
                  const on = draft.tags.includes(t.name);
                  return (
                    <button
                      key={t.name}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        set(
                          "tags",
                          on ? draft.tags.filter((x) => x !== t.name) : [...draft.tags, t.name],
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:border-primary/40"}`}
                    >
                      {t.name} <span className="opacity-70">{t.contacts}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div
              className="flex items-center gap-3 rounded-lg bg-primary-soft p-5"
              aria-live="polite"
            >
              <Megaphone className="size-6 text-primary" />
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {audienceReady ? eligible.toLocaleString() : "—"}
                </p>
                <p className="text-sm text-muted-foreground">
                  contacts will receive this
                  {preview.data &&
                    preview.data.optedOut > 0 &&
                    ` · ${preview.data.optedOut.toLocaleString()} opted out are excluded`}
                </p>
              </div>
            </div>
            {preview.data && preview.data.sample.length > 0 && (
              <p className="text-sm text-muted-foreground">
                e.g. {preview.data.sample.map((c) => c.name || `+${c.phone}`).join(", ")}
              </p>
            )}
            {audienceReady && preview.data && eligible === 0 && (
              <p className="text-sm text-destructive">
                No contacts in this audience can receive messages.
              </p>
            )}
          </>
        )}

        {step === 2 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-3">
              <label className="flex flex-col gap-2 text-xs font-medium">
                Approved template
                <select
                  aria-label="Campaign template"
                  className="h-10 w-full rounded-md border bg-card px-3 text-sm font-normal"
                  value={draft.templateId}
                  onChange={(e) => set("templateId", e.target.value)}
                >
                  <option value="">Select a template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} · {t.language}
                    </option>
                  ))}
                </select>
              </label>
              {!templatesQuery.isPending && templates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  You have no approved templates yet.{" "}
                  <Link className="text-primary underline" to="/templates">
                    Create and submit one
                  </Link>
                  .
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                WhatsApp only lets businesses start conversations with templates Meta has approved.
              </p>
              {needsMedia && template && (
                <Field
                  label={`${template.headerType[0]!.toUpperCase()}${template.headerType.slice(1)} URL for the header (https)`}
                  value={draft.headerMediaUrl}
                  onChange={(v) => set("headerMediaUrl", v)}
                  placeholder="https://cdn.example.com/offer.jpg"
                  required
                />
              )}
            </div>
            {template && <TemplatePreview template={toWaTemplate(template)} sample={false} />}
          </div>
        )}

        {step === 3 && template && (
          <>
            {bodyCount + headerCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                This template has no variables — every contact gets the same message.
              </p>
            ) : (
              <div className="space-y-4">
                {headerCount > 0 && (
                  <VariableRow
                    label="Header variable"
                    form={draft.headerVars[0]}
                    onChange={(p) => setVar("headerVars", 0, p)}
                  />
                )}
                {draft.bodyVars.map((v, i) => (
                  <VariableRow
                    key={i}
                    label={`Variable {{${i + 1}}}`}
                    form={v}
                    onChange={(p) => setVar("bodyVars", i, p)}
                  />
                ))}
              </div>
            )}
            <div className="rounded-lg bg-chat-bg p-4">
              <p className="mb-2 text-xs text-muted-foreground">
                Preview{sample ? ` for ${sample.name || `+${sample.phone}`}` : ""}
              </p>
              <p className="whitespace-pre-wrap rounded-lg bg-bubble-out p-3 text-sm">
                {previewBody(template, draft.bodyVars, sample)}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              If a contact has no value for a field and no fallback is set, that contact is skipped
              and marked failed rather than sent a half-empty message.
            </p>
          </>
        )}

        {step === 4 && (
          <>
            <Choice
              label="Delivery"
              value={draft.scheduleMode === "now" ? "Send immediately" : "Schedule for later"}
              onChange={(v) => set("scheduleMode", v === "Send immediately" ? "now" : "later")}
              options={["Send immediately", "Schedule for later"]}
            />
            {draft.scheduleMode === "later" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Date"
                  type="date"
                  value={draft.date}
                  onChange={(v) => set("date", v)}
                />
                <Field
                  label="Time"
                  type="time"
                  value={draft.time}
                  onChange={(v) => set("time", v)}
                />
              </div>
            )}
            {scheduleError && (
              <p role="alert" className="text-sm text-destructive">
                {scheduleError}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Times use your business timezone: {tenant.timezone}.
            </p>
          </>
        )}

        {step === 5 && template && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">{draft.name}</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Recipients</dt>
                  <dd className="font-medium tabular-nums">{eligible.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Template</dt>
                  <dd className="font-mono text-xs">{template.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Sends</dt>
                  <dd>
                    {draft.scheduleMode === "now"
                      ? "Immediately"
                      : `${draft.date} at ${draft.time} (${tenant.timezone})`}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">From</dt>
                  <dd>{account?.displayPhoneNumber ?? account?.phoneNumberId ?? "—"}</dd>
                </div>
              </dl>
              {!connected && (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    No WhatsApp account is connected.{" "}
                    <Link to="/whatsapp-accounts" className="underline">
                      Connect one
                    </Link>{" "}
                    to launch.
                  </span>
                </p>
              )}
              {connected && account?.isMock && (
                <p className="rounded-md bg-warning/10 p-3 text-xs">
                  This is a demo number: messages are simulated and not delivered to real phones.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Messages are sent gradually to stay within WhatsApp's limits. You can pause or
                cancel while it runs.
              </p>
            </div>
            <TemplatePreview
              template={{
                ...toWaTemplate(template),
                body: previewBody(template, draft.bodyVars, sample),
              }}
              sample={false}
            />
          </div>
        )}
      </Wizard>
    </Modal>
  );
}

function VariableRow({
  label,
  form,
  onChange,
}: {
  label: string;
  form: VarForm | undefined;
  onChange: (patch: Partial<VarForm>) => void;
}) {
  if (!form) return null;
  return (
    <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr]">
      <Choice
        label={label}
        value={form.source === "static" ? "Fixed text" : "Contact field"}
        onChange={(v) => onChange({ source: v === "Fixed text" ? "static" : "field" })}
        options={["Contact field", "Fixed text"]}
      />
      {form.source === "field" ? (
        <>
          <label className="flex min-w-0 flex-col gap-2 text-xs font-medium">
            Field
            <select
              aria-label={`${label} field`}
              className="h-9 min-w-0 rounded-md border bg-card px-3 text-sm font-normal"
              value={form.field}
              onChange={(e) => onChange({ field: e.target.value as VarForm["field"] })}
            >
              {CONTACT_VARIABLE_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {FIELD_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="If empty, use"
            value={form.fallback}
            onChange={(v) => onChange({ fallback: v })}
            placeholder="e.g. there"
          />
        </>
      ) : (
        <div className="sm:col-span-2">
          <Field
            label="Text"
            value={form.value}
            onChange={(v) => onChange({ value: v })}
            required
          />
        </div>
      )}
    </div>
  );
}
