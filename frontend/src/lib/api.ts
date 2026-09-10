import type {
  Account,
  AppConfig,
  AuthTokens,
  Balance,
  LinkCallbackResult,
  LinkCallbackPayload,
  LinkStart,
  SyncQueued,
  SyncStatus,
  TransactionPage,
  User,
} from "./types";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

const ACCESS_KEY = "kv.access";
const REFRESH_KEY = "kv.refresh";

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set({ access_token, refresh_token }: { access_token: string; refresh_token?: string }) {
    localStorage.setItem(ACCESS_KEY, access_token);
    if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

async function parseError(res: Response): Promise<never> {
  let detail = res.statusText;
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") detail = body.detail;
    else if (Array.isArray(body?.detail)) detail = body.detail.map((d: { msg: string }) => d.msg).join(", ");
  } catch {
    /* non-JSON body */
  }
  throw new ApiError(res.status, detail);
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refresh_token = tokenStore.refresh;
  if (!refresh_token) return false;
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { access_token: string };
      tokenStore.set({ access_token: data.access_token });
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

type Options = { method?: string; body?: unknown; auth?: boolean; retry?: boolean };

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const { method = "GET", body, auth = true, retry = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && tokenStore.access) headers["Authorization"] = `Bearer ${tokenStore.access}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && auth && retry && (await tryRefresh())) {
    return request<T>(path, { ...opts, retry: false });
  }
  if (!res.ok) return parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  config: () => request<AppConfig>("/config", { auth: false }),

  // auth
  register: (email: string, password: string) =>
    request<User>("/auth/register", { method: "POST", body: { email, password }, auth: false }),
  login: (email: string, password: string) =>
    request<AuthTokens>("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  me: () => request<User>("/auth/me"),

  // accounts
  listAccounts: () => request<Account[]>("/accounts"),
  getBalance: (id: string) => request<Balance>(`/accounts/${id}/balance`),
  getTransactions: (id: string, params: URLSearchParams) =>
    request<TransactionPage>(`/accounts/${id}/transactions?${params.toString()}`),
  syncAccount: (id: string) => request<SyncQueued>(`/accounts/${id}/sync`, { method: "POST" }),
  syncStatus: (id: string) => request<SyncStatus>(`/accounts/${id}/sync-status`),
  unlinkAccount: (id: string) => request<void>(`/accounts/${id}`, { method: "DELETE" }),

  // linking
  startLink: (institution_name?: string) =>
    request<LinkStart>("/accounts/link", { method: "POST", body: { institution_name } }),
  completeLink: (payload: LinkCallbackPayload) =>
    request<LinkCallbackResult>("/accounts/link/callback", { method: "POST", body: payload }),
};
