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
  expectedFields?: StringRecord;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function successfulLeaderReturn(receipt: unknown): Record<string, unknown> | null {
  const root = asRecord(receipt);
  const data = asRecord(root?.data);
  const consensus = asRecord(root?.consensus_data) ?? asRecord(data?.consensus_data);
  const leaders = consensus?.leader_receipt;
  if (!Array.isArray(leaders)) return null;
  for (let index = leaders.length - 1; index >= 0; index -= 1) {
    const leader = asRecord(leaders[index]);
    const result = asRecord(leader?.result);
    if (leader?.execution_result === "SUCCESS" && result?.status === "return") return leader;
  }
  return null;
}

export function transactionReturnValue(receipt: unknown): unknown {
  const leader = successfulLeaderReturn(receipt);
  if (!leader) throw new Error("Transaction return evidence was missing.");
  const result = asRecord(leader.result);
  const payload = asRecord(result?.payload);
  if (result?.status !== "return" || typeof payload?.readable !== "string") {
    throw new Error("Transaction return evidence was malformed.");
  }
  try {
    return JSON.parse(payload.readable);
  } catch {
    return payload.readable;
  }
}

export function returnedProfileId(receipt: unknown): string {
  const value = transactionReturnValue(receipt);
  if (typeof value !== "string" || !/^profile-[0-9]{6}$/.test(value)) throw new Error("create_profile returned an invalid profile ID.");
  return value;
}

export function returnedArtifactIndex(receipt: unknown): number {
  const value = transactionReturnValue(receipt);
  const index = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(index) || index < 0) throw new Error("add_artifact returned an invalid artifact index.");
  return index;
}

export function assertReadbackFields(actual: StringRecord, expected: StringRecord): void {
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`Contract readback mismatch for ${key}.`);
  }
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

export function loadPendingTransaction(): PendingTransaction | null {
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as PendingTransaction;
    const fields = value.expectedFields;
    const validFields = fields === undefined || (
      fields !== null && typeof fields === "object" && !Array.isArray(fields)
      && Object.values(fields).every((item) => typeof item === "string")
    );
    return /^0x[0-9a-fA-F]{64}$/.test(value.hash) && value.method && value.submittedAt && validFields ? value : null;
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
  status_name?: string;
  txExecutionResultName?: string;
  resultName?: string;
  result_name?: string;
  consensus_data?: unknown;
  data?: unknown;
}): void {
  const statusName = receipt.statusName ?? receipt.status_name;
  if (statusName !== TransactionStatus.FINALIZED && receipt.status !== TransactionStatus.FINALIZED && receipt.status !== 7) {
    throw new Error(`Transaction ended with status ${statusName ?? receipt.status ?? "UNKNOWN"}.`);
  }
  if (receipt.txExecutionResultName !== ExecutionResult.FINISHED_WITH_RETURN && !successfulLeaderReturn(receipt)) {
    throw new Error(`Leader execution did not succeed (${receipt.txExecutionResultName ?? "UNKNOWN"}).`);
  }
  const resultName = receipt.resultName ?? receipt.result_name;
  if (!resultName || !["AGREE", "MAJORITY_AGREE"].includes(resultName)) {
    throw new Error(`Validator consensus did not explicitly agree (${resultName ?? "MISSING"}).`);
  }
}

export async function reconcilePending(
  verifyReadback: (pending: PendingTransaction, receipt: unknown) => Promise<void>,
  report: (progress: TransactionProgress) => void,
): Promise<boolean> {
  const pending = loadPendingTransaction();
  if (!pending) return false;
  try {
    report({ stage: "pending", message: "Reconciling the existing transaction before any retry.", hash: pending.hash });
    const receipt = await waitForFinalized(pending.hash);
    report({ stage: "readback", message: "Execution succeeded. Verifying contract state.", hash: pending.hash });
    await verifyReadback(pending, receipt);
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
  expectedFields: StringRecord | undefined,
  verifyReadback: (receipt: unknown) => Promise<void>,
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
  const pending: PendingTransaction = { hash, method, expectedId, expectedFields, submittedAt: new Date().toISOString() };
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  report({ stage: "pending", message: "Submitted. Waiting for Studionet finality.", hash });
  try {
    const receipt = await waitForFinalized(hash);
    report({ stage: "finalized", message: "FINALIZED with successful leader execution.", hash });
    report({ stage: "readback", message: "Verifying the resulting contract state.", hash });
    await verifyReadback(receipt);
    clearPendingTransaction();
    report({ stage: "success", message: "Contract readback matches the requested action.", hash });
    return hash;
  } catch (error) {
    report({ stage: "error", message: errorMessage(error), hash });
    throw error;
  }
}
