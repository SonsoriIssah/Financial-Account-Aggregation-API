import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import type { AccountStatus, SyncJobStatus } from "../lib/types";

export function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
}

export function Spinner({ className = "text-[20px]" }: { className?: string }) {
  return <Icon name="progress_activity" className={`animate-spin ${className}`} />;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "surface" | "ghost" | "danger";
  loading?: boolean;
  icon?: string;
};

export function Button({
  variant = "primary",
  loading,
  icon,
  children,
  className = "",
  disabled,
  ...rest
}: BtnProps) {
  const styles: Record<string, string> = {
    primary: "bg-primary-container text-on-primary hover:bg-primary shadow-sm",
    surface: "bg-surface-container-low text-on-surface hover:bg-surface-container",
    ghost: "text-on-surface-variant hover:text-on-surface hover:bg-surface-container",
    danger: "bg-error text-on-error hover:bg-error/90 shadow-sm",
  };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-space-xs h-11 px-space-lg rounded-xl text-label-md font-semibold transition-colors active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none ${styles[variant]} ${className}`}
    >
      {loading ? <Spinner className="text-[18px]" /> : icon && <Icon name={icon} className="text-[18px]" />}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <label className="flex flex-col gap-space-2xs">
      <span className="text-label-sm font-semibold text-on-surface">{label}</span>
      <input
        {...rest}
        className="h-12 rounded-xl bg-surface-container-low px-space-md text-body-md text-on-surface placeholder:text-outline focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary transition-all"
      />
      {error ? (
        <span className="text-caption text-error">{error}</span>
      ) : (
        hint && <span className="text-caption text-on-surface-variant">{hint}</span>
      )}
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-surface-container-lowest shadow-sm ${className}`}>{children}</div>
  );
}

const ACCOUNT_STATUS: Record<AccountStatus, { label: string; cls: string; dot: string }> = {
  active: { label: "Active", cls: "bg-primary-fixed/30 text-on-primary-fixed", dot: "bg-primary" },
  needs_reauth: {
    label: "Needs re-auth",
    cls: "bg-secondary-container text-on-secondary-fixed",
    dot: "bg-secondary",
  },
  error: { label: "Sync error", cls: "bg-error-container text-on-error-container", dot: "bg-error" },
  disabled: { label: "Disabled", cls: "bg-surface-container text-on-surface-variant", dot: "bg-outline" },
};

export function StatusPill({ status }: { status: AccountStatus }) {
  const s = ACCOUNT_STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label-sm ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "active" ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  );
}

const JOB_STATUS: Record<SyncJobStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-surface-container text-on-surface-variant" },
  in_progress: { label: "In progress", cls: "bg-secondary-container text-on-secondary-fixed" },
  success: { label: "Success", cls: "bg-primary-fixed/30 text-on-primary-fixed" },
  failed: { label: "Failed", cls: "bg-error-container text-on-error-container" },
};

export function JobChip({ status }: { status: SyncJobStatus }) {
  const s = JOB_STATUS[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-label-sm font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-space-xs p-space-md rounded-xl bg-error-container/40 text-on-error-container text-body-sm">
      <Icon name="error" className="text-[18px] text-error shrink-0" />
      <span>{message}</span>
    </div>
  );
}
