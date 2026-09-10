import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { MOCK_BANKS } from "../lib/types";
import type { LinkCallbackResult } from "../lib/types";
import { formatMoney } from "../lib/format";
import { Button, Icon, Spinner } from "../components/ui";

type Step = "bank" | "name" | "working" | "done" | "error";

export function LinkAccountModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>("bank");
  const [slug, setSlug] = useState<string | null>(null);
  const [name, setName] = useState("My account");
  const [result, setResult] = useState<LinkCallbackResult | null>(null);
  const [error, setError] = useState<string>("");

  const bank = MOCK_BANKS.find((b) => b.slug === slug);

  async function connect() {
    if (!bank) return;
    setStep("working");
    try {
      const start = await api.startLink(name);
      const res = await api.completeLink(start.link_token, bank.slug, name);
      setResult(res);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["accounts"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not connect to the bank");
      setStep("error");
    }
  }

  const stepIndex = { bank: 0, name: 1, working: 2, done: 2, error: 2 }[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-margin-mobile bg-inverse-surface/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-surface-container-lowest shadow-2xl overflow-hidden">
        <div className="px-space-xl pt-space-xl pb-space-md">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-space-sm">
              <span className="w-9 h-9 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
                <Icon name="account_balance" className="text-[20px]" />
              </span>
              <div>
                <h2 className="text-headline-sm font-semibold">Link a bank account</h2>
                <p className="text-label-sm text-on-surface-variant font-normal">
                  Connect a sandbox bank via the aggregator
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1">
              <Icon name="close" className="text-[20px]" />
            </button>
          </div>

          <div className="flex items-center gap-space-xs mt-space-lg">
            {["Bank", "Name", "Connect"].map((label, i) => (
              <div key={label} className="flex-1 flex flex-col gap-1.5">
                <div
                  className={`h-1.5 rounded-full ${
                    i <= stepIndex ? "bg-primary" : "bg-surface-container-highest"
                  }`}
                />
                <span
                  className={`text-label-sm ${
                    i <= stepIndex ? "text-primary font-semibold" : "text-on-surface-variant"
                  }`}
                >
                  {i + 1}. {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-space-xl mb-space-md">
          <div className="flex items-start gap-space-sm px-space-md py-space-xs rounded-xl bg-surface-container-low">
            <Icon name="shield_lock" className="text-primary text-[18px] shrink-0 mt-0.5" />
            <p className="text-caption text-on-surface-variant leading-relaxed">
              You authenticate on your bank's own page. KudiVault never sees or stores your banking
              credentials.
            </p>
          </div>
        </div>

        <div className="px-space-xl pb-space-xl min-h-[280px] flex flex-col">
          {step === "bank" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
              {MOCK_BANKS.map((b) => (
                <button
                  key={b.slug}
                  onClick={() => setSlug(b.slug)}
                  className={`p-space-md rounded-xl flex items-center gap-space-sm text-left transition-colors ${
                    slug === b.slug
                      ? "bg-surface-container-low ring-2 ring-primary"
                      : "bg-surface-container-lowest hover:bg-surface-container-low"
                  }`}
                >
                  <span className="w-9 h-9 rounded-lg bg-primary-container text-on-primary flex items-center justify-center font-bold text-body-sm shrink-0">
                    {b.name.replace("Mock Bank ", "")}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-body-sm font-semibold text-on-surface truncate">
                      {b.name}
                    </span>
                    <span className="block text-caption text-on-surface-variant">{b.note}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === "name" && (
            <div className="flex flex-col gap-space-md">
              <div className="p-space-md rounded-xl bg-surface-container-low flex items-center gap-space-sm">
                <span className="w-10 h-10 rounded-lg bg-primary-container text-on-primary flex items-center justify-center font-bold text-body-sm">
                  {bank?.name.replace("Mock Bank ", "")}
                </span>
                <div>
                  <span className="text-caption text-on-surface-variant uppercase tracking-wider">
                    Selected bank
                  </span>
                  <p className="text-body-sm font-semibold text-on-surface">{bank?.name}</p>
                </div>
              </div>
              <label className="flex flex-col gap-space-2xs">
                <span className="text-label-sm font-semibold">Name this connection</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  className="h-12 rounded-xl bg-surface-container-low px-space-md text-body-md focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g. Salary account"
                />
                <span className="text-caption text-on-surface-variant">
                  Just a label to recognise it on your dashboard.
                </span>
              </label>
            </div>
          )}

          {step === "working" && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-space-sm">
              <Spinner className="text-[36px] text-primary" />
              <p className="text-headline-sm font-semibold">Connecting securely…</p>
              <p className="text-body-sm text-on-surface-variant">
                Exchanging tokens with {bank?.name} and pulling your accounts
              </p>
            </div>
          )}

          {step === "error" && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-space-sm">
              <Icon name="cloud_off" className="text-[36px] text-error" />
              <p className="text-headline-sm font-semibold">Couldn't connect</p>
              <p className="text-body-sm text-on-surface-variant">{error}</p>
            </div>
          )}

          {step === "done" && result && (
            <div className="flex flex-col gap-space-sm">
              <div className="flex items-center gap-space-sm p-space-md rounded-xl bg-primary-fixed/20">
                <span className="w-9 h-9 rounded-full bg-primary-container text-on-primary flex items-center justify-center">
                  <Icon name="check" className="text-[18px]" />
                </span>
                <div>
                  <p className="text-body-md font-semibold">Connected</p>
                  <p className="text-caption text-primary">
                    {result.accounts.length} account{result.accounts.length === 1 ? "" : "s"} · initial
                    sync {result.sync.status}
                  </p>
                </div>
              </div>
              {result.accounts.map((a) => (
                <div
                  key={a.id}
                  className="p-space-md rounded-xl bg-surface-container-low flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-body-sm font-semibold truncate">{a.account_name}</p>
                    <p className="text-caption text-on-surface-variant capitalize">{a.account_type}</p>
                  </div>
                  <span className="text-label-md font-semibold">
                    {formatMoney(a.current_balance, a.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto pt-space-lg flex items-center justify-between gap-space-sm">
            <Button
              variant="surface"
              icon="arrow_back"
              onClick={() => setStep("bank")}
              disabled={step === "bank" || step === "working" || step === "done"}
            >
              Back
            </Button>
            {step === "bank" && (
              <Button icon="arrow_forward" disabled={!slug} onClick={() => setStep("name")}>
                Continue
              </Button>
            )}
            {step === "name" && (
              <Button icon="link" disabled={!name.trim()} onClick={connect}>
                Connect
              </Button>
            )}
            {step === "error" && (
              <Button icon="refresh" onClick={connect}>
                Try again
              </Button>
            )}
            {step === "done" && (
              <Button icon="check" onClick={onClose}>
                Done
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
