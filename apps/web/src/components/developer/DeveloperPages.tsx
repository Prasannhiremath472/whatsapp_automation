import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Copy } from "lucide-react";
import { toast } from "sonner";
import { API_ORIGIN, useApiKeys, useApiLogs, useApiLogSummary, useOpenApi, type OpenApiOperation } from "@/api/developer";
import { useWhatsappAccounts } from "@/api/whatsapp";
import { Metrics, Status, Table } from "@/components/genie/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Could not copy. Select the text and copy it manually."),
  );
}

function Code({ children }: { children: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-muted p-3 pr-12 text-xs leading-relaxed">{children}</pre>
      <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1" aria-label="Copy code" onClick={() => copy(children)}>
        <Copy />
      </Button>
    </div>
  );
}

const SEND_EXAMPLE = `curl -X POST ${API_ORIGIN}/public/v1/messages \\
  -H "Authorization: Bearer gk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+919876543210",
    "type": "template",
    "template": { "name": "order_update", "language": "en", "variables": ["Priya", "#1042"] }
  }'`;

export function GetStartedPage() {
  const keys = useApiKeys();
  const accounts = useWhatsappAccounts();
  const connected = accounts.data?.some((a) => a.status === "connected") ?? false;
  const hasKey = (keys.data ?? []).some((k) => !k.revokedAt);

  const steps = [
    { done: connected, title: "Connect your WhatsApp number", text: "Messages are sent from your own WhatsApp Business number.", to: "/whatsapp-accounts", cta: "WhatsApp accounts" },
    { done: hasKey, title: "Create an API key", text: "Give your software a key with only the permissions it needs.", to: "/api-keys", cta: "API keys" },
    { done: false, title: "Send your first message", text: "Use an approved template, then check the result in the API logs.", to: "/api-docs", cta: "Read the docs" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Get Started" subtitle="Send WhatsApp messages from your own software in three steps." />
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="rounded-xl border bg-card p-4">
            <span className={cn("flex size-7 items-center justify-center rounded-full text-xs font-semibold", s.done ? "bg-primary-soft text-primary" : "border text-muted-foreground")}>{i + 1}</span>
            <h2 className="mt-3 font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            <Button asChild variant="link" className="mt-2 h-auto p-0">
              <Link to={s.to}>
                {s.cta} <ArrowRight />
              </Link>
            </Button>
          </li>
        ))}
      </ol>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Your API address</h2>
        <Code>{`${API_ORIGIN}/public/v1`}</Code>
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Example: send a template message</h2>
        <Code>{SEND_EXAMPLE}</Code>
        <p className="text-xs text-muted-foreground">
          Only approved templates can start a conversation. Free text works for 24 hours after the customer last wrote to you. More in the <Link to="/api-docs" className="text-primary underline">API documentation</Link>.
        </p>
      </section>
    </div>
  );
}

