export type AccountStatus = "active" | "needs_reauth" | "error" | "disabled";
export type AccountType = "checking" | "savings" | "credit";
export type SyncJobStatus = "queued" | "in_progress" | "success" | "failed";

export interface User {
  id: string;
  email: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

export interface Account {
  id: string;
  linked_account_id: string;
  provider_account_id: string;
  account_type: AccountType;
  account_name: string;
  current_balance: string;
  available_balance: string | null;
  currency: string;
  updated_at: string;
  institution_name: string;
  status: AccountStatus;
  last_synced_at: string | null;
  linked_created_at: string;
}

export interface Balance {
  account_id: string;
  current_balance: string;
  available_balance: string | null;
  currency: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  account_id: string;
  provider_transaction_id: string;
  amount: string;
  currency: string;
  description: string;
  category: string | null;
  posted_at: string;
  created_at: string;
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface SyncJob {
  id: string;
  status: SyncJobStatus;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface SyncStatus {
  linked_account_id: string;
  account_status: AccountStatus;
  last_synced_at: string | null;
  latest_job: SyncJob | null;
}

export interface SyncActivityItem {
  id: string;
  linked_account_id: string;
  institution_name: string;
  status: SyncJobStatus;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface AppConfig {
  provider: "mock" | "plaid";
}

export interface LinkStart {
  link_token: string;
  expires_in: number;
}

export interface LinkCallbackPayload {
  institution_name?: string;
  link_token?: string;
  bank_slug?: string;
  public_token?: string;
}

export interface SyncResult {
  sync_job_id: string;
  linked_account_id: string;
  status: SyncJobStatus;
  transactions_synced: number;
  error_message: string | null;
}

export interface LinkCallbackResult {
  linked_account_id: string;
  institution_name: string;
  status: AccountStatus;
  accounts: Account[];
  sync: SyncResult;
}

export interface SyncQueued {
  linked_account_id: string;
  status: "queued";
  queued: boolean;
}

export const MOCK_BANKS = [
  { slug: "bank-a", name: "Mock Bank A", note: "Standard sandbox bank" },
  { slug: "bank-b", name: "Mock Bank B", note: "Intermittently unavailable" },
  { slug: "bank-c", name: "Mock Bank C", note: "Slow responses" },
] as const;
