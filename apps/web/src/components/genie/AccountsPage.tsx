import { useState } from "react";
import { ExternalLink, Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { WhatsappAccountDto } from "@whatsapp-crm/shared-types";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  useConnectWhatsapp,
  useDisconnectWhatsapp,
  useMockConnectWhatsapp,
  useUpdateWhatsapp,
  useWhatsappAccounts,
} from "@/api/whatsapp";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { Empty, Field, Modal, Status } from "./ui";

const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : "Something went wrong. Please try again.";

interface FormState {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}
const emptyForm: FormState = { wabaId: "", phoneNumberId: "", accessToken: "" };

export function AccountsPage() {
  const { user } = useSession();
  const isAdmin = user.role === "tenant_admin";

  const accounts = useWhatsappAccounts();
  const connect = useConnectWhatsapp();
  const mockConnect = useMockConnectWhatsapp();
  const disconnect = useDisconnectWhatsapp();
  const update = useUpdateWhatsapp();

  const [form, setForm] = useState<FormState | null>(null);
  const [limit, setLimit] = useState<{ id: string; value: string } | null>(null);

  const list = accounts.data ?? [];
  const account: WhatsappAccountDto | undefined = list[0];

  const submit = async () => {
    if (!form) return;
    try {
      await connect.mutateAsync({
        wabaId: form.wabaId.trim(),
        phoneNumberId: form.phoneNumberId.trim(),
        accessToken: form.accessToken.trim(),
      });
      toast.success("WhatsApp account connected");
      setForm(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const saveLimit = async () => {
    if (!limit) return;
    const parsed = limit.value.trim() === "" ? null : Number(limit.value);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1)) {
      toast.error("Enter a whole number of messages, or leave it empty for no limit.");
      return;
    }
    try {
      await update.mutateAsync({ dailyMessageLimit: parsed });
      toast.success("Daily limit saved");
      setLimit(null);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async () => {
    if (
      !window.confirm(
        "Disconnect this WhatsApp number? Running campaigns will pause, and no messages can be sent until you reconnect.",
      )
    )
      return;
    try {
      await disconnect.mutateAsync();
      toast.success("WhatsApp account disconnected");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const connectDemoNumber = async () => {
    try {
      await mockConnect.mutateAsync();
      toast.success("Demo number connected — messages are simulated");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp Accounts"
        subtitle="The WhatsApp Business number your messages are sent from."
        actions={
          isAdmin &&
          account && (
            <Button variant="outline" onClick={() => setForm({ ...emptyForm })}>
              Replace credentials
            </Button>
          )
        }
      />

      {accounts.isError ? (
        <Empty
          title={errorMessage(accounts.error)}
          action={
            <Button variant="outline" onClick={() => void accounts.refetch()}>
              Try again
            </Button>
          }
        />
      ) : accounts.isPending ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
      ) : !account ? (
        <div className="space-y-4 rounded-xl border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Phone className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Connect your WhatsApp Business number</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                You need a number registered on the WhatsApp Business Platform (Cloud API) in Meta
                Business Manager.
              </p>
            </div>
          </div>
          {isAdmin ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setForm({ ...emptyForm })}>
                Connect with Cloud API credentials
              </Button>
              <Button
                variant="ghost"
                disabled={mockConnect.isPending}
                onClick={() => void connectDemoNumber()}
              >
                Use a demo number
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask an administrator to connect a WhatsApp number.
            </p>
          )}
        </div>
      ) : (
        <div className="max-w-2xl rounded-xl border bg-card p-5">
          <div className="flex justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                {account.displayPhoneNumber ?? account.phoneNumberId}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {account.isMock
                  ? "Demo number — messages are simulated"
                  : "WhatsApp Business Platform"}
              </p>
            </div>
            <Status>
              {account.status === "connected"
                ? "Connected"
                : account.status === "pending"
                  ? "Pending"
                  : "Disconnected"}
            </Status>
          </div>

          <dl className="my-5 space-y-3 border-y py-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Phone number ID</dt>
              <dd className="font-mono text-xs">{account.phoneNumberId}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">WhatsApp Business Account ID</dt>
              <dd className="font-mono text-xs">{account.wabaId ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Connected</dt>
              <dd>{account.connectedAt ? new Date(account.connectedAt).toLocaleString() : "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Daily campaign limit</dt>
              <dd className="flex items-center gap-2">
                {limit ? (
                  <>
                    <input
                      aria-label="Daily message limit"
                      className="h-8 w-28 rounded-md border bg-card px-2 text-sm"
                      inputMode="numeric"
                      placeholder="No limit"
                      value={limit.value}
                      onChange={(e) => setLimit({ ...limit, value: e.target.value })}
                    />
                    <Button size="sm" disabled={update.isPending} onClick={() => void saveLimit()}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setLimit(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span>
                      {account.dailyMessageLimit
                        ? `${account.dailyMessageLimit.toLocaleString()} messages`
                        : "No limit set"}
                    </span>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setLimit({
                            id: account.id,
                            value: account.dailyMessageLimit?.toString() ?? "",
                          })
                        }
                      >
                        Edit
                      </Button>
                    )}
                  </>
                )}
              </dd>
            </div>
          </dl>
          <p className="mb-4 text-xs text-muted-foreground">
            Meta limits how many people a new number can message each day (starting at 250, rising
            with good quality). Set the same limit here so a campaign never exceeds it.
          </p>

          {isAdmin && account.status === "connected" && (
            <Button variant="ghost" disabled={disconnect.isPending} onClick={() => void remove()}>
              Disconnect
            </Button>
          )}
        </div>
      )}

      <section className="max-w-2xl space-y-2 border-t pt-6 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground">
          <ShieldCheck className="size-5 text-info" />
          <h2 className="font-semibold">Where to find these values</h2>
        </div>
        <p>
          In Meta for Developers, open your app → WhatsApp → API Setup. Copy the{" "}
          <b>Phone number ID</b> and <b>WhatsApp Business Account ID</b>, and generate a permanent
          access token from a System User with the <code>whatsapp_business_messaging</code> and{" "}
          <code>whatsapp_business_management</code> permissions.
        </p>
        <a
          className="inline-flex items-center gap-1 text-primary underline"
          href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
          target="_blank"
          rel="noreferrer"
        >
          Cloud API setup guide <ExternalLink className="size-3.5" />
        </a>
      </section>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title="Connect WhatsApp (Cloud API)"
        description="Credentials are verified with Meta and stored encrypted. The token is never shown again."
      >
        {form && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field
              label="Phone number ID"
              value={form.phoneNumberId}
              onChange={(v) => setForm({ ...form, phoneNumberId: v })}
              required
            />
            <Field
              label="WhatsApp Business Account ID"
              value={form.wabaId}
              onChange={(v) => setForm({ ...form, wabaId: v })}
              required
            />
            <Field
              label="Permanent access token"
              type="password"
              value={form.accessToken}
              onChange={(v) => setForm({ ...form, accessToken: v })}
              required
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  connect.isPending ||
                  !form.phoneNumberId ||
                  !form.wabaId ||
                  form.accessToken.length < 20
                }
              >
                {connect.isPending ? "Verifying…" : "Connect"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
