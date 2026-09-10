import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

type ToastKind = "info" | "success" | "error";
interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

const ToastContext = createContext<(t: Omit<Toast, "id">) => void>(() => {});

const ICONS: Record<ToastKind, string> = {
  info: "sync",
  success: "check_circle",
  error: "error",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((cur) => [...cur, { ...t, id }]);
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 4500);
  }, []);

  const dismiss = (id: number) => setToasts((cur) => cur.filter((x) => x.id !== id));

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-space-lg right-space-lg z-50 flex flex-col gap-space-sm max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex items-start gap-space-md p-space-md rounded-2xl bg-inverse-surface text-inverse-on-surface shadow-2xl"
          >
            <span
              className={`material-symbols-outlined text-[20px] shrink-0 ${
                t.kind === "error" ? "text-error-container" : "text-primary-fixed"
              } ${t.kind === "info" ? "animate-spin" : ""}`}
            >
              {ICONS[t.kind]}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-label-md font-semibold">{t.title}</p>
              {t.detail && <p className="text-caption text-outline-variant">{t.detail}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-outline-variant hover:text-inverse-on-surface p-1"
              aria-label="Dismiss"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
