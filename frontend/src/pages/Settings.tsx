import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { Account } from "../lib/types";
import { useAuth } from "../auth/AuthContext";
import { formatMoney, relativeTime } from "../lib/format";
import { exportTransactionsCsv } from "../lib/export";
import { Layout } from "../components/Layout";
import { LinkAccountModal } from "../features/LinkAccountModal";
import { useToast } from "../components/Toast";
import { Button, Card, Icon, StatusPill } from "../components/ui";

interface Connection {
  linkedId: string;
  institution: string;
  status: Account["status"];
  lastSynced: string | null;
  linkedAt: string;
  accounts: Account[];
  anyAccountId: string;
  currency: string;
  total: number;
}

function groupConnections(accounts: Account[]): Connection[] {
  const map = new Map<string, Connection>();
  for (const a of accounts) {
    const c = map.get(a.linked_account_id);
    if (c) {
      c.accounts.push(a);
      c.total += Number(a.current_balance);
    } else {
      map.set(a.linked_account_id, {
        linkedId: a.linked_account_id,
        institution: a.institution_name,
        status: a.status,
        lastSynced: a.last_synced_at,
        linkedAt: a.linked_created_at,
        accounts: [a],
        anyAccountId: a.id,
        currency: a.currency,
        total: Number(a.current_balance),
      });
    }
  }
  return [...map.values()];
}

