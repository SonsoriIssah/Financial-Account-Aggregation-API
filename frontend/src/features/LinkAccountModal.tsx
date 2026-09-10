import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import { api, ApiError } from "../lib/api";
import type { DemoBank, LinkCallbackResult } from "../lib/types";
import { formatMoney } from "../lib/format";
import { Button, Icon, Spinner } from "../components/ui";

// --- shared shell -----------------------------------------------------

function Shell({
  steps,
  active,
  onClose,
  onBack,
  children,
}: {
  steps: string[];
  active: number;
  onClose: () => void;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-margin-mobile bg-inverse-surface/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-surface-container-lowest shadow-2xl overflow-hidden">
        <div className="px-space-xl pt-space-xl pb-space-md">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-space-sm">
              {onBack ? (
                <button onClick={onBack} className="text-on-surface-variant hover:text-on-surface p-1 -ml-1">
                  <Icon name="arrow_back" className="text-[20px]" />
                </button>
              ) : (
                <span className="w-9 h-9 rounded-xl bg-surface-container-high flex items-center justify-center text-primary">
                  <Icon name="account_balance" className="text-[20px]" />
                </span>
              )}
              <div>
                <h2 className="text-headline-sm font-semibold">Link a bank account</h2>
                <p className="text-label-sm text-on-surface-variant font-normal">
                  Connect a bank via the aggregator
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface p-1">
              <Icon name="close" className="text-[20px]" />
            </button>
          </div>
          {steps.length > 1 && (
            <div className="flex items-center gap-space-xs mt-space-lg">
              {steps.map((label, i) => (
                <div key={label} className="flex-1 flex flex-col gap-1.5">
                  <div className={`h-1.5 rounded-full ${i <= active ? "bg-primary" : "bg-surface-container-highest"}`} />
                  <span
                    className={`text-label-sm ${
                      i <= active ? "text-primary font-semibold" : "text-on-surface-variant"
                    }`}
                  >
                    {i + 1}. {label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-space-xl mb-space-md">
          <div className="flex items-start gap-space-sm px-space-md py-space-xs rounded-xl bg-surface-container-low">
            <Icon name="shield_lock" className="text-primary text-[18px] shrink-0 mt-0.5" />
            <p className="text-caption text-on-surface-variant leading-relaxed">
              You authenticate on the bank's own page. KudiVault never sees or stores your banking
              credentials.
            </p>
          </div>
        </div>
        <div className="px-space-xl pb-space-xl min-h-[280px] flex flex-col">{children}</div>
      </div>
    </div>
  );
}

function ResultView({ result }: { result: LinkCallbackResult }) {
  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex items-center gap-space-sm p-space-md rounded-xl bg-primary-fixed/20">
        <span className="w-9 h-9 rounded-full bg-primary-container text-on-primary flex items-center justify-center">
          <Icon name="check" className="text-[18px]" />
        </span>
        <div>
          <p className="text-body-md font-semibold">Connected</p>
          <p className="text-caption text-primary">
            {result.accounts.length} account{result.accounts.length === 1 ? "" : "s"} · initial sync{" "}
            {result.sync.status}
          </p>
        </div>
      </div>
      {result.accounts.map((a) => (
        <div key={a.id} className="p-space-md rounded-xl bg-surface-container-low flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-body-sm font-semibold truncate">{a.account_name}</p>
            <p className="text-caption text-on-surface-variant capitalize">{a.account_type}</p>
          </div>
          <span className="text-label-md font-semibold">{formatMoney(a.current_balance, a.currency)}</span>
        </div>
      ))}
    </div>
  );
}

// --- demo-bank flow --------------------------------------------------

function DemoBankFlow({ bank, onBack, onClose }: { bank: DemoBank; onBack: () => void; onClose: () => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<"name" | "working" | "done" | "error">("name");
  const [name, setName] = useState(bank.name);
  const [result, setResult] = useState<LinkCallbackResult | null>(null);
  const [error, setError] = useState("");

  async function connect() {
    setStep("working");
    try {
      const start = await api.startLink("mock");
      const res = await api.completeLink({
        provider: "mock",
        link_token: start.link_token,
        bank_slug: bank.slug,
        institution_name: name,
      });
      setResult(res);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["accounts"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Could not connect to the bank");
      setStep("error");
    }
  }

  return (
    <Shell
      steps={["Choose", "Name", "Connect"]}
      active={step === "name" ? 1 : 2}
      onClose={onClose}
      onBack={step === "name" ? onBack : undefined}
    >
      {step === "name" && (
        <div className="flex flex-col gap-space-md">
          <div className="p-space-md rounded-xl bg-surface-container-low flex items-center gap-space-sm">
            <span className="w-10 h-10 rounded-lg bg-primary-container text-on-primary flex items-center justify-center font-bold text-body-sm">
              {bank.name.slice(0, 3).toUpperCase()}
            </span>
            <div>
              <span className="text-caption text-on-surface-variant uppercase tracking-wider">Demo bank</span>
              <p className="text-body-sm font-semibold text-on-surface">{bank.name}</p>
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
          </label>
        </div>
      )}
      {step === "working" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-space-sm">
          <Spinner className="text-[36px] text-primary" />
          <p className="text-headline-sm font-semibold">Connecting…</p>
          <p className="text-body-sm text-on-surface-variant">Pulling accounts from {bank.name}</p>
        </div>
      )}
      {step === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-space-sm">
          <Icon name="cloud_off" className="text-[36px] text-error" />
          <p className="text-headline-sm font-semibold">Couldn't connect</p>
          <p className="text-body-sm text-on-surface-variant">{error}</p>
        </div>
      )}
      {step === "done" && result && <ResultView result={result} />}

      <div className="mt-auto pt-space-lg flex items-center justify-end gap-space-sm">
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
    </Shell>
  );
}

// --- plaid flow ---------------------------------------------------

function PlaidFlow({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const qc = useQueryClient();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "working" | "done" | "error">("idle");
  const [result, setResult] = useState<LinkCallbackResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .startLink("plaid")
      .then((s) => setLinkToken(s.link_token))
      .catch((err) => {
        setError(err instanceof ApiError ? err.detail : "Could not start Plaid Link");
        setPhase("error");
      });
  }, []);

  const onSuccess = useCallback(
    async (public_token: string, metadata: { institution?: { name?: string } | null }) => {
      setPhase("working");
      try {
        const res = await api.completeLink({
          provider: "plaid",
          public_token,
          institution_name: metadata.institution?.name,
        });
        setResult(res);
        setPhase("done");
        qc.invalidateQueries({ queryKey: ["accounts"] });
      } catch (err) {
        setError(err instanceof ApiError ? err.detail : "Could not finish linking");
        setPhase("error");
      }
    },
    [qc],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (err) => {
      if (err) setError(err.display_message || err.error_message || "Link cancelled");
    },
  });

  return (
    <Shell
      steps={["Choose", "Open Plaid", "Connect"]}
      active={phase === "idle" ? 1 : 2}
      onClose={onClose}
      onBack={phase === "idle" ? onBack : undefined}
    >
      {phase === "idle" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-space-sm">
          <span className="w-14 h-14 rounded-2xl bg-surface-container-high flex items-center justify-center text-primary">
            <Icon name="lock_open" className="text-[26px]" />
          </span>
          <p className="text-headline-sm font-semibold">Connect with Plaid</p>
          <p className="text-body-sm text-on-surface-variant max-w-sm">
            Plaid opens your bank's secure login. Sandbox credentials:{" "}
            <span className="font-mono">user_good</span> / <span className="font-mono">pass_good</span>.
          </p>
        </div>
      )}
      {phase === "working" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-space-sm">
          <Spinner className="text-[36px] text-primary" />
          <p className="text-headline-sm font-semibold">Finishing up…</p>
        </div>
      )}
      {phase === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-space-sm">
          <Icon name="cloud_off" className="text-[36px] text-error" />
          <p className="text-headline-sm font-semibold">Couldn't connect</p>
          <p className="text-body-sm text-on-surface-variant">{error}</p>
        </div>
      )}
      {phase === "done" && result && <ResultView result={result} />}

      <div className="mt-auto pt-space-lg flex items-center justify-end gap-space-sm">
        {phase === "idle" && (
          <Button icon="open_in_new" disabled={!ready} onClick={() => open()}>
            {linkToken ? "Open Plaid" : "Preparing…"}
          </Button>
        )}
        {phase === "done" && (
          <Button icon="check" onClick={onClose}>
            Done
          </Button>
        )}
      </div>
    </Shell>
  );
}

