import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { ExecutionResult, TransactionStatus } from "genlayer-js/types";
import type { CalldataEncodable } from "genlayer-js/types";
import type { WalletProviderDetail } from "./walletProviders";
import { contractAddress, STUDIONET_CHAIN_HEX, STUDIONET_EXPLORER_URL, STUDIONET_RPC_URL } from "./config";

export type StringRecord = Record<string, string>;
export type TransactionStage = "signing" | "pending" | "finalized" | "readback" | "success" | "error";

export interface TransactionProgress {
  stage: TransactionStage;
  message: string;
  hash?: `0x${string}`;
}

export interface PendingTransaction {
  hash: `0x${string}`;
  method: string;
  expectedId: string;
  submittedAt: string;
}

const PENDING_KEY = "raic.pending-transaction.v1";
export const readClient = createClient({ chain: studionet });

function requireAddress(): `0x${string}` {
  if (!contractAddress) throw new Error("Contract not configured with a verified Studionet address.");
  return contractAddress;
}

function asStringRecord(value: unknown, label: string): StringRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} returned an invalid shape.`);
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.some(([, item]) => typeof item !== "string")) throw new Error(`${label} returned non-string fields.`);
  return Object.fromEntries(entries) as StringRecord;
}

export async function readProfile(profileId: string): Promise<StringRecord> {
  const value = await readClient.readContract({ address: requireAddress(), functionName: "get_profile", args: [profileId] });
  return asStringRecord(value, "Profile readback");
}

export async function readArtifact(profileId: string, index: number): Promise<StringRecord> {
  const value = await readClient.readContract({ address: requireAddress(), functionName: "get_artifact", args: [profileId, BigInt(index)] });
  return asStringRecord(value, "Artifact readback");
}

export async function readAssessment(profileId: string, epoch: number): Promise<StringRecord> {
  const value = await readClient.readContract({ address: requireAddress(), functionName: "get_assessment", args: [profileId, BigInt(epoch)] });
  return asStringRecord(value, "Assessment readback");
}

export async function readDecision(profileId: string, epoch: number, index: number): Promise<StringRecord> {
  const value = await readClient.readContract({ address: requireAddress(), functionName: "get_artifact_decision", args: [profileId, BigInt(epoch), BigInt(index)] });
  return asStringRecord(value, "Decision readback");
}

export async function getProfileCount(): Promise<number> {
  const value = await readClient.readContract({ address: requireAddress(), functionName: "get_profile_count", args: [] });
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Profile count readback was invalid.");
  return count;
}

export function loadPendingTransaction(): PendingTransaction | null {
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PendingTransaction;
    return /^0x[0-9a-fA-F]{64}$/.test(value.hash) && value.method && value.submittedAt ? value : null;
  } catch {
    return null;
  }
}

export function clearPendingTransaction(): void {
  localStorage.removeItem(PENDING_KEY);
}

export async function connectWallet(detail: WalletProviderDetail): Promise<string> {
  const accounts = await detail.provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(accounts[0])) {
    throw new Error("The selected wallet did not return a valid account.");
  }
  try {
    await detail.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: STUDIONET_CHAIN_HEX }] });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? Number((error as { code: unknown }).code) : 0;
    if (code !== 4902) throw error;
    await detail.provider.request({ method: "wallet_addEthereumChain", params: [{
      chainId: STUDIONET_CHAIN_HEX,
      chainName: "GenLayer Studionet",
      nativeCurrency: { name: "GenLayer", symbol: "GEN", decimals: 18 },
      rpcUrls: [STUDIONET_RPC_URL],
      blockExplorerUrls: [STUDIONET_EXPLORER_URL],
    }] });
  }
  const chainId = await detail.provider.request({ method: "eth_chainId" });
  if (String(chainId).toLowerCase() !== STUDIONET_CHAIN_HEX) throw new Error("The selected wallet is not connected to GenLayer Studionet.");
  return accounts[0];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitForFinalized(hash: `0x${string}`) {
  const receipt = await readClient.waitForTransactionReceipt({
    hash: hash as `0x${string}` & { length: 66 },
    status: TransactionStatus.FINALIZED,
    interval: 4_000,
    retries: 225,
  });
  assertSuccessfulFinalizedReceipt(receipt);
  return receipt;
}

export function assertSuccessfulFinalizedReceipt(receipt: {
  status?: string | number;
  statusName?: string;
  txExecutionResultName?: string;
  resultName?: string;
}): void {
  if (receipt.statusName !== TransactionStatus.FINALIZED && receipt.status !== TransactionStatus.FINALIZED && receipt.status !== 7) {
    throw new Error(`Transaction ended with status ${receipt.statusName ?? receipt.status ?? "UNKNOWN"}.`);
  }
  if (receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN) {
    throw new Error(`Leader execution did not succeed (${receipt.txExecutionResultName ?? "UNKNOWN"}).`);
  }
  if (receipt.resultName && !["AGREE", "MAJORITY_AGREE"].includes(receipt.resultName)) {
    throw new Error(`Validator consensus did not agree (${receipt.resultName}).`);
  }
}

export async function reconcilePending(
  verifyReadback: (pending: PendingTransaction) => Promise<void>,
  report: (progress: TransactionProgress) => void,
): Promise<boolean> {
  const pending = loadPendingTransaction();
  if (!pending) return false;
  try {
    report({ stage: "pending", message: "Reconciling the existing transaction before any retry.", hash: pending.hash });
    await waitForFinalized(pending.hash);
    report({ stage: "readback", message: "Execution succeeded. Verifying contract state.", hash: pending.hash });
    await verifyReadback(pending);
    clearPendingTransaction();
    report({ stage: "success", message: "Recovered transaction verified by authoritative readback.", hash: pending.hash });
    return true;
  } catch (error) {
    report({ stage: "error", message: errorMessage(error), hash: pending.hash });
    throw error;
  }
}

export async function submitWrite(
  wallet: WalletProviderDetail,
  account: string,
  method: string,
  args: CalldataEncodable[],
  expectedId: string,
  verifyReadback: () => Promise<void>,
  report: (progress: TransactionProgress) => void,
): Promise<`0x${string}`> {
  if (loadPendingTransaction()) throw new Error("An earlier transaction is unresolved. Reconcile it before submitting another write.");
  report({ stage: "signing", message: `Confirm ${method} in ${wallet.info.name}.` });
  const client = createClient({
    chain: studionet,
    account: account as `0x${string}`,
    provider: wallet.provider as NonNullable<NonNullable<Parameters<typeof createClient>[0]>["provider"]>,
  });
  const hash = await client.writeContract({ address: requireAddress(), functionName: method, args, value: 0n });
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Wallet returned an invalid transaction hash.");
  const pending: PendingTransaction = { hash, method, expectedId, submittedAt: new Date().toISOString() };
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  report({ stage: "pending", message: "Submitted. Waiting for Studionet finality.", hash });
  try {
    await waitForFinalized(hash);
    report({ stage: "finalized", message: "FINALIZED with successful leader execution.", hash });
    report({ stage: "readback", message: "Verifying the resulting contract state.", hash });
    await verifyReadback();
    clearPendingTransaction();
    report({ stage: "success", message: "Contract readback matches the requested action.", hash });
    return hash;
  } catch (error) {
    report({ stage: "error", message: errorMessage(error), hash });
    throw error;
  }
}
