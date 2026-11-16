import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { GenieMark } from "@/components/admin-layout/GenieMark";
import { DemoBadge } from "@/components/admin-ui/primitives";
import { sessionStore } from "@/lib/admin/session";
import { ROLE_LABEL, type Role } from "@/lib/permissions/roles";
import { cn } from "@/lib/utils";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <GenieMark className="size-10" />
          <div><p className="font-extrabold tracking-[0.2em] text-sidebar-accent-foreground">GENIE</p><p className="text-[10px] tracking-[0.18em] text-sidebar-muted">SUPER ADMIN CONSOLE</p></div>
        </div>
        <div>
          <p className="max-w-md text-3xl font-bold leading-tight text-sidebar-accent-foreground">The control centre for every business running on Genie.</p>
          <div className="mt-8 grid max-w-md grid-cols-3 gap-4 border-t border-sidebar-border pt-6 text-sm">
            {[["1,284", "Businesses"], ["4.8M", "Messages / mo"], ["99.95%", "Uptime"]].map(([a, b]) => <div key={b}><p className="text-xl font-bold text-sidebar-accent-foreground">{a}</p><p className="text-xs text-sidebar-muted">{b}</p></div>)}
          </div>
        </div>
        <p className="text-xs text-sidebar-muted">© 2026 Genie · Internal use only</p>
      </div>
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

const schema = z.object({ email: z.string().trim().email("Enter a valid work email"), password: z.string().min(6, "Password must be at least 6 characters") });
const DEMO: Record<Role, { name: string; email: string }> = {
  super_admin: { name: "Ajinkya Patil", email: "ajinkya@genie.app" },
  support: { name: "Rohan Mehta", email: "rohan@genie.app" },
  finance: { name: "Karan Shah", email: "karan@genie.app" },
  operations: { name: "Priya Nair", email: "priya@genie.app" },
};

export function LoginScreen() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("super_admin");
  const [email, setEmail] = useState(DEMO.super_admin.email);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = schema.safeParse({ email, password });
    if (!r.success) return setErrors(Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message])));
    const known = Object.values(DEMO).find((d) => d.email === r.data.email);
    sessionStore.signIn({ name: known?.name ?? r.data.email.split("@")[0], email: r.data.email, role }, remember);
    toast.success(`Signed in as ${ROLE_LABEL[role]}`);
    navigate("/dashboard" );
  };

  return (
    <Shell>
      <div className="mb-8 flex items-center gap-2 lg:hidden"><GenieMark className="size-8" /><span className="font-extrabold tracking-[0.2em]">GENIE</span></div>
      <div className="flex items-center gap-2"><h1 className="text-2xl font-bold">Admin sign in</h1><DemoBadge /></div>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to the Genie Super Admin console.</p>
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <div>
          <Label className="mb-1.5 block text-xs">Simulate role</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <button type="button" key={r} onClick={() => { setRole(r); setEmail(DEMO[r].email); }} className={cn("rounded-md border px-2 py-1.5 text-xs font-medium", role === r ? "border-primary bg-accent text-accent-foreground" : "bg-card text-muted-foreground hover:border-primary/40")}>{ROLE_LABEL[r]}</button>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="email" className="mb-1.5 block text-xs">Work email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </div>
        <div>
          <div className="mb-1.5 flex justify-between"><Label htmlFor="password" className="text-xs">Password</Label><Link to="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link></div>
          <div className="relative">
            <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Any 6+ characters in demo" />
            <button type="button" className="absolute right-2.5 top-2.5 text-muted-foreground" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}>{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
          </div>
          {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
        </div>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={remember} onCheckedChange={(c) => setRemember(!!c)} /> Remember me</label>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>
      <p className="mt-6 flex items-start gap-2 rounded-md border bg-card p-3 text-xs text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" /> Frontend demo: roles are simulated in the browser and are not a security boundary. Production access will be enforced server-side.
      </p>
    </Shell>
  );
}

export function ForgotScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Shell>
      <h1 className="text-2xl font-bold">Reset your password</h1>
      {sent ? (
        <p className="mt-3 text-sm text-muted-foreground">If <b>{email}</b> belongs to a Genie admin, a reset link would be sent. In demo mode, continue to the <Link to="/reset-password" className="text-primary underline">reset page</Link>.</p>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("Enter a valid email"); setSent(true); }}>
          <div><Label htmlFor="fe" className="mb-1.5 block text-xs">Work email</Label><Input id="fe" value={email} onChange={(e) => setEmail(e.target.value)} />{err && <p className="mt-1 text-xs text-destructive">{err}</p>}</div>
          <Button type="submit" className="w-full">Send reset link</Button>
        </form>
      )}
      <Link to="/login" className="mt-6 block text-sm text-primary hover:underline">← Back to sign in</Link>
    </Shell>
  );
}

export function ResetScreen() {
  const navigate = useNavigate();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [err, setErr] = useState("");
  return (
    <Shell>
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); if (a.length < 8) return setErr("Use at least 8 characters"); if (a !== b) return setErr("Passwords don't match"); toast.success("Password updated (demo)"); navigate("/login" ); }}>
        <div><Label htmlFor="p1" className="mb-1.5 block text-xs">New password</Label><Input id="p1" type="password" value={a} onChange={(e) => setA(e.target.value)} /></div>
        <div><Label htmlFor="p2" className="mb-1.5 block text-xs">Confirm password</Label><Input id="p2" type="password" value={b} onChange={(e) => setB(e.target.value)} /></div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <Button type="submit" className="w-full">Update password</Button>
      </form>
    </Shell>
  );
}

export function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="rounded-full bg-destructive/10 p-4 text-destructive"><ShieldX className="size-8" /></span>
      <h1 className="mt-4 text-xl font-bold">Access denied</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">Your role doesn't include this area. Ask a Super Admin to update your permissions, or switch role from the profile menu (demo).</p>
      <Button asChild className="mt-6"><Link to="/dashboard">Back to dashboard</Link></Button>
    </div>
  );
}