export function ApiLogsPage() {
  const [status, setStatus] = useState<"" | "success" | "error">("");
  const [page, setPage] = useState(1);
  const logs = useApiLogs({ ...(status ? { status } : {}), page });
  const summary = useApiLogSummary();
  const data = logs.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <PageHeader title="API Logs" subtitle="Every call your software made in the last 30 days. Message content is never stored here." />
      <Metrics
        items={[
          { label: "Requests (24 h)", value: (summary.data?.requests ?? 0).toLocaleString() },
          { label: "Errors (24 h)", value: (summary.data?.errors ?? 0).toLocaleString() },
          { label: "Error rate", value: summary.data && summary.data.requests ? `${Math.round((summary.data.errors / summary.data.requests) * 1000) / 10}%` : "0%" },
          { label: "Avg. response", value: `${summary.data?.avgDurationMs ?? 0} ms` },
        ]}
      />
      <div className="flex items-center gap-2">
        <label className="text-sm" htmlFor="log-status">
          Show
        </label>
        <select
          id="log-status"
          className="h-9 rounded-md border bg-card px-3 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as "" | "success" | "error");
            setPage(1);
          }}
        >
          <option value="">All requests</option>
          <option value="success">Successful</option>
          <option value="error">Errors only</option>
        </select>
      </div>

      {logs.isError && (
        <p role="alert" className="text-sm text-destructive">
          {logs.error instanceof ApiError && logs.error.status === 403 ? "Only business admins can see API logs." : "Could not load the logs."}
        </p>
      )}
      {data && data.items.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
      {data && data.items.length > 0 && (
        <Table headers={["Time", "Request", "Status", "Key", "Duration", "From"]}>
          {data.items.map((l) => (
            <tr key={l.id}>
              <td className="whitespace-nowrap text-xs">{new Date(l.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
              <td className="font-mono text-xs">
                {l.method} {l.path}
              </td>
              <td>
                <Status>{l.status < 400 ? `Success ${l.status}` : `Failed ${l.status}`}</Status>
                {l.error && <p className="mt-1 max-w-[16rem] text-xs text-destructive">{l.error}</p>}
              </td>
              <td className="text-xs">{l.apiKeyName ?? "—"}</td>
              <td className="text-xs tabular-nums">{l.durationMs} ms</td>
              <td className="text-xs text-muted-foreground">{l.ip ?? "—"}</td>
            </tr>
          ))}
        </Table>
      )}
      {data && pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

const METHOD_STYLE: Record<string, string> = { get: "bg-info/10 text-info", post: "bg-primary-soft text-primary" };

export function ApiDocsPage() {
  const doc = useOpenApi();
  const base = doc.data?.servers[0]?.url ?? API_ORIGIN;

  return (
    <div className="space-y-5">
      <PageHeader title="API Documentation" subtitle="The public API, generated from the live service." />
      {doc.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {doc.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load the API description right now.
        </p>
      )}
      {doc.data && (
        <>
          <p className="max-w-3xl text-sm text-muted-foreground">{doc.data.info.description}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-mono">{base}</span>
            <a className="text-primary underline" href={`${base}/public/v1/openapi.json`} target="_blank" rel="noreferrer">
              OpenAPI file (for Postman and code generators)
            </a>
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Authentication</h2>
            <Code>{`Authorization: Bearer gk_live_YOUR_KEY`}</Code>
            <p className="text-xs text-muted-foreground">Limit: 120 requests a minute per key; over that you get HTTP 429 with a Retry-After header. Errors look like {`{ "statusCode": 400, "message": "...", "error": "Bad Request" }`}.</p>
          </section>

          {Object.entries(doc.data.paths).flatMap(([path, ops]) =>
            (Object.entries(ops) as [string, OpenApiOperation][]).map(([method, op]) => (
              <article key={`${method} ${path}`} className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded px-2 py-0.5 text-xs font-bold uppercase", METHOD_STYLE[method] ?? "bg-muted")}>{method}</span>
                  <code className="text-sm">{path}</code>
                </div>
                <div>
                  <h3 className="font-semibold">{op.summary}</h3>
                  {op.description && <p className="mt-1 text-sm text-muted-foreground">{op.description}</p>}
                </div>
                {op.parameters && op.parameters.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {op.parameters.map((p) => (
                      <li key={p.name}>
                        <code>{p.name}</code> <span className="text-muted-foreground">({p.in}{p.required ? ", required" : ""}) {p.description ?? ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {Object.values(op.requestBody?.content ?? {}).flatMap((c) => Object.values(c.examples ?? {})).map((ex) => (
                  <div key={ex.summary} className="space-y-1">
                    <p className="text-xs font-medium">Example: {ex.summary}</p>
                    <Code>{JSON.stringify(ex.value, null, 2)}</Code>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 text-xs">
                  {Object.entries(op.responses).map(([code, r]) => (
                    <span key={code} className="rounded-md bg-muted px-2 py-1">
                      <strong>{code}</strong> {r.description}
                    </span>
                  ))}
                </div>
              </article>
            )),
          )}
        </>
      )}
    </div>
  );
}

const COMING_CHANNELS = ["Instagram", "Facebook Messenger", "Telegram", "SMS", "Email"];

export function ChannelsPage() {
  const accounts = useWhatsappAccounts();
  return (
    <div className="space-y-5">
      <PageHeader title="Channels" subtitle="Where you talk to your customers." />
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">WhatsApp</h2>
        {accounts.isSuccess && accounts.data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No WhatsApp number connected. <Link className="text-primary underline" to="/whatsapp-accounts">Connect one</Link>.
          </p>
        )}
        {(accounts.data ?? []).map((a) => (
          <Link key={a.id} to="/whatsapp-accounts" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-4">
            <div>
              <p className="font-medium">{a.displayPhoneNumber ?? a.phoneNumberId}</p>
              <p className="text-xs text-muted-foreground">WhatsApp Business Cloud API{a.isMock ? " (test mode)" : ""}</p>
            </div>
            <Status>{a.status[0]!.toUpperCase() + a.status.slice(1)}</Status>
          </Link>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">More channels</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {COMING_CHANNELS.map((c) => (
            <div key={c} className="rounded-xl border bg-card p-3 text-center">
              <p className="text-sm font-medium">{c}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Coming soon</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
