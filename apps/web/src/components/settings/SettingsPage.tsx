import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  timeZoneOptions,
  useChangeMyPassword,
  useUpdateMyBusiness,
  useUpdateMyProfile,
} from "@/api/account";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useAuth, useSession } from "@/lib/auth";

const errorText = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="max-w-2xl space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Business settings: name, category and time zone. Only business admins can change them. */
export function BusinessSettingsPage() {
  const { user, tenant } = useSession();
  const { refreshProfile } = useAuth();
  const update = useUpdateMyBusiness();
  const canEdit = user.role === "tenant_admin";

  const [name, setName] = useState(tenant.name);
  const [category, setCategory] = useState(tenant.businessCategory ?? "");
  const [timezone, setTimezone] = useState(tenant.timezone);

  const dirty =
    name.trim() !== tenant.name ||
    category.trim() !== (tenant.businessCategory ?? "") ||
    timezone !== tenant.timezone;

  const save = (e: FormEvent) => {
    e.preventDefault();
    update.mutate(
      { name: name.trim(), business_category: category.trim() || null, timezone },
      {
        onSuccess: async () => {
          await refreshProfile();
          toast.success("Settings saved");
        },
        onError: (err) => toast.error(errorText(err, "Could not save the settings")),
      },
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" subtitle={`${tenant.name} · Business preferences`} />
      <Section
        title="Business"
        description="The time zone is used for scheduled campaigns and for the times you see."
      >
        <form className="space-y-4" onSubmit={save}>
          <div className="space-y-1.5">
            <Label htmlFor="biz-name">Business name</Label>
            <Input id="biz-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} required maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="biz-category">Category</Label>
            <Input
              id="biz-category"
              placeholder="e.g. Retail, Education, Healthcare"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={!canEdit}
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="biz-tz">Time zone</Label>
            <select
              id="biz-tz"
              className="h-9 w-full rounded-md border bg-card px-3 text-sm disabled:opacity-60"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!canEdit}
            >
              {timeZoneOptions(tenant.timezone).map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          {canEdit ? (
            <Button type="submit" disabled={!dirty || !name.trim() || update.isPending}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Only a business admin can change these settings.</p>
          )}
        </form>
      </Section>
      <p className="max-w-2xl text-xs text-muted-foreground">
        Notification, billing and AI preferences will appear here when those features are available.
      </p>
    </div>
  );
}

/** The signed-in user's own profile and password. */
export function ProfilePage() {
  const { user, tenant } = useSession();
  const { refreshProfile, logout } = useAuth();
  const updateProfile = useUpdateMyProfile();
  const changePassword = useChangeMyPassword();

  const [name, setName] = useState(user.displayName);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const saveName = (e: FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(name.trim(), {
      onSuccess: async () => {
        await refreshProfile();
        toast.success("Profile saved");
      },
      onError: (err) => toast.error(errorText(err, "Could not save your profile")),
    });
  };

  const mismatch = confirm.length > 0 && next !== confirm;
  const passwordReady = current.length > 0 && next.length >= 8 && next === confirm;

  const savePassword = (e: FormEvent) => {
    e.preventDefault();
    if (!passwordReady) return;
    changePassword.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: async () => {
          toast.success("Password changed. Please sign in again.");
          await logout(); // every session was ended by the server
        },
        onError: (err) => toast.error(errorText(err, "Could not change the password")),
      },
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader title="User Profile" subtitle={`${tenant.name} · ${user.role === "tenant_admin" ? "Business admin" : "Agent"}`} />
      <Section title="Profile">
        <form className="space-y-4" onSubmit={saveName}>
          <div className="space-y-1.5">
            <Label htmlFor="pf-name">Your name</Label>
            <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pf-email">Email</Label>
            <Input id="pf-email" value={user.email} disabled />
            <p className="text-xs text-muted-foreground">Your email is your sign-in name and can't be changed here.</p>
          </div>
          <Button type="submit" disabled={!name.trim() || name.trim() === user.displayName || updateProfile.isPending}>
            {updateProfile.isPending ? "Saving…" : "Save profile"}
          </Button>
        </form>
      </Section>

      <Section title="Change password" description="You will be signed out everywhere and asked to sign in with the new password.">
        <form className="space-y-4" onSubmit={savePassword}>
          <div className="space-y-1.5">
            <Label htmlFor="pw-current">Current password</Label>
            <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-new">New password</Label>
            <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-confirm">Confirm new password</Label>
            <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {mismatch && (
              <p role="alert" className="text-xs text-destructive">
                The passwords don't match.
              </p>
            )}
          </div>
          <Button type="submit" disabled={!passwordReady || changePassword.isPending}>
            {changePassword.isPending ? "Changing…" : "Change password"}
          </Button>
        </form>
      </Section>
    </div>
  );
}
