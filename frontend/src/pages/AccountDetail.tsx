import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { formatDate, formatMoney, relativeTime } from "../lib/format";
import { Layout } from "../components/Layout";
import { LinkAccountModal } from "../features/LinkAccountModal";
import { useToast } from "../components/Toast";
import { Button, Card, ErrorNote, Icon, JobChip, Spinner, StatusPill } from "../components/ui";

const PAGE_SIZE = 50;

const CATEGORY_ICON: Record<string, string> = {
  income: "payments",
  salary: "payments",
  transfer: "currency_exchange",
  groceries: "shopping_cart",
  utilities: "bolt",
  transport: "local_gas_station",
  dining: "restaurant",
  food: "restaurant",
};
const catIcon = (c: string | null) => CATEGORY_ICON[(c ?? "").toLowerCase()] ?? "receipt_long";

function Amount({ value, currency }: { value: string; currency: string }) {
  const n = Number(value);
  const positive = n >= 0;
  return (
    <span className={`font-semibold tabular-nums ${positive ? "text-primary" : "text-error"}`}>
      {positive ? "+" : "−"}
      {formatMoney(Math.abs(n), currency)}
    </span>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) {
    return <div className="w-24 h-9 flex items-center justify-center text-caption text-outline">—</div>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${34 - ((p - min) / range) * 30}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 36"
      className="w-24 h-9 stroke-primary fill-none"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points={d} />
    </svg>
  );
}

function SafetyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1 gap-space-md">
      <span className="text-on-surface-variant">{label}</span>
      <span className="font-medium text-on-surface text-right">{value}</span>
    </div>
  );
}

