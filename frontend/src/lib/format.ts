const money = new Intl.NumberFormat("en-GH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "42850.00" -> "42,850.00" */
export function formatAmount(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return money.format(n);
}

export function currencySymbol(code: string): string {
  return code === "GHS" ? "₵" : code;
}

export function formatMoney(value: string | number, currency = "GHS"): string {
  return `${currencySymbol(currency)}${formatAmount(value)}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 45) return "just now";
  for (const [unit, secs] of UNITS) {
    if (Math.abs(seconds) >= secs || unit === "second") {
      return rtf.format(-Math.round(seconds / secs), unit);
    }
  }
  return "just now";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
