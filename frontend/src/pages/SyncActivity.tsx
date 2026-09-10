import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { SyncActivityItem } from "../lib/types";
import { relativeTime } from "../lib/format";
import { Layout } from "../components/Layout";
import { useToast } from "../components/Toast";
import { Button, Card, Icon, JobChip } from "../components/ui";

const JOB_ICON: Record<string, string> = {
  queued: "hourglass_empty",
  in_progress: "sync",
  success: "check_circle",
  failed: "error",
};

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <Card className="p-space-lg">
      <div className="text-label-sm text-on-surface-variant uppercase tracking-wider">{label}</div>
      <div
        className={`text-headline-md font-bold tabular-nums mt-0.5 ${
          tone === "good" ? "text-primary" : tone === "bad" ? "text-error" : ""
        }`}
      >
        {value}
      </div>
    </Card>
  );
}

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export function SyncActivity() {
  const qc = useQueryClient();
  const toast = useToast();

  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: api.listAccounts });
  const activityQuery = useQuery({
    queryKey: ["sync-activity"],
    queryFn: api.syncActivity,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((j) => j.status === "queued" || j.status === "in_progress")
        ? 2500
        : false,
  });

  const items = activityQuery.data ?? [];
  const stats = useMemo(() => {
    const total = items.length;
    const success = items.filter((j) => j.status === "success").length;
    const failed = items.filter((j) => j.status === "failed").length;
    const running = items.filter((j) => j.status === "queued" || j.status === "in_progress").length;
    return { total, success, failed, running };
  }, [items]);

  const grouped = useMemo(() => {
    const m = new Map<string, SyncActivityItem[]>();
    for (const j of items) {
      const k = dayKey(j.started_at);
      const arr = m.get(k);
      if (arr) arr.push(j);
      else m.set(k, [j]);
    }
    return [...m.entries()];
  }, [items]);

  const syncAll = useMutation({
    mutationFn: async () => {
      const ids = (accountsQuery.data ?? []).filter((a) => a.status === "active").map((a) => a.id);
      await Promise.allSettled(ids.map((id) => api.syncAccount(id)));
    },
    onSuccess: () => {
      toast({ kind: "info", title: "Sync queued for all connections" });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["sync-activity"] }), 1500);
    },
  });

  return (
    <Layout>
      <div className="space-y-space-xl">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-space-md">
          <div>
            <p className="text-label-sm text-on-surface-variant uppercase tracking-widest">Sync activity</p>
            <h1 className="text-headline-lg font-bold tracking-tight">Recent sync jobs</h1>
            <p className="text-body-md text-on-surface-variant mt-space-2xs">
              Every sync attempt across your connections — queued, running, done or failed.
            </p>
          </div>
          <Button
            variant="surface"
            icon="sync"
            loading={syncAll.isPending}
            onClick={() => syncAll.mutate()}
          >
            Sync all
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-lg">
          <StatTile label="Recent runs" value={String(stats.total)} />
          <StatTile
            label="Succeeded"
            value={stats.total ? `${Math.round((stats.success / stats.total) * 100)}%` : "—"}
            tone="good"
          />
          <StatTile label="Failed" value={String(stats.failed)} tone={stats.failed ? "bad" : undefined} />
          <StatTile
            label="In flight"
            value={String(stats.running)}
            tone={stats.running ? "good" : undefined}
          />
        </div>

        <Card className="p-space-lg">
          {activityQuery.isLoading ? (
            <div className="space-y-space-xs">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 bg-surface-container-low rounded-lg animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-space-3xl flex flex-col items-center text-center gap-space-sm">
              <span className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-outline">
                <Icon name="history" className="text-[32px]" />
              </span>
              <h3 className="text-headline-sm font-semibold">No sync jobs yet</h3>
              <p className="text-body-md text-on-surface-variant max-w-sm">
                Link an account or hit “Sync all” — jobs will show up here.
              </p>
            </div>
          ) : (
            <div className="space-y-space-lg">
              {grouped.map(([day, jobs]) => (
                <div key={day} className="space-y-space-sm">
                  <div className="text-label-sm text-on-surface-variant uppercase tracking-wider">
                    {day}
                  </div>
                  <div className="space-y-space-xs">
                    {jobs.map((j) => (
                      <div
                        key={j.id}
                        className="flex flex-col sm:flex-row sm:items-center gap-space-sm p-space-md rounded-xl bg-surface-container-low"
                      >
                        <span
                          className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                            j.status === "failed"
                              ? "bg-error-container text-error"
                              : j.status === "success"
                                ? "bg-primary-fixed/40 text-primary"
                                : "bg-surface-container text-on-surface-variant"
                          }`}
                        >
                          <Icon
                            name={JOB_ICON[j.status]}
                            className={`text-[18px] ${j.status === "in_progress" ? "animate-spin" : ""}`}
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-space-xs">
                            <span className="font-semibold truncate">{j.institution_name}</span>
                            <JobChip status={j.status} />
                          </div>
                          <div className="text-caption text-on-surface-variant">
                            Started {relativeTime(j.started_at)}
                            {j.finished_at && <> · finished {relativeTime(j.finished_at)}</>}
                          </div>
                          {j.error_message && (
                            <div className="text-caption text-error mt-0.5 break-words">
                              {j.error_message}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