function PrefRow({
  icon,
  label,
  sub,
  control,
}: {
  icon: string;
  label: string;
  sub: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between p-space-md bg-surface-container-low rounded-xl gap-space-md">
      <div className="flex items-center gap-space-sm min-w-0">
        <span className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
          <Icon name={icon} className="text-[20px]" />
        </span>
        <div className="min-w-0">
          <span className="block text-label-md font-semibold">{label}</span>
          <span className="block text-caption text-on-surface-variant truncate">{sub}</span>
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function Settings() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirming, setConfirming] = useState<Connection | null>(null);

  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const configQuery = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
  const accounts = accountsQuery.data ?? [];
  const connections = useMemo(() => groupConnections(accounts), [accounts]);
  const defaultProvider = configQuery.data?.default_provider ?? "mock";
  const currency = accounts[0]?.currency ?? "GHS";

  const unlink = useMutation({
    mutationFn: (c: Connection) => api.unlinkAccount(c.anyAccountId),
    onSuccess: (_d, c) => {
      toast({ kind: "success", title: `Unlinked ${c.institution}` });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setConfirming(null);
    },
    onError: (err) =>
      toast({ kind: "error", title: "Couldn't unlink", detail: err instanceof ApiError ? err.detail : "" }),
  });

  const exportCsv = useMutation({
    mutationFn: () => exportTransactionsCsv(accounts),
    onSuccess: (n) => toast({ kind: "success", title: `Exported ${n} transaction${n === 1 ? "" : "s"}` }),
    onError: () => toast({ kind: "error", title: "Export failed" }),
  });

  return (
    <Layout onLink={() => setLinkOpen(true)}>
      <div className="space-y-space-xl">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
          <div>
            <p className="text-label-sm text-on-surface-variant uppercase tracking-widest">Settings</p>
            <h1 className="text-headline-lg font-bold tracking-tight">Account &amp; connections</h1>
            <p className="text-body-md text-on-surface-variant mt-space-2xs">
              Manage your linked institutions and export your aggregated history.
            </p>
          </div>
          <div className="flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-space-xs rounded-xl shadow-sm">
            <Icon name="lock" className="text-primary text-[18px]" />
            <div className="flex flex-col leading-tight">
              <span className="text-caption text-on-surface-variant uppercase tracking-wider">Token storage</span>
              <span className="text-label-sm font-semibold">Encrypted at rest (Fernet)</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
          {/* left rail */}
          <div className="lg:col-span-5 flex flex-col gap-space-lg">
            <Card className="p-space-xl relative overflow-hidden">
              <div className="absolute -top-4 -right-4 text-on-surface-variant/10 pointer-events-none select-none">
                <Icon name="shield" className="text-[96px]" />
              </div>
              <div className="relative flex flex-col gap-space-lg">
                <div className="flex items-center gap-space-md">
                  <div className="relative">
                    <span className="w-16 h-16 rounded-2xl bg-primary text-on-primary flex items-center justify-center text-headline-md font-bold shadow-md">
                      {user?.email.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface-container-lowest flex items-center justify-center">
                      <span className="w-3.5 h-3.5 rounded-full bg-primary block" />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-space-xs">
                      <span className="text-headline-sm font-bold truncate">{user?.email}</span>
                      <Icon name="check_circle" className="text-[18px] text-primary" />
                    </div>
                    <span className="text-body-sm text-on-surface-variant">Signed in</span>
                  </div>
                </div>
                <div className="bg-surface-container-low rounded-xl px-space-md py-space-xs flex items-center justify-between gap-space-md">
                  <span className="text-caption text-on-surface-variant uppercase tracking-wider">User ID</span>
                  <span className="text-label-sm font-mono truncate">{user?.id}</span>
                </div>
                <Button variant="ghost" icon="logout" onClick={logout} className="text-error self-start">
                  Sign out of session
                </Button>
              </div>
            </Card>

            <Card className="p-space-xl flex flex-col gap-space-lg">
              <h2 className="text-headline-sm font-bold">Preferences</h2>
              <div className="flex flex-col gap-space-md">
                <PrefRow
                  icon="hub"
                  label="Default for new links"
                  sub={
                    configQuery.data?.plaid_enabled
                      ? "Plaid and demo banks are both available"
                      : "Demo banks only (Plaid not configured)"
                  }
                  control={
                    <span className="px-space-xs py-1 rounded-lg bg-surface-container text-label-sm font-bold capitalize">
                      {defaultProvider}
                    </span>
                  }
                />
                <PrefRow
                  icon="payments"
                  label="Base currency"
                  sub="Taken from your linked accounts"
                  control={
                    <span className="px-space-xs py-1 rounded-lg bg-surface-container text-label-sm font-bold">
                      {currency}
                    </span>
                  }
                />
                <PrefRow
                  icon="palette"
                  label="Interface mode"
                  sub="Dark mode coming soon"
                  control={
                    <span className="inline-flex p-1 bg-surface-container rounded-lg gap-1">
                      <span className="px-space-xs py-0.5 rounded-md bg-surface-container-lowest text-on-surface text-label-sm font-semibold shadow-sm">
                        Light
                      </span>
                    </span>
                  }
                />
              </div>
            </Card>

            <Card className="p-space-lg flex items-start gap-space-sm bg-surface-container-low">
              <Icon name="lock_clock" className="text-primary text-[20px] shrink-0 mt-0.5" />
              <p className="text-body-sm text-on-surface-variant leading-relaxed">
                <span className="text-on-surface font-semibold">Read-only delegation.</span> KudiVault
                can query balances and transactions but cannot move money or change anything at your
                bank. Access is revoked at the provider when you unlink.
              </p>
            </Card>
          </div>

          {/* right rail */}
          <div className="lg:col-span-7 flex flex-col gap-space-lg">
            <Card className="p-space-xl flex flex-col gap-space-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                <div>
                  <div className="flex items-center gap-space-xs">
                    <h2 className="text-headline-sm font-bold">Linked connections</h2>
                    <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-label-sm font-semibold">
                      {connections.length}
                    </span>
                  </div>
                  <p className="text-body-sm text-on-surface-variant mt-0.5">
                    Each connection can expose one or more accounts.
                  </p>
                </div>
                <Button icon="add_link" className="h-10" onClick={() => setLinkOpen(true)}>
                  Link institution
                </Button>
              </div>

              {accountsQuery.isLoading ? (
                <div className="space-y-space-sm">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-28 bg-surface-container-low rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : connections.length === 0 ? (
                <p className="text-body-md text-on-surface-variant">No connections yet.</p>
              ) : (
                <div className="space-y-space-md">
                  {connections.map((c) => (
                    <div
                      key={c.linkedId}
                      className={`rounded-xl p-space-lg space-y-space-sm ${
                        c.status === "needs_reauth" ? "bg-secondary-container/30" : "bg-surface-container-low"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                        <div className="flex items-center gap-space-md">
                          <span className="w-12 h-12 rounded-xl bg-surface-container-lowest flex items-center justify-center text-primary-container font-bold">
                            {c.institution.replace(/^Mock Bank /, "").slice(0, 3).toUpperCase()}
                          </span>
                          <div>
                            <div className="flex items-center gap-space-xs">
                              <span className="text-headline-sm font-bold">{c.institution}</span>
                              <Icon
                                name={c.status === "needs_reauth" ? "warning" : "verified"}
                                className={`text-[16px] ${
                                  c.status === "needs_reauth" ? "text-secondary" : "text-primary"
                                }`}
                              />
                            </div>
                            <span className="text-caption text-on-surface-variant">
                              Linked {relativeTime(c.linkedAt)} · {c.accounts.length} account
                              {c.accounts.length === 1 ? "" : "s"} · via{" "}
                              {c.accounts[0].provider === "plaid" ? "Plaid" : "demo bank"}
                            </span>
                          </div>
                        </div>
                        <StatusPill status={c.status} />
                      </div>

                      {c.status === "needs_reauth" && (
                        <div className="bg-surface-container-lowest/80 p-space-md rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                          <span className="flex items-center gap-space-xs text-body-sm text-on-surface-variant">
                            <Icon name="info" className="text-[18px] text-secondary" />
                            Bank consent expired — reconnect to resume syncing.
                          </span>
                          <div className="flex items-center gap-space-xs">
                            <Button icon="sync_lock" className="h-9 text-label-sm" onClick={() => setLinkOpen(true)}>
                              Reconnect
                            </Button>
                            <button
                              onClick={() => setConfirming(c)}
                              className="px-space-sm py-1.5 rounded-lg text-label-sm text-on-surface-variant hover:text-error hover:bg-error-container/30 transition-colors"
                            >
                              Unlink
                            </button>
                          </div>
                        </div>
                      )}

                      {c.status !== "needs_reauth" && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-space-xs pt-space-xs bg-surface-container-lowest/60 p-space-sm rounded-lg">
                          <div>
                            <span className="block text-caption text-on-surface-variant">Aggregate balance</span>
                            <span className="text-label-md font-bold tabular-nums">
                              {formatMoney(c.total, c.currency)}
                            </span>
                          </div>
                          <div>
                            <span className="block text-caption text-on-surface-variant">Last sync</span>
                            <span className="text-label-md">{relativeTime(c.lastSynced)}</span>
                          </div>
                          <div className="col-span-2 sm:col-span-1 flex items-center justify-end">
                            <button
                              onClick={() => setConfirming(c)}
                              className="px-space-sm py-1 rounded-lg text-label-sm text-on-surface-variant hover:text-error hover:bg-error-container/30 transition-colors"
                            >
                              Unlink
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-space-lg flex items-center justify-between gap-space-md">
              <div className="flex items-center gap-space-md">
                <span className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface">
                  <Icon name="download_for_offline" className="text-[20px]" />
                </span>
                <div>
                  <span className="block text-label-md font-bold">Export transactions</span>
                  <span className="block text-caption text-on-surface-variant">
                    Every transaction across all accounts, as CSV
                  </span>
                </div>
              </div>
              <Button
                variant="surface"
                icon="download"
                loading={exportCsv.isPending}
                disabled={accounts.length === 0}
                onClick={() => exportCsv.mutate()}
              >
                Export CSV
              </Button>
            </Card>
          </div>
        </div>
      </div>

      {linkOpen && <LinkAccountModal onClose={() => setLinkOpen(false)} />}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-margin-mobile bg-inverse-surface/50 backdrop-blur-sm">
          <Card className="w-full max-w-lg p-space-xl space-y-space-lg">
            <div className="flex items-start gap-space-md">
              <span className="w-12 h-12 rounded-2xl bg-error-container text-error flex items-center justify-center">
                <Icon name="link_off" className="text-[26px]" />
              </span>
              <div>
                <h3 className="text-headline-sm font-bold">Unlink {confirming.institution}?</h3>
                <p className="text-body-sm text-on-surface-variant mt-0.5">
                  Its {confirming.accounts.length} account
                  {confirming.accounts.length === 1 ? "" : "s"} and all transaction history will be
                  permanently deleted, and access is revoked at the provider. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-space-sm">
              <Button variant="surface" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                icon="delete_forever"
                loading={unlink.isPending}
                onClick={() => unlink.mutate(confirming)}
              >
                Yes, unlink
              </Button>
            </div>
          </Card>
        </div>
      )}
    </Layout>
  );
}
