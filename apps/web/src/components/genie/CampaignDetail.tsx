import { useState } from "react";
import { Ban, Pause, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { CampaignDto, RecipientStatus } from "@whatsapp-crm/shared-types";
import { Button } from "@/components/ui/button";
import { useCampaign, useCampaignAction, useCampaignRecipients } from "@/api/campaigns";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { STATUS_LABEL, formatInZone, percent } from "./campaign-helpers";
import { PagerBar } from "./Pagination";
import { Choice, Metrics, Modal, Status, Table } from "./ui";

const RECIPIENT_FILTERS: { label: string; value: RecipientStatus | undefined }[] = [
  { label: "All recipients", value: undefined },
  { label: "Failed", value: "failed" },
  { label: "Delivered", value: "delivered" },
  { label: "Read", value: "read" },
  { label: "Sent", value: "sent" },
  { label: "Pending", value: "pending" },
  { label: "Skipped", value: "skipped" },
];

const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong. Please try again.";

/** Stacked bar: read ⊂ delivered ⊂ sent, plus failed and still-pending. */
function ProgressBar({ c }: { c: CampaignDto["counts"] }) {
  if (c.total === 0) return null;
  const pct = (n: number) => `${(n / c.total) * 100}%`;
  const segments = [
    { label: "Read", n: c.read, cls: "bg-primary" },
    { label: "Delivered", n: c.delivered - c.read, cls: "bg-primary/60" },
    { label: "Sent", n: c.sent - c.delivered, cls: "bg-primary/30" },
    { label: "Failed", n: c.failed, cls: "bg-destructive" },
    { label: "Skipped", n: c.skipped, cls: "bg-muted-foreground/40" },
  ];
  return (
    <div>
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`${c.sent} of ${c.total} sent`}
      >
        {segments.map((s) => (
          <div
            key={s.label}
            className={s.cls}
            style={{ width: pct(Math.max(0, s.n)) }}
            title={`${s.label}: ${s.n}`}
          />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${s.cls}`} /> {s.label}{" "}
            {Math.max(0, s.n).toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Props {
  campaignId: string | null;
  onClose: () => void;
}

export function CampaignDetail({ campaignId, onClose }: Props) {
  const { user, tenant } = useSession();
  const isAdmin = user.role === "tenant_admin";
  const campaign = useCampaign(campaignId);
  const action = useCampaignAction();
  const [filter, setFilter] = useState(RECIPIENT_FILTERS[0]!.label);
  const [page, setPage] = useState(1);

  const c = campaign.data;
  const statusFilter = RECIPIENT_FILTERS.find((f) => f.label === filter)?.value;
  const live = c?.status === "running" || c?.status === "paused";
  const recipients = useCampaignRecipients(
    c && c.status !== "draft" && c.status !== "scheduled" ? c.id : null,
    statusFilter,
    page,
    c?.status === "running",
  );

  const run = async (
    name: "pause" | "resume" | "cancel" | "retry-failed",
    confirmText?: string,
  ) => {
    if (!c || (confirmText && !window.confirm(confirmText))) return;
    try {
      await action.mutateAsync({ id: c.id, action: name });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open={!!campaignId}
      onClose={onClose}
      title={c?.name ?? "Campaign"}
      description={c ? `Template: ${c.templateName}` : "Loading…"}
      wide
    >
      {campaign.isError && (
        <p className="text-sm text-destructive">{errorMessage(campaign.error)}</p>
      )}
      {c && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Status>{STATUS_LABEL[c.status]}</Status>
            {c.scheduledAt && c.status === "scheduled" && (
              <span className="text-sm text-muted-foreground">
                Sends {formatInZone(c.scheduledAt, tenant.timezone)}
              </span>
            )}
            {c.startedAt && (
              <span className="text-sm text-muted-foreground">
                Started {formatInZone(c.startedAt, tenant.timezone)}
              </span>
            )}
            {c.statusReason && c.status !== "completed" && (
              <span className="text-sm text-muted-foreground">· {c.statusReason}</span>
            )}
            <div className="ml-auto flex gap-2">
              {isAdmin && c.status === "running" && (
                <Button variant="outline" onClick={() => void run("pause")}>
                  <Pause /> Pause
                </Button>
              )}
              {isAdmin && c.status === "paused" && (
                <Button onClick={() => void run("resume")}>
                  <Play /> Resume
                </Button>
              )}
              {isAdmin &&
                (c.status === "completed" || c.status === "failed") &&
                c.counts.failed > 0 && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      void run(
                        "retry-failed",
                        `Send again to the ${c.counts.failed} recipients that failed?`,
                      )
                    }
                  >
                    <RotateCcw /> Retry {c.counts.failed} failed
                  </Button>
                )}
              {isAdmin && ["scheduled", "running", "paused"].includes(c.status) && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    void run(
                      "cancel",
                      "Cancel this campaign? Messages not yet sent will not be sent.",
                    )
                  }
                >
                  <Ban className="text-destructive" /> Cancel
                </Button>
              )}
            </div>
          </div>

          {c.status !== "draft" && (
            <>
              <Metrics
                items={[
                  { label: "Recipients", value: c.counts.total.toLocaleString() },
                  {
                    label: "Sent",
                    value: c.counts.sent.toLocaleString(),
                    hint: percent(c.counts.sent, c.counts.total),
                  },
                  {
                    label: "Delivered",
                    value: c.counts.delivered.toLocaleString(),
                    hint: percent(c.counts.delivered, c.counts.sent),
                  },
                  {
                    label: "Read",
                    value: c.counts.read.toLocaleString(),
                    hint: percent(c.counts.read, c.counts.sent),
                  },
                ]}
              />
              <ProgressBar c={c.counts} />
              {live && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  Updating live…
                </p>
              )}
            </>
          )}

          {recipients.data && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h3 className="text-sm font-semibold">Recipients</h3>
                <Choice
                  label="Show"
                  value={filter}
                  onChange={(v) => {
                    setFilter(v);
                    setPage(1);
                  }}
                  options={RECIPIENT_FILTERS.map((f) => f.label)}
                />
              </div>
              {recipients.data.data.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No recipients in this view.
                </p>
              ) : (
                <Table headers={["Contact", "Phone", "Status", "Detail"]}>
                  {recipients.data.data.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name || <span className="text-muted-foreground">(no name)</span>}</td>
                      <td className="whitespace-nowrap text-xs tabular-nums">+{r.phone}</td>
                      <td>
                        <Status>
                          {r.status === "failed"
                            ? "Failed"
                            : r.status[0]!.toUpperCase() + r.status.slice(1)}
                        </Status>
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {r.errorMessage ??
                          (r.readAt
                            ? `Read ${formatInZone(r.readAt, tenant.timezone)}`
                            : r.deliveredAt
                              ? `Delivered ${formatInZone(r.deliveredAt, tenant.timezone)}`
                              : r.sentAt
                                ? `Sent ${formatInZone(r.sentAt, tenant.timezone)}`
                                : "")}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
              <PagerBar
                page={page}
                pageSize={20}
                total={recipients.data.meta.total}
                onPageChange={setPage}
                label="recipients"
              />
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
