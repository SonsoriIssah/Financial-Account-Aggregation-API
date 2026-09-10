import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { Account } from "../lib/types";
import { useAuth } from "../auth/AuthContext";
import { formatMoney, relativeTime } from "../lib/format";
import { Layout } from "../components/Layout";
import { LinkAccountModal } from "../features/LinkAccountModal";
import { useToast } from "../components/Toast";
import { Button, Card, Icon, StatusPill } from "../components/ui";

interface Connection {
  linkedId: string;
  institution: string;
  status: Account["status"];
  lastSynced: string | null;
  accounts: Account[];
  anyAccountId: string;
}

function groupConnections(accounts: Account[]): Connection[] {
  const map = new Map<string, Connection>();
  for (const a of accounts) {
    const c = map.get(a.linked_account_id);
    if (c) {
      c.accounts.push(a);
    } else {
      map.set(a.linked_account_id, {
        linkedId: a.linked_account_id,
        institution: a.institution_name,
        status: a.status,
        lastSynced: a.last_synced_at,
        accounts: [a],
        anyAccountId: a.id,
      });
    }
  }
  return [...map.values()];
}

export function Settings() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [linkOpen, setLinkOpen] = useState(false);
  const [confirming, setConfirming] = useState<Connection | null>(null);

  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const connections = useMemo(
    () => groupConnections(accountsQuery.data ?? []),
    [accountsQuery.data],
  );

  const unlink = useMutation({
    mutationFn: (c: Connection) => api.unlinkAccount(c.anyAccountId),
    onSuccess: (_data, c) => {
      toast({ kind: "success", title: `Unlinked ${c.institution}` });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setConfirming(null);
    },
    onError: (err) =>
      toast({ kind: "error", title: "Couldn't unlink", detail: err instanceof ApiError ? err.detail : "" }),
  });

  return (
    <Layout onLink={() => setLinkOpen(true)}>
      <div className="space-y-space-xl max-w-3xl">
        <div>
          <p className="text-label-sm text-on-surface-variant uppercase tracking-wider">Settings</p>
          <h1 className="text-headline-lg font-bold tracking-tight">Account & connections</h1>
        </div>

        <Card className="p-space-xl flex items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md">
            <span className="w-14 h-14 rounded-2xl bg-primary text-on-primary flex items-center justify-center text-headline-md font-bold">
              {user?.email.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <p className="text-headline-sm font-semibold">{user?.email}</p>
              <p className="text-body-sm text-on-surface-variant">Signed in</p>
            </div>
          </div>
          <Button variant="ghost" icon="logout" onClick={logout} className="text-error">
            Sign out
          </Button>
        </Card>

        <Card className="p-space-xl space-y-space-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
            <div>
              <div className="flex items-center gap-space-xs">
                <h2 className="text-headline-sm font-semibold">Linked connections</h2>
                <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-label-sm font-semibold">
                  {connections.length}
                </span>
              </div>
              <p className="text-body-sm text-on-surface-variant mt-0.5">
                Each connection can expose one or more accounts.
              </p>
            </div>
            <Button icon="add_link" onClick={() => setLinkOpen(true)}>
              Link institution
            </Button>
          </div>

          {accountsQuery.isLoading ? (
            <div className="space-y-space-sm">
              {[0, 1].map((i) => (
                <div key={i} className="h-24 bg-surface-container-low rounded-xl animate-pulse" />
              ))}
            </div>
          ) : connections.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">No connections yet.</p>
          ) : (
            <div className="space-y-space-md">
              {connections.map((c) => (
                <div key={c.linkedId} className="bg-surface-container-low rounded-xl p-space-lg space-y-space-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                    <div className="flex items-center gap-space-md">
                      <span className="w-12 h-12 rounded-xl bg-surface-container-lowest flex items-center justify-center text-primary-container font-bold">
                        {c.institution.replace(/^Mock Bank /, "").slice(0, 3).toUpperCase()}
                      </span>
                      <div>
                        <p className="text-headline-sm font-bold">{c.institution}</p>
                        <p className="text-caption text-on-surface-variant">
                          {c.accounts.length} account{c.accounts.length === 1 ? "" : "s"} · synced{" "}
                          {relativeTime(c.lastSynced)}
                        </p>
                      </div>
                    </div>
                    <StatusPill status={c.status} />
                  </div>
                  <div className="flex items-center justify-between pt-space-xs border-t border-surface-container">
                    <span className="text-label-md text-on-surface font-semibold tabular-nums">
                      {formatMoney(
                        c.accounts.reduce((sum, a) => sum + Number(a.current_balance), 0),
                        c.accounts[0].currency,
                      )}
                    </span>
                    <button
                      onClick={() => setConfirming(c)}
                      className="px-space-md py-space-xs rounded-lg text-label-sm text-on-surface-variant hover:text-error hover:bg-error-container/30 transition-colors"
                    >
                      Unlink
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
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
                  permanently deleted. This cannot be undone.
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
