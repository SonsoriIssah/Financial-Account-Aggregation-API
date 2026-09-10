import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { formatDate, formatMoney, relativeTime } from "../lib/format";
import { Layout } from "../components/Layout";
import { useToast } from "../components/Toast";
import { Button, Card, ErrorNote, Icon, JobChip, Spinner, StatusPill } from "../components/ui";

const PAGE_SIZE = 50;

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

export function AccountDetail() {
  const { accountId = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();

  const [page, setPage] = useState(0);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [search, setSearch] = useState("");

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
          : { kind: "error", title: "Queued locally", detail: "Broker unreachable — will retry on schedule" },
      );
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["syncStatus", accountId] });
        qc.invalidateQueries({ queryKey: ["balance", accountId] });
        qc.invalidateQueries({ queryKey: ["transactions", accountId] });
        qc.invalidateQueries({ queryKey: ["accounts"] });
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

  const page_ = txQuery.data;
  const rows = (page_?.items ?? []).filter((t) =>
    search ? t.description.toLowerCase().includes(search.toLowerCase()) : true,
  );
  const totalPages = page_ ? Math.max(1, Math.ceil(page_.total / PAGE_SIZE)) : 1;
  const job = statusQuery.data?.latest_job;

  return (
    <Layout>
      <div className="space-y-space-xl">
        <nav className="flex items-center gap-space-xs text-label-md text-on-surface-variant">
          <Link to="/" className="hover:text-primary">
            Dashboard
          </Link>
          <Icon name="chevron_right" className="text-[16px]" />
          <span className="text-on-surface font-semibold truncate">{account.account_name}</span>
        </nav>

        <Card className="p-space-lg flex flex-col md:flex-row md:items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md">
            <span className="w-14 h-14 rounded-2xl bg-primary-fixed flex items-center justify-center text-primary font-bold text-headline-md">
              {account.institution_name.replace(/^Mock Bank /, "").slice(0, 3).toUpperCase()}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-space-xs">
                <h1 className="text-headline-md font-semibold tracking-tight">
                  {account.institution_name}
                </h1>
                <StatusPill status={account.status} />
              </div>
              <p className="text-body-sm text-on-surface-variant capitalize">
                {account.account_name} · {account.account_type}
              </p>
            </div>
          </div>
          <Button
            variant="surface"
            icon="sync"
            loading={sync.isPending}
            disabled={account.status === "needs_reauth"}
            onClick={() => sync.mutate()}
          >
            Sync now
          </Button>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
          <Card className="lg:col-span-2 p-space-xl relative overflow-hidden">
            <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
            <div className="relative">
              <div className="flex items-center justify-between gap-space-md">
                <span className="text-label-md uppercase tracking-wider text-on-surface-variant">
                  Current balance
                </span>
                <span className="text-caption text-on-surface-variant bg-surface-container px-2.5 py-1 rounded-full">
                  synced {relativeTime(statusQuery.data?.last_synced_at ?? account.last_synced_at)}
                </span>
              </div>
              <div className="text-currency-display font-bold tracking-tight mt-space-xs">
                {balanceQuery.data
                  ? formatMoney(balanceQuery.data.current_balance, balanceQuery.data.currency)
                  : formatMoney(account.current_balance, account.currency)}
              </div>
              <p className="text-body-sm text-on-surface-variant mt-space-2xs">
                Available:{" "}
                <span className="font-semibold text-on-surface">
                  {account.available_balance
                    ? formatMoney(account.available_balance, account.currency)
                    : "—"}
                </span>{" "}
                · {account.currency}
              </p>
            </div>
          </Card>

          <Card className="p-space-lg flex flex-col gap-space-sm">
            <div className="flex items-center justify-between">
              <span className="text-headline-sm font-semibold">Last sync</span>
              <Icon name="history" className="text-primary text-[20px]" />
            </div>
            {statusQuery.isLoading ? (
              <div className="h-16 bg-surface-container rounded-xl animate-pulse" />
            ) : job ? (
              <div className="space-y-space-xs text-body-sm">
                <JobChip status={job.status} />
                <p className="text-on-surface-variant">
                  Started {relativeTime(job.started_at)}
                  {job.finished_at && <> · finished {relativeTime(job.finished_at)}</>}
                </p>
                {job.error_message && <ErrorNote message={job.error_message} />}
              </div>
            ) : (
              <p className="text-body-sm text-on-surface-variant">No sync has run yet.</p>
            )}
          </Card>
        </div>

        <Card className="p-space-lg space-y-space-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
            <div>
              <h2 className="text-headline-sm font-semibold">Transactions</h2>
              <p className="text-body-sm text-on-surface-variant">
                {page_ ? `${page_.total} total` : "…"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-sm">
            <div className="relative lg:col-span-2">
              <Icon
                name="search"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-outline"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter this page by description"
                className="w-full h-11 pl-10 pr-space-md rounded-xl bg-surface-container-low text-body-sm focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <label className="flex items-center gap-space-xs h-11 px-space-md rounded-xl bg-surface-container-low text-body-sm">
              <span className="text-on-surface-variant">From</span>
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
            <label className="flex items-center gap-space-xs h-11 px-space-md rounded-xl bg-surface-container-low text-body-sm">
              <span className="text-on-surface-variant">To</span>
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
                <div key={i} className="h-12 bg-surface-container-low rounded-lg animate-pulse" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-space-2xl flex flex-col items-center text-center gap-space-xs bg-surface-container-low/40 rounded-2xl">
              <Icon name="receipt_long" className="text-[40px] text-outline" />
              <p className="text-headline-sm font-semibold">No transactions</p>
              <p className="text-body-sm text-on-surface-variant">
                Nothing matches this range or filter yet.
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
                    <th className="py-space-sm px-space-md text-right rounded-r-xl font-semibold">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="text-body-sm divide-y divide-surface-container-low">
                  {rows.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-container-low/50">
                      <td className="py-space-md px-space-md whitespace-nowrap text-on-surface-variant">
                        {formatDate(t.posted_at)}
                      </td>
                      <td className="py-space-md px-space-md font-medium">{t.description}</td>
                      <td className="py-space-md px-space-md">
                        <span className="text-caption px-2.5 py-1 rounded-full bg-surface-container text-on-surface-variant">
                          {t.category ?? "uncategorised"}
                        </span>
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

          {page_ && page_.total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-label-md text-on-surface-variant">
              <span>
                Showing{" "}
                <strong className="text-on-surface">
                  {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, page_.total)}
                </strong>{" "}
                of <strong className="text-on-surface">{page_.total}</strong>
              </span>
              <div className="flex items-center gap-space-xs">
                <Button
                  variant="surface"
                  icon="chevron_left"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="h-9"
                >
                  Prev
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
        </Card>
      </div>
    </Layout>
  );
}
