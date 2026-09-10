import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { Account } from "../lib/types";
import { formatAmount, formatMoney, relativeTime } from "../lib/format";
import { Layout } from "../components/Layout";
import { LinkAccountModal } from "../features/LinkAccountModal";
import { useToast } from "../components/Toast";
import { useAuth } from "../auth/AuthContext";
import { Button, Card, Icon, StatusPill } from "../components/ui";

// --- helpers ----------------------------------------------------------------

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function displayName(email: string) {
  const local = email.split("@")[0].replace(/[._-]+/g, " ");
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function monthRange(offset: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end), label: start.toLocaleString("en", { month: "long" }) };
}

const BALANCE_LABEL: Record<Account["status"], string> = {
  active: "Available balance",
  needs_reauth: "Cached balance",
  error: "Unverified balance",
  disabled: "Last known balance",
};

// --- account card ---------------------------------------------------------

function AccountCard({
  account,
  syncing,
  onSync,
  onReconnect,
}: {
  account: Account;
  syncing: boolean;
  onSync: () => void;
  onReconnect: () => void;
}) {
  const badge = account.institution_name.replace(/^Mock Bank /, "").slice(0, 3).toUpperCase();
  const symbolColor =
    account.status === "active"
      ? "text-primary"
      : account.status === "error"
        ? "text-error"
        : "text-on-surface-variant";

  return (
    <Card className="p-space-lg flex flex-col justify-between">
      <div className="space-y-space-md">
        <div className="flex items-start justify-between gap-space-sm">
          <div className="flex items-center gap-space-md min-w-0">
            <span className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary-container font-bold text-headline-sm shrink-0">
              {badge}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-space-xs">
                <h3 className="text-headline-sm font-bold truncate">{account.institution_name}</h3>
                <span className="text-caption px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant capitalize">
                  {account.account_type}
                </span>
              </div>
              <p className="text-body-sm text-on-surface-variant truncate">{account.account_name}</p>
            </div>
          </div>
          <StatusPill status={account.status} />
        </div>

        <div className="pt-space-2xs">
          <div className="text-label-sm text-on-surface-variant uppercase tracking-wider">
            {BALANCE_LABEL[account.status]}
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className={`text-headline-md font-bold ${symbolColor}`}>₵</span>
            <span className="text-headline-lg font-bold tabular-nums">
              {formatAmount(account.current_balance)}
            </span>
          </div>
        </div>

        {account.status === "needs_reauth" && (
          <div className="flex items-center gap-space-xs p-space-xs bg-secondary-container/20 rounded-xl text-on-secondary-container text-body-sm">
            <Icon name="info" className="text-[18px] text-secondary shrink-0" />
            <span className="text-[13px]">Bank session expired. Reconnect to resume syncing.</span>
          </div>
        )}
        {account.status === "error" && (
          <div className="flex items-center gap-space-xs p-space-xs bg-error-container/25 rounded-xl text-on-error-container text-body-sm">
            <Icon name="cloud_off" className="text-[18px] text-error shrink-0" />
            <span className="text-[13px]">Last sync failed. Retry when the bank is reachable.</span>
          </div>
        )}
      </div>

      <div className="mt-space-lg pt-space-md bg-surface-container-low/40 -mx-space-lg -mb-space-lg px-space-lg pb-space-lg rounded-b-2xl flex items-center justify-between">
        <span className="flex items-center gap-1 text-on-surface-variant text-caption">
          <Icon name="schedule" className="text-[14px]" />
          Synced {relativeTime(account.last_synced_at)}
        </span>
        {account.status === "needs_reauth" ? (
          <Button icon="lock_reset" className="h-9 px-space-md text-label-sm" onClick={onReconnect}>
            Reconnect
          </Button>
        ) : account.status === "error" ? (
          <Button
            variant="surface"
            icon="sync_problem"
            loading={syncing}
            onClick={onSync}
            className="h-9 px-space-md text-label-sm text-error"
          >
            Retry sync
          </Button>
        ) : (
          <div className="flex items-center gap-space-xs">
            <Link
              to={`/accounts/${account.id}`}
              className="px-space-md py-space-xs rounded-lg text-label-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              View details
            </Link>
            <Button
              variant="surface"
              icon="refresh"
              loading={syncing}
              onClick={onSync}
              className="h-9 px-space-md text-label-sm"
            >
              Sync
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// --- metric tile --------------------------------------------------------

function Tile({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: string;
  label: string;
  value: string;
  tone?: "default" | "positive" | "muted";
}) {
  const valueColor =
    tone === "positive" ? "text-primary" : tone === "muted" ? "text-on-surface-variant" : "text-on-surface";
  return (
    <div className="flex items-center gap-space-md">
      <div className="w-10 h-10 rounded-xl bg-surface-container-lowest flex items-center justify-center text-secondary shadow-sm">
        <Icon name={icon} className="text-[20px]" />
      </div>
      <div className="min-w-0">
        <div className="text-label-sm text-on-surface-variant">{label}</div>
        <div className={`text-headline-sm font-semibold tabular-nums ${valueColor}`}>{value}</div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <Card className="p-space-lg animate-pulse space-y-space-md">
      <div className="flex gap-space-md">
        <div className="w-12 h-12 rounded-xl bg-surface-container" />
        <div className="flex-1 space-y-space-xs">
          <div className="h-4 w-32 bg-surface-container rounded-full" />
          <div className="h-3 w-40 bg-surface-container rounded-full" />
        </div>
      </div>
      <div className="h-8 w-40 bg-surface-container rounded-lg" />
      <div className="h-9 bg-surface-container rounded-lg" />
    </Card>
  );
}

// --- page --------------------------------------------------------------

export function Dashboard() {
  const toast = useToast();
  const { user } = useAuth();
  const [linkOpen, setLinkOpen] = useState(false);

  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const accounts = accountsQuery.data ?? [];

  const analyticsQuery = useQuery({
    queryKey: ["dashboard-analytics", accounts.map((a) => a.id).sort().join(",")],
    enabled: accounts.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const window = async (r: { start: string; end: string }) => {
        let inflow = 0;
        let outflow = 0;
        let count = 0;
        for (const a of accounts) {
          const p = new URLSearchParams({
            limit: "200",
            offset: "0",
            start_date: r.start,
            end_date: r.end,
          });
          const page = await api.getTransactions(a.id, p);
          for (const t of page.items) {
            count += 1;
            const n = Number(t.amount);
            if (n >= 0) inflow += n;
            else outflow += -n;
          }
        }
        return { inflow, outflow, count };
      };
      const cur = monthRange(0);
      const prev = monthRange(-1);
      const [thisMonth, lastMonth] = await Promise.all([window(cur), window(prev)]);
      let pace: number | null = null;
      if (lastMonth.count > 0) {
        const lastNet = lastMonth.inflow - lastMonth.outflow;
        const thisNet = thisMonth.inflow - thisMonth.outflow;
        pace = lastNet !== 0 ? ((thisNet - lastNet) / Math.abs(lastNet)) * 100 : null;
      }
      return { monthLabel: cur.label, thisMonth, pace };
    },
  });

  const syncOne = useMutation({
    mutationFn: (id: string) => api.syncAccount(id),
    onSuccess: (res) =>
      toast(
        res.queued
          ? { kind: "info", title: "Sync queued", detail: "A worker will run it shortly" }
          : { kind: "error", title: "Queued locally", detail: "Broker unreachable — will retry on schedule" },
      ),
    onError: (err) =>
      toast({ kind: "error", title: "Sync failed", detail: err instanceof ApiError ? err.detail : "Try again" }),
  });

  const syncAll = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.allSettled(ids.map((id) => api.syncAccount(id)));
    },
    onSuccess: () => toast({ kind: "info", title: "Sync queued for all connections" }),
  });

  const totalsByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of accounts) m.set(a.currency, (m.get(a.currency) ?? 0) + Number(a.current_balance));
    return [...m.entries()];
  }, [accounts]);

  const linkedIds = new Set(accounts.map((a) => a.linked_account_id));
  const activeLinkedIds = new Set(
    accounts.filter((a) => a.status === "active").map((a) => a.linked_account_id),
  );
  const lastSynced = accounts
    .map((a) => a.last_synced_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const syncableIds = accounts.filter((a) => a.status === "active").map((a) => a.id);
  const primaryCurrency = totalsByCurrency[0]?.[0] ?? "GHS";
  const a = analyticsQuery.data;

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Layout onLink={() => setLinkOpen(true)}>
      <div className="space-y-space-2xl">
        {/* greeting */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-space-md">
          <div className="space-y-space-2xs">
            <div className="flex items-center gap-space-xs text-on-surface-variant text-label-sm uppercase tracking-wider">
              <span className="inline-block w-2 h-2 rounded-full bg-primary-container" />
              <span>Overview</span>
              <span className="text-outline-variant">•</span>
              <span>{today}</span>
            </div>
            <h1 className="text-headline-lg font-bold tracking-tight">
              {greeting()}
              {user ? `, ${displayName(user.email)}` : ""}
            </h1>
          </div>
          <div className="flex items-center gap-space-xs self-start sm:self-auto bg-surface-container-low px-space-md py-space-xs rounded-xl text-on-surface-variant text-label-sm shadow-sm">
            <Icon name="verified_user" className="text-primary text-[18px]" />
            <span>Read-only access · mock provider</span>
          </div>
        </div>

        {/* hero wealth module */}
        <Card className="p-space-xl lg:p-space-2xl relative overflow-hidden shadow-xl">
          <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-primary-container/10 blur-3xl pointer-events-none" />
          <div className="absolute right-12 bottom-0 w-64 h-64 rounded-full bg-tertiary-fixed/15 blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-space-xl">
            <div className="space-y-space-md">
              <div className="flex items-center gap-space-sm">
                <span className="text-label-md text-on-surface-variant">Total balance</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-fixed/40 text-on-primary-fixed text-label-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                  </span>
                  Live
                </span>
              </div>

              {accountsQuery.isLoading ? (
                <div className="h-12 w-72 bg-surface-container rounded-lg animate-pulse" />
              ) : totalsByCurrency.length === 0 ? (
                <div className="text-display font-bold text-on-surface-variant tracking-tight">₵0.00</div>
              ) : (
                <div className="flex flex-wrap items-baseline gap-space-xs">
                  <span className="text-currency-display font-bold text-primary tracking-tight">₵</span>
                  <span className="text-display font-bold tabular-nums tracking-tight">
                    {formatAmount(totalsByCurrency[0][1])}
                  </span>
                  {totalsByCurrency.slice(1).map(([cur, sum]) => (
                    <span key={cur} className="text-headline-sm font-semibold text-on-surface-variant">
                      + {formatMoney(sum, cur)}
                    </span>
                  ))}
                </div>
              )}

              <p className="text-body-sm text-on-surface-variant flex flex-wrap items-center gap-space-xs">
                <Icon name="account_balance" className="text-[16px] text-secondary" />
                <span>
                  {linkedIds.size} connected institution{linkedIds.size === 1 ? "" : "s"} ·{" "}
                  {accounts.length} account{accounts.length === 1 ? "" : "s"}
                </span>
                <span className="text-outline-variant">•</span>
                <span>Last synced {relativeTime(lastSynced)}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-space-sm">
              <Button
                variant="surface"
                icon="sync"
                loading={syncAll.isPending}
                disabled={syncableIds.length === 0}
                onClick={() => syncAll.mutate(syncableIds)}
                className="h-12"
              >
                Sync all accounts
              </Button>
              <Button icon="add" onClick={() => setLinkOpen(true)} className="h-12">
                Link new account
              </Button>
            </div>
          </div>

          {/* analytics strip */}
          <div className="relative z-10 mt-space-xl pt-space-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md bg-surface-container-low/60 p-space-md rounded-xl">
            {accounts.length === 0 ? (
              <div className="sm:col-span-2 lg:col-span-4 text-body-sm text-on-surface-variant">
                Link an account to see monthly inflow, outflow and connection health.
              </div>
            ) : analyticsQuery.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 bg-surface-container rounded-lg animate-pulse" />
              ))
            ) : (
              <>
                <Tile
                  icon="arrow_downward"
                  label={`${a?.monthLabel ?? "This month"} inflow`}
                  value={a ? `+${formatMoney(a.thisMonth.inflow, primaryCurrency)}` : "Unavailable"}
                  tone="positive"
                />
                <Tile
                  icon="arrow_upward"
                  label={`${a?.monthLabel ?? "This month"} outflow`}
                  value={a ? `-${formatMoney(a.thisMonth.outflow, primaryCurrency)}` : "Unavailable"}
                />
                <Tile
                  icon="savings"
                  label="Net savings pace"
                  value={
                    a?.pace == null
                      ? "Unavailable"
                      : `${a.pace >= 0 ? "+" : ""}${a.pace.toFixed(1)}% MoM`
                  }
                  tone={a?.pace == null ? "muted" : a.pace >= 0 ? "positive" : "default"}
                />
                <Tile
                  icon="hub"
                  label="Active connections"
                  value={`${activeLinkedIds.size} / ${linkedIds.size}`}
                />
              </>
            )}
          </div>
        </Card>

        {/* grid header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pt-space-xs">
          <div>
            <h2 className="text-headline-md font-bold">Connected institutions</h2>
            <p className="text-body-sm text-on-surface-variant">
              Balances and transactions synced from the aggregator
            </p>
          </div>
          <div className="flex items-center gap-space-xs text-on-surface-variant text-label-sm">
            <span className="w-2 h-2 rounded-full bg-surface-tint" />
            <span>Auto-synced by a background worker</span>
          </div>
        </div>

        {accountsQuery.isError && (
          <Card className="p-space-lg text-error text-body-sm">
            Couldn't load your accounts. Is the API running?
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
          {accountsQuery.isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : accounts.length === 0 ? (
            <Card className="p-space-2xl md:col-span-2 flex flex-col items-center text-center gap-space-sm">
              <span className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline">
                <Icon name="account_balance" className="text-[32px]" />
              </span>
              <h3 className="text-headline-sm font-semibold">No accounts linked yet</h3>
              <p className="text-body-md text-on-surface-variant max-w-sm">
                Link a sandbox bank to pull in balances and transactions.
              </p>
              <Button icon="add" onClick={() => setLinkOpen(true)}>
                Link your first account
              </Button>
            </Card>
          ) : (
            accounts.map((acc) => (
              <AccountCard
                key={acc.id}
                account={acc}
                syncing={syncOne.isPending && syncOne.variables === acc.id}
                onSync={() => syncOne.mutate(acc.id)}
                onReconnect={() => setLinkOpen(true)}
              />
            ))
          )}
        </div>

        {/* security strip */}
        <Card className="p-space-lg flex flex-col sm:flex-row items-center justify-between gap-space-md bg-surface-container-low">
          <div className="flex items-center gap-space-md">
            <span className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Icon name="shield" className="text-[22px]" />
            </span>
            <div>
              <div className="text-label-md font-semibold">Read-only by design</div>
              <div className="text-body-sm text-on-surface-variant">
                KudiVault can read balances and transactions but never moves money or sees your bank
                credentials. Provider tokens are held server-side.
              </div>
            </div>
          </div>
        </Card>
      </div>

      {linkOpen && <LinkAccountModal onClose={() => setLinkOpen(false)} />}
    </Layout>
  );
}
