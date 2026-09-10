import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { Account } from "../lib/types";
import { formatAmount, formatMoney, relativeTime } from "../lib/format";
import { Layout } from "../components/Layout";
import { LinkAccountModal } from "../features/LinkAccountModal";
import { useToast } from "../components/Toast";
import { Button, Card, Icon, StatusPill } from "../components/ui";

function AccountCard({
  account,
  onSync,
  syncing,
  onReconnect,
}: {
  account: Account;
  onSync: () => void;
  syncing: boolean;
  onReconnect: () => void;
}) {
  return (
    <Card className="p-space-lg flex flex-col justify-between gap-space-md">
      <div className="space-y-space-md">
        <div className="flex items-start justify-between gap-space-sm">
          <div className="flex items-center gap-space-md min-w-0">
            <span className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary-container font-bold text-headline-sm shrink-0">
              {account.institution_name.replace(/^Mock Bank /, "").slice(0, 3).toUpperCase()}
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

        <div>
          <div className="text-label-sm text-on-surface-variant uppercase tracking-wider">
            Current balance
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-headline-md font-bold text-primary">₵</span>
            <span className="text-headline-lg font-bold tabular-nums">
              {formatAmount(account.current_balance)}
            </span>
          </div>
        </div>

        {account.status === "needs_reauth" && (
          <div className="flex items-center gap-space-xs p-space-xs bg-secondary-container/30 rounded-xl text-on-secondary-container text-body-sm">
            <Icon name="info" className="text-[18px] text-secondary" />
            <span>Bank session expired. Reconnect to resume syncing.</span>
          </div>
        )}
      </div>

      <div className="pt-space-md border-t border-surface-container flex items-center justify-between">
        <span className="flex items-center gap-1 text-caption text-on-surface-variant">
          <Icon name="schedule" className="text-[14px]" />
          Synced {relativeTime(account.last_synced_at)}
        </span>
        <div className="flex items-center gap-space-xs">
          <Link
            to={`/accounts/${account.id}`}
            className="px-space-md py-space-xs rounded-lg text-label-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
          >
            View
          </Link>
          {account.status === "needs_reauth" ? (
            <Button variant="primary" icon="lock_reset" className="h-9 px-space-md text-label-sm" onClick={onReconnect}>
              Reconnect
            </Button>
          ) : (
            <Button
              variant="surface"
              icon="refresh"
              loading={syncing}
              onClick={onSync}
              className="h-9 px-space-md text-label-sm"
            >
              Sync
            </Button>
          )}
        </div>
      </div>
    </Card>
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

export function Dashboard() {
  const toast = useToast();
  const [linkOpen, setLinkOpen] = useState(false);
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });

  const syncOne = useMutation({
    mutationFn: (id: string) => api.syncAccount(id),
    onSuccess: (res) =>
      toast(
        res.queued
          ? { kind: "info", title: "Sync queued", detail: "A worker will run it shortly" }
          : { kind: "error", title: "Queued locally", detail: "Message broker unreachable — will retry on schedule" },
      ),
    onError: (err) =>
      toast({ kind: "error", title: "Sync failed", detail: err instanceof ApiError ? err.detail : "Try again" }),
  });

  const syncAll = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.allSettled(ids.map((id) => api.syncAccount(id)));
    },
    onSuccess: () => toast({ kind: "info", title: "Sync queued for all accounts" }),
  });

  const accounts = accountsQuery.data ?? [];
  const totalsByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of accounts) m.set(a.currency, (m.get(a.currency) ?? 0) + Number(a.current_balance));
    return [...m.entries()];
  }, [accounts]);
  const lastSynced = accounts
    .map((a) => a.last_synced_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const syncableIds = accounts.filter((a) => a.status === "active").map((a) => a.id);

  return (
    <Layout onLink={() => setLinkOpen(true)}>
      <div className="space-y-space-2xl">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-space-md">
          <div>
            <p className="text-label-sm text-on-surface-variant uppercase tracking-wider">Overview</p>
            <h1 className="text-headline-lg font-bold tracking-tight">Your accounts</h1>
          </div>
        </div>

        <Card className="p-space-xl relative overflow-hidden">
          <div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-primary-container/10 blur-3xl pointer-events-none" />
          <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg">
            <div className="space-y-space-xs">
              <span className="text-label-md text-on-surface-variant">Total balance</span>
              {accountsQuery.isLoading ? (
                <div className="h-11 w-64 bg-surface-container rounded-lg animate-pulse" />
              ) : totalsByCurrency.length === 0 ? (
                <div className="text-headline-lg font-bold text-on-surface-variant">₵0.00</div>
              ) : (
                <div className="flex flex-wrap items-baseline gap-space-md">
                  {totalsByCurrency.map(([cur, sum]) => (
                    <span key={cur} className="text-display font-bold tabular-nums tracking-tight">
                      {formatMoney(sum, cur)}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-body-sm text-on-surface-variant flex items-center gap-space-xs">
                <Icon name="account_balance" className="text-[16px] text-secondary" />
                {accounts.length} account{accounts.length === 1 ? "" : "s"} · updated{" "}
                {relativeTime(lastSynced)}
              </p>
            </div>
            <div className="flex flex-wrap gap-space-sm">
              <Button
                variant="surface"
                icon="sync"
                loading={syncAll.isPending}
                disabled={syncableIds.length === 0}
                onClick={() => syncAll.mutate(syncableIds)}
              >
                Sync all
              </Button>
              <Button icon="add" onClick={() => setLinkOpen(true)}>
                Link account
              </Button>
            </div>
          </div>
        </Card>

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
            accounts.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                syncing={syncOne.isPending && syncOne.variables === a.id}
                onSync={() => syncOne.mutate(a.id)}
                onReconnect={() => setLinkOpen(true)}
              />
            ))
          )}
        </div>
      </div>

      {linkOpen && <LinkAccountModal onClose={() => setLinkOpen(false)} />}
    </Layout>
  );
}
