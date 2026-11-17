import { useState, type FormEvent } from "react";
import { KeyRound, Plus, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@whatsapp-crm/shared-types";
import {
  useCreateUser,
  useResetUserPassword,
  useTeamUsers,
  useUpdateUser,
} from "@/api/account";
import { Empty, Metrics, Modal, SearchBox, Status, Table } from "@/components/genie/ui";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";

type Role = "tenant_admin" | "agent";
const roleLabel = (r: string) => (r === "tenant_admin" ? "Business admin" : "Agent");
const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

const when = (d: Date | string | null) =>
  d ? new Date(d).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "Never";

/** A strong random password the admin can hand to a teammate. */
function suggestPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function TeamPage() {
  const { user: me } = useSession();
  const isAdmin = me.role === "tenant_admin";
  const usersQuery = useTeamUsers();
  const users = usersQuery.data ?? [];
  const update = useUpdateUser();

  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resetFor, setResetFor] = useState<User | null>(null);

  const visible = users.filter((u) =>
    `${u.displayName} ${u.email}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const active = users.filter((u) => u.isActive).length;

  const change = (u: User, body: { role?: Role; isActive?: boolean }, done: string) =>
    update.mutate(
      { id: u.id, body },
      {
        onSuccess: () => toast.success(done),
        onError: (err) => toast.error(errorText(err, "Could not update the user")),
      },
    );

  return (
    <div className="genie-table space-y-5">
      <PageHeader
        title="Users & Teams"
        subtitle="The right people, working together."
        actions={
          isAdmin && (
            <Button onClick={() => setInviteOpen(true)}>
              <Plus />
              Add user
            </Button>
          )
        }
      />
      <Metrics
        items={[
          { label: "Team members", value: users.length },
          { label: "Active", value: active },
          { label: "Business admins", value: users.filter((u) => u.role === "tenant_admin" && u.isActive).length },
          { label: "Agents", value: users.filter((u) => u.role === "agent" && u.isActive).length },
        ]}
      />
      <SearchBox value={query} onChange={setQuery} placeholder="Search team members…" />

      {usersQuery.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load the team.
        </p>
      )}
      {usersQuery.isSuccess && visible.length === 0 ? (
        <Empty title="No team members found" />
      ) : (
        <Table headers={["User", "Role", "Status", "Last sign-in", ...(isAdmin ? ["Actions"] : [])]}>
          {visible.map((u) => {
            const self = u.id === me.id;
            return (
              <tr key={u.id}>
                <td>
                  <p className="font-medium">
                    {u.displayName}
                    {self && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{u.email}</p>
                </td>
                <td>
                  {isAdmin && !self ? (
                    <select
                      aria-label={`Role of ${u.displayName}`}
                      className="h-8 rounded-md border bg-card px-2 text-xs"
                      value={u.role}
                      disabled={update.isPending}
                      onChange={(e) => change(u, { role: e.target.value as Role }, "Role updated")}
                    >
                      <option value="agent">Agent</option>
                      <option value="tenant_admin">Business admin</option>
                    </select>
                  ) : (
                    <Status>{roleLabel(u.role)}</Status>
                  )}
                </td>
                <td>
                  <Status>{u.isActive ? "Active" : "Deactivated"}</Status>
                </td>
                <td className="whitespace-nowrap text-xs text-muted-foreground">{when(u.lastLoginAt)}</td>
                {isAdmin && (
                  <td className="whitespace-nowrap">
                    <Button variant="ghost" size="icon" title="Set a new password" aria-label={`Set a new password for ${u.displayName}`} onClick={() => setResetFor(u)}>
                      <KeyRound />
                    </Button>
                    {!self && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title={u.isActive ? "Deactivate" : "Reactivate"}
                        aria-label={`${u.isActive ? "Deactivate" : "Reactivate"} ${u.displayName}`}
                        disabled={update.isPending}
                        onClick={() => {
                          if (u.isActive && !confirm(`Deactivate ${u.displayName}? They will be signed out and cannot sign in.`)) return;
                          change(u, { isActive: !u.isActive }, u.isActive ? "User deactivated" : "User reactivated");
                        }}
                      >
                        {u.isActive ? <UserX className="text-destructive" /> : <UserCheck />}
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </Table>
      )}
      <p className="text-xs text-muted-foreground">
        Teams, invitations by email and fine-grained permissions are not available yet. Business admins can do everything; agents handle conversations, contacts and campaigns.
      </p>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <ResetPasswordDialog user={resetFor} onClose={() => setResetFor(null)} />
    </div>
  );
}

function PasswordField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Password</Label>
      <div className="flex gap-2">
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" minLength={8} required />
        <Button type="button" variant="outline" onClick={() => onChange(suggestPassword())}>
          Generate
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">At least 8 characters. Share it with them securely; they can change it from their profile.</p>
    </div>
  );
}

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("agent");
  const [password, setPassword] = useState("");

  const close = () => {
    setName("");
    setEmail("");
    setRole("agent");
    setPassword("");
    onClose();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { displayName: name.trim(), email: email.trim(), password, role },
      {
        onSuccess: () => {
          toast.success(`${name.trim()} can now sign in`);
          close();
        },
        onError: (err) => toast.error(errorText(err, "Could not add the user")),
      },
    );
  };

  return (
    <Modal open={open} onClose={close} title="Add user" description="Create an account for a teammate.">
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1.5">
          <Label htmlFor="nu-name">Full name</Label>
          <Input id="nu-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nu-email">Email</Label>
          <Input id="nu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="nu-role">Role</Label>
          <select id="nu-role" className="h-9 w-full rounded-md border bg-card px-3 text-sm" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="agent">Agent: conversations, contacts, campaigns</option>
            <option value="tenant_admin">Business admin: everything, including users and settings</option>
          </select>
        </div>
        <PasswordField id="nu-password" value={password} onChange={setPassword} />
        <Button type="submit" disabled={create.isPending || password.length < 8}>
          {create.isPending ? "Adding…" : "Add user"}
        </Button>
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const reset = useResetUserPassword();
  const [password, setPassword] = useState("");

  const close = () => {
    setPassword("");
    onClose();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    reset.mutate(
      { id: user.id, newPassword: password },
      {
        onSuccess: () => {
          toast.success(`New password set for ${user.displayName}. They were signed out.`);
          close();
        },
        onError: (err) => toast.error(errorText(err, "Could not set the password")),
      },
    );
  };

  return (
    <Modal open={!!user} onClose={close} title="Set a new password" description={user ? `For ${user.displayName} (${user.email})` : "Set a new password"}>
      <form className="space-y-4" onSubmit={submit}>
        <PasswordField id="rp-password" value={password} onChange={setPassword} />
        <Button type="submit" disabled={reset.isPending || password.length < 8}>
          {reset.isPending ? "Saving…" : "Set password"}
        </Button>
      </form>
    </Modal>
  );
}
