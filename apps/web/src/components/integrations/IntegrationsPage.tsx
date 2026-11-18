import { useEffect, useState, type FormEvent } from "react";
import { Copy, KeyRound, List, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { WEBHOOK_EVENTS, type WebhookEndpointDto, type WebhookEventName } from "@whatsapp-crm/shared-types";
import {
  useCreateWebhookEndpoint,
  useDeleteWebhookEndpoint,
  useRotateWebhookSecret,
  useTestWebhookEndpoint,
  useUpdateWebhookEndpoint,
  useWebhookDeliveries,
  useWebhookEndpoints,
} from "@/api/webhook-endpoints";
import { Modal, Status, Table } from "@/components/genie/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

/** Tools the business may expect to find here; none are connectable yet, so they are not pretended to be. */
const COMING_SOON = ["Shopify", "WooCommerce", "Google Sheets", "HubSpot", "Zoho CRM", "Salesforce"];

const VERIFY_SNIPPET = `// Node.js: verify a Genie webhook
import crypto from "node:crypto";

function verify(rawBody, signatureHeader, secret) {
  const [t, v1] = signatureHeader.split(",").map((p) => p.split("=")[1]);
  const expected = crypto.createHmac("sha256", secret).update(t + "." + rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}`;

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Could not copy. Select the text and copy it manually."),
  );
}

