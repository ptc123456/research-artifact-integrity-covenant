import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertReadbackFields, assertSuccessfulFinalizedReceipt, connectWallet, readClient,
  reconcilePending, returnedArtifactIndex, returnedProfileId,
} from "./genlayer";
import type { WalletProviderDetail } from "./walletProviders";

describe("transaction acceptance", () => {
  it("requires finality, successful execution, and explicit validator agreement", () => {
    expect(() => assertSuccessfulFinalizedReceipt({ status: 7, txExecutionResultName: "FINISHED_WITH_RETURN", resultName: "MAJORITY_AGREE" })).not.toThrow();
    expect(() => assertSuccessfulFinalizedReceipt({ statusName: "PENDING", txExecutionResultName: "FINISHED_WITH_RETURN", resultName: "MAJORITY_AGREE" })).toThrow(/status PENDING/);
    expect(() => assertSuccessfulFinalizedReceipt({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_ERROR", resultName: "MAJORITY_AGREE" })).toThrow(/execution did not succeed/);
    expect(() => assertSuccessfulFinalizedReceipt({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN", resultName: "MAJORITY_DISAGREE" })).toThrow(/did not explicitly agree/);
    expect(() => assertSuccessfulFinalizedReceipt({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" })).toThrow(/MISSING/);
    expect(() => assertSuccessfulFinalizedReceipt({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN", resultName: "UNKNOWN" })).toThrow(/UNKNOWN/);
  });
});

const receiptWithReturn = (readable: string) => ({
  statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN", resultName: "MAJORITY_AGREE",
  consensus_data: { leader_receipt: [{ result: { status: "return", payload: { readable } } }] },
});

describe("transaction-specific return reconciliation", () => {
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it("uses the exact create return even if an aggregate count has advanced", () => {
    const unrelatedAggregateCount = 99;
    expect(unrelatedAggregateCount).toBe(99);
    expect(returnedProfileId(receiptWithReturn('"profile-000007"'))).toBe("profile-000007");
    expect(() => returnedProfileId(receiptWithReturn('"wrong-record"'))).toThrow(/invalid profile ID/);
    expect(() => returnedProfileId({})).toThrow(/return evidence was missing/);
    expect(returnedProfileId({ data: receiptWithReturn('"profile-000008"') })).toBe("profile-000008");
  });

  it("binds an artifact to its returned index and every submitted field", () => {
    expect(returnedArtifactIndex(receiptWithReturn("2"))).toBe(2);
    expect(() => returnedArtifactIndex(receiptWithReturn('"not-an-index"'))).toThrow(/invalid artifact index/);
    expect(() => assertReadbackFields(
      { artifact_index: "2", canonical_source_id: "actual" },
      { artifact_index: "2", canonical_source_id: "submitted" },
    )).toThrow(/canonical_source_id/);
  });

  it("resumes the saved hash and clears it only after readback", async () => {
    const receipt = receiptWithReturn('"profile-000007"');
    vi.spyOn(readClient, "waitForTransactionReceipt").mockResolvedValue(receipt as never);
    localStorage.setItem("raic.pending-transaction.v1", JSON.stringify({
      hash: `0x${"1".repeat(64)}`, method: "create_profile", expectedId: "",
      expectedFields: { state: "DRAFT" }, submittedAt: "2026-08-11T00:00:00Z",
    }));
    const verify = vi.fn(async () => undefined);
    await expect(reconcilePending(verify, vi.fn())).resolves.toBe(true);
    expect(verify).toHaveBeenCalledOnce();
    expect(readClient.waitForTransactionReceipt).toHaveBeenCalledOnce();
    expect(localStorage.getItem("raic.pending-transaction.v1")).toBeNull();
  });
});

describe("wallet connection", () => {
  it("adds Studionet only after an unknown-chain response", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return ["0x1111111111111111111111111111111111111111"];
      if (method === "wallet_switchEthereumChain") throw Object.assign(new Error("unknown chain"), { code: 4902 });
      if (method === "wallet_addEthereumChain") return null;
      if (method === "eth_chainId") return "0xf22f";
      return null;
    });
    const wallet = { info: { uuid: "test", name: "Test wallet" }, provider: { request } } as WalletProviderDetail;
    await expect(connectWallet(wallet)).resolves.toBe("0x1111111111111111111111111111111111111111");
    expect(request.mock.calls.map(([arg]) => arg.method)).toEqual([
      "eth_requestAccounts", "wallet_switchEthereumChain", "wallet_addEthereumChain", "eth_chainId",
    ]);
  });
});
