import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";
import { Button, Field, Icon } from "../components/ui";

export function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (isRegister && password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      if (isRegister) await register(email, password);
      else await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-margin-mobile">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-space-sm justify-center mb-space-xl">
          <span className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center text-on-primary">
            <Icon name="account_balance_wallet" className="text-[22px]" />
          </span>
          <span className="text-headline-md font-bold tracking-tight">
            Kudi<span className="text-primary-container">Vault</span>
          </span>
        </div>

        <div className="rounded-2xl bg-surface-container-lowest shadow-sm p-space-xl">
          <h1 className="text-headline-sm font-semibold">
            {isRegister ? "Create your account" : "Sign in"}
          </h1>
          <p className="text-body-sm text-on-surface-variant mt-space-2xs">
            {isRegister
              ? "One account to see every linked bank in one place."
              : "Welcome back. Sign in to your dashboard."}
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-space-md mt-space-lg">
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <Field
              label="Password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
            {isRegister && (
              <Field
                label="Confirm password"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
              />
            )}
            {error && (
              <div className="text-body-sm text-error bg-error-container/40 rounded-xl px-space-md py-space-xs">
                {error}
              </div>
            )}
            <Button type="submit" loading={busy} className="w-full">
              {isRegister ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="text-body-sm text-on-surface-variant text-center mt-space-lg">
            {isRegister ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              className="text-primary font-semibold"
              onClick={() => {
                setMode(isRegister ? "login" : "register");
                setError(null);
              }}
            >
              {isRegister ? "Sign in" : "Create account"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