export function AccountDetail() {
  const { accountId = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();

  const [page, setPage] = useState(0);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [search, setSearch] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);

  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const account = accountsQuery.data?.find((a) => a.id === accountId);

  const balanceQuery = useQuery({
    queryKey: ["balance", accountId],
    queryFn: () => api.getBalance(accountId),
    enabled: !!accountId,
  });

  const txParams = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (start) p.set("start_date", start);
    if (end) p.set("end_date", end);
    return p;
  }, [page, start, end]);

  const txQuery = useQuery({
    queryKey: ["transactions", accountId, txParams.toString()],
    queryFn: () => api.getTransactions(accountId, txParams),
    enabled: !!accountId,
    placeholderData: (prev) => prev,
  });

  const monthQuery = useQuery({
    queryKey: ["account-month", accountId],
    enabled: !!accountId,
    staleTime: 60_000,
    queryFn: async () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const p = new URLSearchParams({
        limit: "200",
        offset: "0",
        start_date: iso(from),
        end_date: iso(to),
      });
      const pageData = await api.getTransactions(accountId, p);
      let credits = 0;
      let debits = 0;
      const byDay = new Map<string, number>();
      for (const t of pageData.items) {
        const n = Number(t.amount);
        if (n >= 0) credits += n;
        else debits += -n;
        const day = t.posted_at.slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + n);
      }
      let run = 0;
      const spark = [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => (run += v));
      const ratio = credits > 0 ? ((credits - debits) / credits) * 100 : null;
      return {
        label: from.toLocaleString("en", { month: "long" }),
        credits,
        debits,
        ratio,
        spark,
      };
    },
  });

  const statusQuery = useQuery({
    queryKey: ["syncStatus", accountId],
    queryFn: () => api.syncStatus(accountId),
    enabled: !!accountId,
    refetchInterval: (q) => {
      const s = q.state.data?.latest_job?.status;
      return s === "queued" || s === "in_progress" ? 2000 : false;
    },
  });

  const sync = useMutation({
    mutationFn: () => api.syncAccount(accountId),
    onSuccess: (res) => {
      toast(
        res.queued
          ? { kind: "info", title: "Sync queued", detail: "A worker will run it shortly" }
          : { kind: "error", title: "Queued locally", detail: "Broker unreachable — retries on schedule" },
      );
      setTimeout(() => {
        for (const key of [
          ["syncStatus", accountId],
          ["balance", accountId],
          ["transactions", accountId],
          ["account-month", accountId],
          ["accounts"],
        ]) {
          qc.invalidateQueries({ queryKey: key });
        }
      }, 1500);
    },
    onError: (err) =>
      toast({
        kind: "error",
        title: err instanceof ApiError && err.status === 409 ? "Needs re-authentication" : "Sync failed",
        detail: err instanceof ApiError ? err.detail : "Try again",
      }),
  });

  if (accountsQuery.isLoading) {
    return (
      <Layout>
        <div className="py-space-3xl flex justify-center text-primary">
          <Spinner className="text-[32px]" />
        </div>
      </Layout>
    );
  }
  if (!account) {
    return (
      <Layout>
        <Card className="p-space-xl text-center space-y-space-sm">
          <p className="text-headline-sm font-semibold">Account not found</p>
          <Link to="/" className="text-primary font-semibold">
            Back to dashboard
          </Link>
        </Card>
      </Layout>
    );
  }

  const badge = account.institution_name.replace(/^Mock Bank /, "").slice(0, 3).toUpperCase();
  const pageData = txQuery.data;
  const rows = (pageData?.items ?? []).filter((t) =>
    search ? t.description.toLowerCase().includes(search.toLowerCase()) : true,
  );
  const totalPages = pageData ? Math.max(1, Math.ceil(pageData.total / PAGE_SIZE)) : 1;
  const job = statusQuery.data?.latest_job;
  const m = monthQuery.data;
  const balCurrency = balanceQuery.data?.currency ?? account.currency;
  const providerLabel = account.provider === "plaid" ? "Plaid" : "Demo bank";

  return (
    <Layout onLink={() => setLinkOpen(true)}>
      <div className="space-y-space-xl">
        {/* breadcrumbs */}
        <nav className="flex items-center gap-space-xs text-label-md text-on-surface-variant">
          <Link to="/" className="hover:text-primary transition-colors">
            Dashboard
          </Link>
          <Icon name="chevron_right" className="text-[16px] text-outline" />
          <Link to="/" className="hover:text-primary transition-colors">
            Accounts
          </Link>
          <Icon name="chevron_right" className="text-[16px] text-outline" />
          <span className="text-on-surface font-semibold truncate">
            {account.institution_name} — {account.account_name}
          </span>
        </nav>

        {/* institution header */}
        <Card className="p-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          <div className="flex items-start md:items-center gap-space-md">
            <span className="w-14 h-14 rounded-2xl bg-primary-fixed flex items-center justify-center text-primary font-bold text-headline-md shrink-0">
              {badge}
            </span>
            <div className="flex flex-col gap-space-2xs min-w-0">
              <div className="flex flex-wrap items-center gap-space-xs">
                <h1 className="text-headline-md font-semibold tracking-tight">
                  {account.institution_name}
                </h1>
                <StatusPill status={account.status} />
                <span className="px-2 py-0.5 rounded-lg bg-surface-container text-label-sm text-on-surface-variant capitalize">
                  {account.account_type}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-space-md gap-y-space-2xs text-body-sm text-on-surface-variant">
                <span className="font-medium text-on-surface">{account.account_name}</span>
                <span className="text-outline-variant">•</span>
                <span className="font-mono tracking-wider">{account.provider_account_id}</span>
                <span className="text-outline-variant">•</span>
                <span className="flex items-center gap-1">
                  <Icon name="hub" className="text-[15px]" />
                  via {providerLabel}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-space-sm self-start md:self-auto">
            {account.status === "needs_reauth" ? (
              <Button icon="lock_reset" onClick={() => setLinkOpen(true)}>
                Reconnect
              </Button>
            ) : (
              <Button
                variant="surface"
                icon="sync"
                loading={sync.isPending}
                onClick={() => sync.mutate()}
                id="refreshBtn"
              >
                Sync now
              </Button>
            )}
          </div>
        </Card>

        {/* bento: balance + safety */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          <Card className="lg:col-span-8 p-space-xl flex flex-col justify-between gap-space-lg relative overflow-hidden">
            <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
            <div className="relative">
              <div className="flex items-center justify-between gap-space-md mb-space-sm">
                <span className="text-label-md uppercase tracking-wider text-on-surface-variant">
                  Current balance
                </span>
                <span className="inline-flex items-center gap-1 text-caption text-on-surface-variant bg-surface-container px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
                  Synced {relativeTime(statusQuery.data?.last_synced_at ?? account.last_synced_at)}
                </span>
              </div>
              <div className="flex items-baseline gap-space-xs">
                <span className="text-currency-display font-bold tracking-tight">
                  {formatMoney(balanceQuery.data?.current_balance ?? account.current_balance, balCurrency)}
                </span>
                <span className="text-label-md font-semibold text-on-surface-variant">{balCurrency}</span>
              </div>
              <p className="text-body-sm text-on-surface-variant mt-space-2xs">
                Available:{" "}
                <span className="font-semibold text-on-surface">
                  {account.available_balance
                    ? formatMoney(account.available_balance, balCurrency)
                    : "Unavailable"}
                </span>
              </p>
            </div>

            {/* month metrics + sparkline */}
            <div className="pt-space-md bg-surface-container-low/60 rounded-xl p-space-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md">
              {monthQuery.isLoading ? (
                <div className="h-10 w-full bg-surface-container rounded-lg animate-pulse" />
              ) : (
                <>
                  <div className="flex items-center gap-space-lg">
                    <div className="flex flex-col">
                      <span className="text-label-sm text-on-surface-variant">{m?.label} credits</span>
                      <span className="text-headline-sm font-semibold text-primary tabular-nums">
                        +{formatMoney(m?.credits ?? 0, balCurrency)}
                      </span>
                    </div>
                    <div className="w-px h-8 bg-surface-container" />
                    <div className="flex flex-col">
                      <span className="text-label-sm text-on-surface-variant">{m?.label} debits</span>
                      <span className="text-headline-sm font-semibold text-error tabular-nums">
                        -{formatMoney(m?.debits ?? 0, balCurrency)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-space-xs self-end sm:self-auto">
                    <div className="flex flex-col text-right">
                      <span className="text-caption text-on-surface-variant">Net inflow ratio</span>
                      <span className="text-label-sm font-bold text-primary">
                        {m?.ratio == null ? "Unavailable" : `${m.ratio >= 0 ? "+" : ""}${m.ratio.toFixed(1)}%`}
                      </span>
                    </div>
                    <Sparkline points={m?.spark ?? []} />
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* safety / connection rail */}
          <Card className="lg:col-span-4 p-space-lg flex flex-col justify-between gap-space-md">
            <div className="flex items-center justify-between">
              <span className="text-headline-sm font-semibold">Connection</span>
              <Icon name="shield" className="text-primary text-[22px]" />
            </div>
            <div className="flex flex-col text-body-sm gap-space-2xs">
              <SafetyRow label="Provider" value={providerLabel} />
              <SafetyRow
                label="Status"
                value={<span className="capitalize">{account.status.replace("_", " ")}</span>}
              />
              <SafetyRow label="Last synced" value={relativeTime(account.last_synced_at)} />
              <SafetyRow label="Sync schedule" value="Automatic (worker)" />
              <SafetyRow label="Access token" value="Encrypted (Fernet)" />
            </div>
            {account.status === "needs_reauth" ? (
              <Button icon="lock_reset" className="w-full" onClick={() => setLinkOpen(true)}>
                Reconnect
              </Button>
            ) : (
              <Button
                variant="surface"
                icon="sync"
                loading={sync.isPending}
                className="w-full"
                onClick={() => sync.mutate()}
              >
                Sync now
              </Button>
            )}
          </Card>
        </div>

        {/* transaction ledger */}
        <Card className="p-space-lg space-y-space-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
            <div>
              <h2 className="text-headline-sm font-semibold">Transaction ledger</h2>
              <p className="text-body-sm text-on-surface-variant">
                Synced from {providerLabel}
                {pageData ? ` · ${pageData.total} record${pageData.total === 1 ? "" : "s"}` : ""}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-space-sm items-center">
            <div className="lg:col-span-6 relative">
              <Icon
                name="search"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this page by description…"
                className="w-full h-11 pl-10 pr-space-md rounded-xl bg-surface-container-low text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <label className="lg:col-span-3 flex items-center gap-space-xs h-11 px-space-md rounded-xl bg-surface-container-low text-body-sm">
              <Icon name="calendar_today" className="text-[18px] text-outline" />
              <input
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setPage(0);
                }}
                className="bg-transparent focus:outline-none flex-1"
              />
            </label>
            <label className="lg:col-span-3 flex items-center gap-space-xs h-11 px-space-md rounded-xl bg-surface-container-low text-body-sm">
              <span className="text-on-surface-variant">to</span>
              <input
                type="date"
                value={end}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setPage(0);
                }}
                className="bg-transparent focus:outline-none flex-1"
              />
            </label>
          </div>

          {txQuery.isError ? (
            <ErrorNote message="Couldn't load transactions." />
          ) : txQuery.isLoading ? (
            <div className="space-y-space-xs">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 bg-surface-container-low rounded-lg animate-pulse" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-space-3xl flex flex-col items-center text-center gap-space-xs bg-surface-container-low/40 rounded-2xl">
              <span className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center text-outline">
                <Icon name="receipt_long" className="text-[40px]" />
              </span>
              <h3 className="text-headline-sm font-semibold">No transactions for this view</h3>
              <p className="text-body-md text-on-surface-variant max-w-md">
                Nothing recorded for this account matching your date range or filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant text-label-sm">
                    <th className="py-space-sm px-space-md rounded-l-xl font-semibold">Date</th>
                    <th className="py-space-sm px-space-md font-semibold">Description</th>
                    <th className="py-space-sm px-space-md font-semibold">Category</th>
                    <th className="py-space-sm px-space-md font-semibold">Ref</th>
                    <th className="py-space-sm px-space-md text-right rounded-r-xl font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="text-body-sm divide-y divide-surface-container-low">
                  {rows.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-container-low/50 transition-colors">
                      <td className="py-space-md px-space-md whitespace-nowrap text-on-surface-variant">
                        {formatDate(t.posted_at)}
                      </td>
                      <td className="py-space-md px-space-md">
                        <div className="flex items-center gap-space-sm">
                          <span className="w-8 h-8 rounded-lg bg-surface-container text-on-surface-variant flex items-center justify-center shrink-0">
                            <Icon name={catIcon(t.category)} className="text-[18px]" />
                          </span>
                          <span className="font-medium">{t.description}</span>
                        </div>
                      </td>
                      <td className="py-space-md px-space-md whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant text-label-sm capitalize">
                          {t.category ?? "uncategorised"}
                        </span>
                      </td>
                      <td className="py-space-md px-space-md whitespace-nowrap font-mono text-caption text-on-surface-variant">
                        {t.provider_transaction_id}
                      </td>
                      <td className="py-space-md px-space-md text-right whitespace-nowrap">
                        <Amount value={t.amount} currency={t.currency} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pageData && pageData.total > PAGE_SIZE && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-space-md text-label-md text-on-surface-variant">
              <span>
                Showing{" "}
                <strong className="text-on-surface">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, pageData.total)}
                </strong>{" "}
                of <strong className="text-on-surface">{pageData.total}</strong>
              </span>
              <div className="flex items-center gap-space-xs">
                <Button
                  variant="surface"
                  icon="chevron_left"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-9"
                >
                  Previous
                </Button>
                <span className="px-3 py-1 bg-surface-container rounded-lg font-semibold text-on-surface">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="surface"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-9"
                >
                  Next
                  <Icon name="chevron_right" className="text-[18px]" />
                </Button>
              </div>
            </div>
          )}

          {job && (
            <div className="flex items-center gap-space-sm text-body-sm text-on-surface-variant pt-space-xs border-t border-surface-container">
              <span className="text-label-sm">Last sync</span>
              <JobChip status={job.status} />
              <span>
                {relativeTime(job.started_at)}
                {job.finished_at && <> · finished {relativeTime(job.finished_at)}</>}
              </span>
              {job.error_message && <span className="text-error truncate">— {job.error_message}</span>}
            </div>
          )}
        </Card>
      </div>

      {linkOpen && <LinkAccountModal onClose={() => setLinkOpen(false)} />}
    </Layout>
  );
}
