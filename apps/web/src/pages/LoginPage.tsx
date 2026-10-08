import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useLogin } from "../api/auth";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Card } from "../components/Card";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const loginMutation = useLogin();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    loginMutation.mutate(
      { email, password },
      {
        onSuccess: (data) => {
          if (data.user.role === "super_admin") {
            navigate("/admin");
          } else {
            navigate("/app");
          }
        },
      },
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-xl font-bold text-white">
            E
          </div>
          <h1 className="text-xl font-semibold text-gray-900">EduConnect</h1>
          <p className="text-sm text-gray-500">Sign in to manage your WhatsApp enquiries</p>
        </div>
        <Card className="w-full">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="password">
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {loginMutation.isError && (
            <p className="text-sm text-red-600">
              We couldn't sign you in. Please check your email and password and try again.
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
        </Card>
      </div>
    </div>
  );
}
