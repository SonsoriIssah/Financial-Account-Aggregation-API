import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";
import { Button, Field, Icon } from "../components/ui";

const POINTS = [
  { icon: "account_balance", text: "Link multiple banks through one connection" },
  { icon: "insights", text: "Balances and transactions in one normalized view" },
  { icon: "lock", text: "Read-only access — tokens encrypted at rest" },
];

export function Login() {
  const { login, register, useTestAccount } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);

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

  async function onGuest() {
    setError(null);
    setGuestBusy(true);
    try {
      await useTestAccount();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Couldn't create a test account");
    } finally {
      setGuestBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface grid lg:grid-cols-2">
      {/* brand / value panel */}
      <div className="hidden lg:flex flex-col justify-between p-margin-desktop bg-surface-container-lowest relative overflow-hidden">
        <div className="absolute -left-32 -top-32 w-[28rem] h-[28rem] rounded-full bg-primary-container/10 blur-3xl pointer-events-none" />
        <div className="absolute right-0 bottom-0 w-80 h-80 rounded-full bg-tertiary-fixed/15 blur-2xl pointer-events-none" />

        <div className="relative flex items-center gap-space-sm">
          <span className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center text-on-primary">
            <Icon name="account_balance_wallet" className="text-[22px]" />
          </span>
          <span className="text-headline-sm font-bold tracking-tight">
            Kudi<span className="text-primary-container">Vault</span>
          </span>
        </div>

        <div className="relative space-y-space-lg max-w-md">
          <h2 className="text-headline-lg font-bold tracking-tight">
            Every bank account, one clear picture.
          </h2>
          <ul className="space-y-space-md">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-center gap-space-sm text-body-md text-on-surface-variant">
                <span className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                  <Icon name={p.icon} className="text-[18px]" />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-label-sm text-on-surface-variant">
          Demo build · sandbox / mock provider data
        </p>
      </div>

      {/* auth card */}
      <div className="flex items-center justify-center p-margin-mobile">
        <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest shadow-sm p-space-xl">
          <div className="flex flex-col items-center text-center gap-space-2xs mb-space-lg">
            <span className="w-11 h-11 rounded-xl bg-primary-container flex items-center justify-center text-on-primary mb-space-xs">
              <Icon name="account_balance_wallet" className="text-[24px]" />
            </span>
            <h1 className="text-headline-md font-bold tracking-tight">
              Kudi<span className="text-primary-container">Vault</span>
            </h1>
            <p className="text-body-sm text-on-surface-variant">
              A bank account aggregator, built from scratch.
            </p>
          </div>

          {/* one-click test account */}
          <button
            onClick={onGuest}
            disabled={guestBusy}
            className="w-full h-12 rounded-xl bg-inverse-surface text-inverse-on-surface font-semibold text-label-md flex items-center justify-center gap-space-xs hover:opacity-95 active:scale-[0.99] transition disabled:opacity-60"
          >
            {guestBusy ? (
              <Icon name="progress_activity" className="animate-spin text-[20px]" />
            ) : (
              <Icon name="bolt" className="text-[20px]" />
            )}
            Use a test account
          </button>
          <p className="text-caption text-on-surface-variant text-center mt-space-xs">
            One click, no details needed. Creates a fresh account and signs you in — then link a
            demo bank.
          </p>

          <div className="flex items-center gap-space-sm my-space-lg text-on-surface-variant">
            <span className="h-px flex-1 bg-surface-container" />
            <span className="text-label-sm uppercase tracking-wider">Or use email</span>
            <span className="h-px flex-1 bg-surface-container" />
          </div>

          {/* login / register tabs */}
          <div className="flex border-b border-surface-container">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`flex-1 pb-space-xs text-label-md font-semibold -mb-px border-b-2 transition-colors ${
                  mode === m
                    ? "border-primary text-on-surface"
                    : "border-transparent text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {m === "login" ? "Log in" : "Create account"}
              </button>
            ))}
          </div>

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
            <Button type="submit" loading={busy} icon="arrow_forward" className="w-full flex-row-reverse">
              {isRegister ? "Create account" : "Log in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
