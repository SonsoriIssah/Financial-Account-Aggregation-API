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

function StatTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <Card className="p-space-lg flex items-center gap-space-md">
      <span className="w-11 h-11 rounded-xl bg-surface-container flex items-center justify-center text-primary shrink-0">
        <Icon name={icon} className="text-[22px]" />
      </span>
      <div>
        <div className="text-label-sm text-on-surface-variant uppercase tracking-wider">{label}</div>
        <div className="text-headline-sm font-bold tabular-nums">{value}</div>
      </div>
    </Card>
  );
}

export function Accounts() {
  const toast = useToast();
  const [linkOpen, setLinkOpen] = useState(false);
  const [q, setQ] = useState("");

  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const accounts = accountsQuery.data ?? [];

  const sync = useMutation({
    mutationFn: (id: string) => api.syncAccount(id),
    onSuccess: (res) =>
      toast(
        res.queued
          ? { kind: "info", title: "Sync queued", detail: "A worker will run it shortly" }
          : { kind: "error", title: "Queued locally", detail: "Broker unreachable — retries on schedule" },
      ),
    onError: (err) =>
      toast({ kind: "error", title: "Sync failed", detail: err instanceof ApiError ? err.detail : "" }),
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? accounts.filter(
          (a) =>
            a.institution_name.toLowerCase().includes(needle) ||
            a.account_name.toLowerCase().includes(needle),
        )
      : accounts;
  }, [accounts, q]);

  const totalsByCurrency = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of accounts) m.set(a.currency, (m.get(a.currency) ?? 0) + Number(a.current_balance));
    return [...m.entries()];
  }, [accounts]);
  const linkedIds = new Set(accounts.map((a) => a.linked_account_id));
  const activeLinked = new Set(
    accounts.filter((a) => a.status === "active").map((a) => a.linked_account_id),
  );

  return (
    <Layout onLink={() => setLinkOpen(true)}>
      <div className="space-y-space-xl">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-space-md">
          <div>
            <p className="text-label-sm text-on-surface-variant uppercase tracking-widest">Accounts</p>
            <h1 className="text-headline-lg font-bold tracking-tight">All linked accounts</h1>
          </div>
          <Button icon="add" onClick={() => setLinkOpen(true)}>
            Link account
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-lg">
          <StatTile icon="account_balance" label="Accounts" value={String(accounts.length)} />
          <StatTile
            icon="hub"
            label="Active connections"
            value={`${activeLinked.size} / ${linkedIds.size}`}
          />
          <StatTile
            icon="payments"
            label="Total balance"
            value={
              totalsByCurrency.length === 0
                ? "₵0.00"
                : formatMoney(totalsByCurrency[0][1], totalsByCurrency[0][0]) +
                  (totalsByCurrency.length > 1 ? " +" : "")
            }
          />
        </div>

        <Card className="p-space-lg space-y-space-md">
          <div className="relative sm:max-w-sm">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search institution or account…"
              className="w-full h-11 pl-10 pr-space-md rounded-xl bg-surface-container-low text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {accountsQuery.isLoading ? (
            <div className="space-y-space-xs">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 bg-surface-container-low rounded-lg animate-pulse" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <div className="py-space-3xl flex flex-col items-center text-center gap-space-sm">
              <span className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline">
                <Icon name="account_balance" className="text-[32px]" />
              </span>
              <h3 className="text-headline-sm font-semibold">No accounts linked yet</h3>
              <Button icon="add" onClick={() => setLinkOpen(true)}>
                Link your first account
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-body-sm text-on-surface-variant py-space-lg text-center">
              Nothing matches “{q}”.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant text-label-sm">
                    <th className="py-space-sm px-space-md rounded-l-xl font-semibold">Institution</th>
                    <th className="py-space-sm px-space-md font-semibold">Account</th>
                    <th className="py-space-sm px-space-md font-semibold">Status</th>
                    <th className="py-space-sm px-space-md font-semibold">Last synced</th>
                    <th className="py-space-sm px-space-md text-right font-semibold">Balance</th>
                    <th className="py-space-sm px-space-md text-right rounded-r-xl font-semibold" />
                  </tr>
                </thead>
                <tbody className="text-body-sm divide-y divide-surface-container-low">
                  {filtered.map((a: Account) => (
                    <tr key={a.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="py-space-md px-space-md">
                        <div className="flex items-center gap-space-sm">
                          <span className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-primary-container font-bold text-label-sm shrink-0">
                            {a.institution_name.replace(/^Mock Bank /, "").slice(0, 3).toUpperCase()}
                          </span>
                          <span className="font-semibold">{a.institution_name}</span>
                        </div>
                      </td>
                      <td className="py-space-md px-space-md">
                        <span className="block">{a.account_name}</span>
                        <span className="block text-caption text-on-surface-variant capitalize">
                          {a.account_type} · {a.provider_account_id}
                        </span>
                      </td>
                      <td className="py-space-md px-space-md">
                        <StatusPill status={a.status} />
                      </td>
                      <td className="py-space-md px-space-md whitespace-nowrap text-on-surface-variant">
                        {relativeTime(a.last_synced_at)}
                      </td>
                      <td className="py-space-md px-space-md text-right whitespace-nowrap font-semibold tabular-nums">
                        {a.currency === "GHS" ? "₵" : ""}
                        {formatAmount(a.current_balance)}
                      </td>
                      <td className="py-space-md px-space-md text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-space-xs">
                          <Link
                            to={`/accounts/${a.id}`}
                            className="px-space-sm py-1.5 rounded-lg text-label-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                          >
                            View
                          </Link>
                          <Button
                            variant="surface"
                            icon={a.status === "needs_reauth" ? "lock_reset" : "refresh"}
                            className="h-8 px-space-sm text-label-sm"
                            loading={sync.isPending && sync.variables === a.id}
                            onClick={() =>
                              a.status === "needs_reauth" ? setLinkOpen(true) : sync.mutate(a.id)
                            }
                          >
                            {a.status === "needs_reauth" ? "Reconnect" : "Sync"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {linkOpen && <LinkAccountModal onClose={() => setLinkOpen(false)} />}
    </Layout>
  );
}