export function IntegrationsPage() {
  const { user } = useSession();
  const isAdmin = user.role === "tenant_admin";
  const query = useWebhookEndpoints();
  const endpoints = query.data ?? [];
  const update = useUpdateWebhookEndpoint();
  const test = useTestWebhookEndpoint();
  const remove = useDeleteWebhookEndpoint();
  const rotate = useRotateWebhookSecret();

  const [editing, setEditing] = useState<{ endpoint: WebhookEndpointDto | null } | null>(null);
  const [logFor, setLogFor] = useState<WebhookEndpointDto | null>(null);
  const [secretShown, setSecretShown] = useState<{ name: string; secret: string } | null>(null);

  const toggle = (e: WebhookEndpointDto, active: boolean) =>
    update.mutate(
      { id: e.id, body: { name: e.name, url: e.url, events: e.events, active } },
      { onError: (err) => toast.error(errorText(err, "Could not update the webhook")) },
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Integrations"
        subtitle="Connect Genie to the tools you already use."
        actions={
          isAdmin && (
            <Button onClick={() => setEditing({ endpoint: null })}>
              <Plus />
              Add webhook
            </Button>
          )
        }
      />

      <section className="space-y-3 rounded-xl border bg-card p-5">
        <div>
          <h2 className="font-semibold">Webhooks (Zapier, Make, n8n or your own server)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Genie sends a signed HTTPS request to your URL whenever something happens, so other tools can react: add a row to a sheet, create a CRM lead, ping your team.
          </p>
        </div>

        {query.isSuccess && endpoints.length === 0 && <p className="text-sm text-muted-foreground">No webhooks yet.</p>}
        {query.isError && (
          <p role="alert" className="text-sm text-destructive">
            {query.error instanceof ApiError && query.error.status === 403 ? "Only business admins can manage webhooks." : "Could not load webhooks."}
          </p>
        )}

        {endpoints.length > 0 && (
          <Table headers={["Webhook", "Events", "Last delivery", "On", "Actions"]}>
            {endpoints.map((e) => (
              <tr key={e.id}>
                <td>
                  <p className="font-medium">{e.name}</p>
                  <p className="mt-1 max-w-[16rem] truncate text-xs text-muted-foreground" title={e.url}>
                    {e.url}
                  </p>
                </td>
                <td className="text-xs">{e.events.join(", ")}</td>
                <td className="text-xs">
                  {e.lastDeliveryAt ? (
                    <>
                      <Status>{e.lastStatus === "success" ? "Success" : "Failed"}</Status>
                      <p className="mt-1 text-muted-foreground">{new Date(e.lastDeliveryAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Never</span>
                  )}
                </td>
                <td>
                  <Switch aria-label={`${e.name} is on`} checked={e.active} disabled={update.isPending} onCheckedChange={(on) => toggle(e, on)} />
                </td>
                <td className="whitespace-nowrap">
                  <Button variant="ghost" size="icon" title="Delivery log" aria-label={`Delivery log of ${e.name}`} onClick={() => setLogFor(e)}>
                    <List />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Send a test event"
                    aria-label={`Send a test event to ${e.name}`}
                    onClick={() =>
                      test.mutate(e.id, {
                        onSuccess: () => {
                          toast.success("Test event queued. See the delivery log in a few seconds.");
                          setLogFor(e);
                        },
                        onError: (err) => toast.error(errorText(err, "Could not send the test")),
                      })
                    }
                  >
                    <Send />
                  </Button>
                  <Button variant="ghost" size="icon" title="Edit" aria-label={`Edit ${e.name}`} onClick={() => setEditing({ endpoint: e })}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Create a new signing secret"
                    aria-label={`New secret for ${e.name}`}
                    onClick={() => {
                      if (!confirm("Create a new signing secret? The old one stops working immediately.")) return;
                      rotate.mutate(e.id, {
                        onSuccess: (r) => setSecretShown({ name: r.name, secret: r.secret }),
                        onError: (err) => toast.error(errorText(err, "Could not create a new secret")),
                      });
                    }}
                  >
                    <KeyRound />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${e.name}`}
                    onClick={() => {
                      if (!confirm(`Delete "${e.name}"? Its delivery log is deleted too.`)) return;
                      remove.mutate(e.id, { onSuccess: () => toast.success("Webhook deleted") });
                    }}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-primary">How to verify a webhook</summary>
          <p className="my-2 text-xs text-muted-foreground">
            Each request has an <code>X-Genie-Signature</code> header: <code>t=&lt;time&gt;,v1=&lt;signature&gt;</code>. The signature is an HMAC-SHA256 of <code>time.body</code> using your signing secret. Reject requests whose signature does not match.
            Failed deliveries are retried 5 times over about 9 hours.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{VERIFY_SNIPPET}</pre>
        </details>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">More integrations</h2>
        <p className="text-xs text-muted-foreground">
          Zapier, Make and n8n work today through webhooks above. Direct connections to these tools are not available yet:
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {COMING_SOON.map((name) => (
            <div key={name} className="rounded-xl border bg-card p-3 text-center">
              <p className="text-sm font-medium">{name}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Coming soon</p>
            </div>
          ))}
        </div>
      </section>

      <EndpointEditor
        state={editing}
        onClose={() => setEditing(null)}
        onCreated={(name, secret) => setSecretShown({ name, secret })}
      />
      <DeliveryLog endpoint={logFor} onClose={() => setLogFor(null)} />
      <Modal open={!!secretShown} onClose={() => setSecretShown(null)} title="Your signing secret" description={secretShown ? `For "${secretShown.name}"` : "Signing secret"}>
        {secretShown && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Copy it now and keep it safe. For security it is not shown again; if you lose it, create a new one.</p>
            <div className="flex gap-2">
              <Input readOnly aria-label="Signing secret" value={secretShown.secret} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => copy(secretShown.secret)}>
                <Copy /> Copy
              </Button>
            </div>
            <Button onClick={() => setSecretShown(null)}>Done</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function EndpointEditor({
  state,
  onClose,
  onCreated,
}: {
  state: { endpoint: WebhookEndpointDto | null } | null;
  onClose: () => void;
  onCreated: (name: string, secret: string) => void;
}) {
  const create = useCreateWebhookEndpoint();
  const update = useUpdateWebhookEndpoint();
  const endpoint = state?.endpoint ?? null;
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEventName[]>(["message.received"]);

  useEffect(() => {
    if (!state) return;
    setName(endpoint?.name ?? "");
    setUrl(endpoint?.url ?? "");
    setEvents(endpoint?.events ?? ["message.received"]);
  }, [state, endpoint]);

  const toggleEvent = (id: WebhookEventName) => setEvents((list) => (list.includes(id) ? list.filter((e) => e !== id) : [...list, id]));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = { name: name.trim(), url: url.trim(), events, active: endpoint?.active ?? true };
    if (endpoint) {
      update.mutate(
        { id: endpoint.id, body },
        {
          onSuccess: () => {
            toast.success("Webhook saved");
            onClose();
          },
          onError: (err) => toast.error(errorText(err, "Could not save the webhook")),
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: (created) => {
          onCreated(created.name, created.secret);
          onClose();
        },
        onError: (err) => toast.error(errorText(err, "Could not create the webhook")),
      });
    }
  };

  const pending = create.isPending || update.isPending;
  return (
    <Modal open={!!state} onClose={onClose} title={endpoint ? "Edit webhook" : "Add webhook"}>
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1.5">
          <Label htmlFor="wh-name">Name</Label>
          <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="e.g. Zapier: new leads" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wh-url">URL</Label>
          <Input id="wh-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://hooks.zapier.com/…" />
          <p className="text-xs text-muted-foreground">Must be a public https address.</p>
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Send me events when</legend>
          {WEBHOOK_EVENTS.map((ev) => (
            <label key={ev.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={events.includes(ev.id)} onChange={() => toggleEvent(ev.id)} />
              <span>
                {ev.label}
                <span className="block text-xs text-muted-foreground">{ev.id}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !name.trim() || !url.trim() || events.length === 0}>
            {pending ? "Saving…" : endpoint ? "Save webhook" : "Create webhook"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeliveryLog({ endpoint, onClose }: { endpoint: WebhookEndpointDto | null; onClose: () => void }) {
  const log = useWebhookDeliveries(endpoint?.id ?? null);
  return (
    <Modal open={!!endpoint} onClose={onClose} title={endpoint ? `Deliveries to "${endpoint.name}"` : "Deliveries"} wide description="The latest 50 deliveries. This list refreshes every few seconds.">
      {log.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {log.isSuccess && log.data.length === 0 && <p className="text-sm text-muted-foreground">Nothing has been sent yet.</p>}
      {log.isSuccess && log.data.length > 0 && (
        <Table headers={["When", "Event", "Result", "Tries"]}>
          {log.data.map((d) => (
            <tr key={d.id}>
              <td className="whitespace-nowrap text-xs">{new Date(d.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
              <td className="text-xs">{d.event}</td>
              <td>
                <Status>{d.status === "success" ? "Success" : d.status === "failed" ? "Failed" : "Pending: retrying"}</Status>
                {d.error && <p className="mt-1 text-xs text-destructive">{d.error}</p>}
              </td>
              <td className="text-xs">{d.attempts}</td>
            </tr>
          ))}
        </Table>
      )}
    </Modal>
  );
}
