import { api } from "./api";
import type { Account } from "./types";

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Pull every transaction for every account and download one CSV. */
export async function exportTransactionsCsv(accounts: Account[]): Promise<number> {
  const header = [
    "institution",
    "account",
    "posted_at",
    "description",
    "category",
    "amount",
    "currency",
    "provider_transaction_id",
  ];
  const lines = [header.join(",")];

  for (const acc of accounts) {
    let offset = 0;
    for (;;) {
      const params = new URLSearchParams({ limit: "200", offset: String(offset) });
      const page = await api.getTransactions(acc.id, params);
      for (const t of page.items) {
        lines.push(
          [
            acc.institution_name,
            acc.account_name,
            t.posted_at,
            t.description,
            t.category ?? "",
            t.amount,
            t.currency,
            t.provider_transaction_id,
          ]
            .map(csvCell)
            .join(","),
        );
      }
      offset += 200;
      if (offset >= page.total) break;
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kudivault-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  return lines.length - 1;
}