// --- entry: chooser -----------------------------------------------

type Choice = { kind: "plaid" } | { kind: "demo"; bank: DemoBank };

export function LinkAccountModal({ onClose }: { onClose: () => void }) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const configQuery = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const banksQuery = useQuery({ queryKey: ["demo-banks"], queryFn: api.demoBanks, staleTime: 60_000 });

  if (choice?.kind === "plaid") {
    return <PlaidFlow onBack={() => setChoice(null)} onClose={onClose} />;
  }
  if (choice?.kind === "demo") {
    return <DemoBankFlow bank={choice.bank} onBack={() => setChoice(null)} onClose={onClose} />;
  }

  const banks = banksQuery.data ?? [];
  const plaid = configQuery.data?.plaid_enabled;

  return (
    <Shell steps={["Choose"]} active={0} onClose={onClose}>
      {configQuery.isLoading || banksQuery.isLoading ? (
        <div className="flex-1 flex items-center justify-center text-primary">
          <Spinner className="text-[28px]" />
        </div>
      ) : (
        <div className="space-y-space-md">
          {plaid && (
            <button
              onClick={() => setChoice({ kind: "plaid" })}
              className="w-full p-space-md rounded-xl bg-surface-container-lowest hover:bg-surface-container-low ring-1 ring-surface-container flex items-center gap-space-sm text-left transition-colors"
            >
              <span className="w-10 h-10 rounded-lg bg-primary-container text-on-primary flex items-center justify-center shrink-0">
                <Icon name="account_balance" className="text-[20px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-sm font-semibold">Connect a real bank</span>
                <span className="block text-caption text-on-surface-variant">
                  Via Plaid — opens your bank's secure login
                </span>
              </span>
              <Icon name="chevron_right" className="text-[18px] text-outline" />
            </button>
          )}

          <div>
            <p className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-space-xs">
              {plaid ? "Or use a demo bank" : "Choose a demo bank"}
            </p>
            {banks.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant">
                The demo bank service isn't reachable.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-sm">
                {banks.map((b) => (
                  <button
                    key={b.slug}
                    onClick={() => setChoice({ kind: "demo", bank: b })}
                    className="p-space-md rounded-xl bg-surface-container-lowest hover:bg-surface-container-low flex items-center gap-space-sm text-left transition-colors"
                  >
                    <span className="w-9 h-9 rounded-lg bg-surface-container-high text-on-surface flex items-center justify-center font-bold text-label-sm shrink-0">
                      {b.name.slice(0, 3).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-body-sm font-semibold truncate">{b.name}</span>
                      <span className="block text-caption text-on-surface-variant truncate">{b.note}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
