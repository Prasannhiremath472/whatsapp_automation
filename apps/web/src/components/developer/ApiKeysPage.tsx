import { useState, type FormEvent } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { API_SCOPES, type ApiScope } from "@whatsapp-crm/shared-types";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/api/developer";
import { Modal, Status, Table } from "@/components/genie/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);
const when = (d: string | null) => (d ? new Date(d).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "Never");

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Could not copy. Select the text and copy it manually."),
  );
}

export function ApiKeysPage() {
  const { user } = useSession();
  const isAdmin = user.role === "tenant_admin";
  const query = useApiKeys();
  const revoke = useRevokeApiKey();
  const keys = query.data ?? [];
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ name: string; secret: string } | null>(null);

  const state = (k: (typeof keys)[number]) =>
    k.revokedAt ? "Revoked" : k.expiresAt && new Date(k.expiresAt).getTime() < Date.now() ? "Expired" : "Active";

  return (
    <div className="space-y-5">
      <PageHeader
        title="API Keys"
        subtitle="Let your own software send messages and manage contacts."
        actions={
          isAdmin && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Create API key
            </Button>
          )
        }
      />

      <p className="max-w-3xl rounded-lg border bg-card p-3 text-xs text-muted-foreground">
        A key is like a password for your software. Give each system its own key with only the permissions it needs, never put a key in a website or mobile app, and revoke it if it leaks. Keys are shown once, when you create them.
      </p>

      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          {query.error instanceof ApiError && query.error.status === 403 ? "Only business admins can manage API keys." : "Could not load your keys."}
        </p>
      )}
      {query.isSuccess && keys.length === 0 && <p className="text-sm text-muted-foreground">You have no API keys yet.</p>}

      {keys.length > 0 && (
        <Table headers={["Name", "Key", "Permissions", "Status", "Last used", "Requests", ...(isAdmin ? [""] : [])]}>
          {keys.map((k) => (
            <tr key={k.id}>
              <td className="font-medium">{k.name}</td>
              <td className="whitespace-nowrap font-mono text-xs">{k.prefix}…</td>
              <td className="max-w-[16rem] text-xs text-muted-foreground">{k.scopes.join(", ")}</td>
              <td>
                <Status>{state(k)}</Status>
                {k.expiresAt && !k.revokedAt && <p className="mt-1 text-[11px] text-muted-foreground">Expires {when(k.expiresAt)}</p>}
              </td>
              <td className="whitespace-nowrap text-xs">{when(k.lastUsedAt)}</td>
              <td className="text-xs tabular-nums">{k.requestCount.toLocaleString()}</td>
              {isAdmin && (
                <td>
                  {!k.revokedAt && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Revoke ${k.name}`}
                      title="Revoke"
                      onClick={() => {
                        if (!confirm(`Revoke "${k.name}"? Anything using it stops working immediately. This cannot be undone.`)) return;
                        revoke.mutate(k.id, {
                          onSuccess: () => toast.success("Key revoked"),
                          onError: (err) => toast.error(errorText(err, "Could not revoke the key")),
                        });
                      }}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </Table>
      )}

      <CreateKeyDialog open={creating} onClose={() => setCreating(false)} onCreated={(name, s) => setSecret({ name, secret: s })} />
      <Modal open={!!secret} onClose={() => setSecret(null)} title="Your new API key" description={secret ? `For "${secret.name}"` : "API key"}>
        {secret && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Copy it now and store it somewhere safe, like your server's secret settings. For security it is not shown again.</p>
            <div className="flex gap-2">
              <Input readOnly aria-label="API key" className="font-mono text-xs" value={secret.secret} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={() => copy(secret.secret)}>
                <Copy /> Copy
              </Button>
            </div>
            <Button onClick={() => setSecret(null)}>I have saved it</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CreateKeyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (name: string, secret: string) => void }) {
  const create = useCreateApiKey();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(["messages:send"]);
  const [expiry, setExpiry] = useState("");

  const toggle = (id: ApiScope) => setScopes((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const close = () => {
    setName("");
    setScopes(["messages:send"]);
    setExpiry("");
    onClose();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: name.trim(), scopes, ...(expiry ? { expiresInDays: Number(expiry) } : {}) },
      {
        onSuccess: (created) => {
          onCreated(created.name, created.secret);
          close();
        },
        onError: (err) => toast.error(errorText(err, "Could not create the key")),
      },
    );
  };

  return (
    <Modal open={open} onClose={close} title="Create API key">
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1.5">
          <Label htmlFor="key-name">Name</Label>
          <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="e.g. Online store backend" />
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">What can this key do?</legend>
          {API_SCOPES.map((s) => (
            <label key={s.id} className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={scopes.includes(s.id)} onChange={() => toggle(s.id)} />
              <span>
                {s.label}
                <span className="block font-mono text-xs text-muted-foreground">{s.id}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="key-expiry">Expires</Label>
          <select id="key-expiry" className="h-9 w-full rounded-md border bg-card px-3 text-sm" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            <option value="">Never</option>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="365">In 1 year</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || !name.trim() || scopes.length === 0}>
            {create.isPending ? "Creating…" : "Create key"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
