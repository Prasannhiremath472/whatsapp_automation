import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Audience, CampaignDto, CampaignStatus } from "@whatsapp-crm/shared-types";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  useCampaignAction,
  useCampaignSummary,
  useCampaigns,
  useDeleteCampaign,
} from "@/api/campaigns";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useDebounced } from "@/hooks/use-debounced";
import { CampaignDetail } from "./CampaignDetail";
import { CampaignWizard } from "./CampaignWizard";
import {
  STATUS_LABEL,
  blankDraft,
  draftFromCampaign,
  formatInZone,
  percent,
  type WizardDraft,
} from "./campaign-helpers";
import { PagerBar } from "./Pagination";
import { Choice, Empty, Metrics, SearchBox, Status, Table } from "./ui";

const ALL = "All statuses";
const STATUS_OPTIONS = [ALL, ...Object.values(STATUS_LABEL)];
const PAGE_SIZE = 20;

const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong. Please try again.";

interface NavState {
  /** Audience handed over from the Contacts page ("Send campaign" on a selection). */
  newCampaign?: Audience;
  /** Template handed over from the Templates page ("Use in a campaign"). */
  templateId?: string;
}

export function CampaignsPage() {
  const { user, tenant } = useSession();
  const isAdmin = user.role === "tenant_admin";
  const location = useLocation();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [statusLabel, setStatusLabel] = useState(ALL);
  const [page, setPage] = useState(1);
  const [wizard, setWizard] = useState<WizardDraft | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const search = useDebounced(query.trim());
  const status =
    (Object.entries(STATUS_LABEL).find(([, label]) => label === statusLabel)?.[0] as
      CampaignStatus | undefined) ?? undefined;

  const campaigns = useCampaigns({
    page,
    pageSize: PAGE_SIZE,
    ...(search ? { q: search } : {}),
    ...(status ? { status } : {}),
  });
  const summary = useCampaignSummary();
  const action = useCampaignAction();
  const remove = useDeleteCampaign();

  // Open the wizard pre-filled when arriving from Contacts / Templates.
  useEffect(() => {
    const state = location.state as NavState | null;
    if (!state || !isAdmin) return;
    if (state.newCampaign || state.templateId) {
      const draft = blankDraft();
      if (state.newCampaign) {
        draft.audienceMode = state.newCampaign.mode;
        draft.contactIds = state.newCampaign.contactIds;
        draft.tags = state.newCampaign.tags;
      }
      if (state.templateId) draft.templateId = state.templateId;
      setWizard(draft);
      // Clear the hand-off so a refresh does not reopen the wizard.
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, isAdmin]);

  const rows = campaigns.data?.data ?? [];
  const s = summary.data;
  const metrics = useMemo(
    () => [
      { label: "Total campaigns", value: s?.total ?? "—" },
      { label: "Running", value: s?.running ?? "—" },
      { label: "Scheduled", value: s?.scheduled ?? "—" },
      { label: "Completed", value: s?.completed ?? "—" },
    ],
    [s],
  );

  const toggle = async (c: CampaignDto) => {
    try {
      await action.mutateAsync({ id: c.id, action: c.status === "paused" ? "resume" : "pause" });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const del = async (c: CampaignDto) => {
    if (!window.confirm(`Delete “${c.name}”? Its delivery history will be removed.`)) return;
    try {
      await remove.mutateAsync(c.id);
      toast.success("Campaign deleted");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-5 genie-table">
      <PageHeader
        title="Campaigns"
        subtitle="Send WhatsApp messages to many contacts at once."
        actions={
          isAdmin && (
            <Button onClick={() => setWizard(blankDraft())}>
              <Plus /> Create campaign
            </Button>
          )
        }
      />

      <Metrics items={metrics} />

      <div className="flex flex-wrap items-end gap-3">
        <SearchBox
          value={query}
          onChange={(v) => {
            setQuery(v);
            setPage(1);
          }}
          placeholder="Search campaigns…"
        />
        <Choice
          label="Status"
          value={statusLabel}
          onChange={(v) => {
            setStatusLabel(v);
            setPage(1);
          }}
          options={STATUS_OPTIONS}
        />
      </div>

      {campaigns.isError ? (
        <Empty
          title={errorMessage(campaigns.error)}
          action={
            <Button variant="outline" onClick={() => void campaigns.refetch()}>
              Try again
            </Button>
          }
        />
      ) : campaigns.isPending ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading campaigns…</p>
      ) : rows.length === 0 ? (
        <Empty
          title={search || status ? "No matching campaigns" : "No campaigns yet"}
          action={
            isAdmin && !search && !status ? (
              <Button onClick={() => setWizard(blankDraft())}>
                <Plus /> Create your first campaign
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Table
            headers={[
              "Campaign",
              "Status",
              "Audience",
              "Schedule",
              "Sent",
              "Delivered",
              "Read",
              "Actions",
            ]}
          >
            {rows.map((c) => (
              <tr key={c.id}>
                <td>
                  <button
                    type="button"
                    className="text-left font-medium hover:underline"
                    onClick={() => setViewing(c.id)}
                  >
                    {c.name}
                  </button>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {c.templateName}
                  </p>
                </td>
                <td>
                  <Status>{STATUS_LABEL[c.status]}</Status>
                </td>
                <td className="tabular-nums">{c.counts.total.toLocaleString()}</td>
                <td className="whitespace-nowrap text-xs">
                  {c.scheduledAt && c.status === "scheduled"
                    ? formatInZone(c.scheduledAt, tenant.timezone)
                    : c.startedAt
                      ? formatInZone(c.startedAt, tenant.timezone)
                      : "—"}
                </td>
                <td className="tabular-nums">
                  {c.counts.sent.toLocaleString()}
                  {c.counts.failed > 0 && (
                    <span className="ml-1 text-xs text-destructive">
                      ({c.counts.failed} failed)
                    </span>
                  )}
                </td>
                <td className="tabular-nums">{percent(c.counts.delivered, c.counts.sent)}</td>
                <td className="tabular-nums">{percent(c.counts.read, c.counts.sent)}</td>
                <td>
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`View ${c.name}`}
                      onClick={() => setViewing(c.id)}
                    >
                      <Eye />
                    </Button>
                    {isAdmin && (c.status === "draft" || c.status === "scheduled") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${c.name}`}
                        onClick={() => setWizard(draftFromCampaign(c, tenant.timezone))}
                      >
                        <Pencil />
                      </Button>
                    )}
                    {isAdmin && (c.status === "running" || c.status === "paused") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${c.status === "paused" ? "Resume" : "Pause"} ${c.name}`}
                        onClick={() => void toggle(c)}
                      >
                        {c.status === "paused" ? <Play /> : <Pause />}
                      </Button>
                    )}
                    {isAdmin && c.status !== "running" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${c.name}`}
                        onClick={() => void del(c)}
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
            total={campaigns.data?.meta.total ?? 0}
            onPageChange={setPage}
            label="campaigns"
          />
        </>
      )}

      {wizard && <CampaignWizard initial={wizard} onClose={() => setWizard(null)} />}
      <CampaignDetail campaignId={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
