import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertReadbackFields, assertSuccessfulFinalizedReceipt, cancelRpcActivity, connectWallet, readActiveProfile, readClient,
  invalidateReadCache, readProfile, reconcilePending, resetRpcStateForTests, returnedArtifactIndex, returnedProfileId, rpcMetrics,
} from "./genlayer";
import type { WalletProviderDetail } from "./walletProviders";

vi.mock("./config", () => ({
  contractAddress: "0xD0bB9C0D436092d7bBB03F2458C60473739923EC",
  STUDIONET_CHAIN_HEX: "0xf22f",
  STUDIONET_RPC_URL: "https://studio.genlayer.com/api",
  STUDIONET_EXPLORER_URL: "https://explorer-studio.genlayer.com",
}));

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
  consensus_data: { leader_receipt: [{ execution_result: "SUCCESS", result: { status: "return", payload: { readable } } }] },
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

  it("uses the successful leader when Studionet appends an idle error receipt", () => {
    const receipt = {
      status: 7,
      status_name: "FINALIZED",
      result_name: "MAJORITY_AGREE",
      consensus_data: { leader_receipt: [
        { execution_result: "SUCCESS", result: { status: "return", payload: { readable: '"profile-000002"' } } },
        { execution_result: "ERROR", vote: "idle", result: { status: "contract_error", payload: "idle" } },
      ] },
    };
    expect(() => assertSuccessfulFinalizedReceipt(receipt)).not.toThrow();
    expect(returnedProfileId(receipt)).toBe("profile-000002");
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

  it("reconciles activate_profile and handles failures cleanly", async () => {
    const receipt = receiptWithReturn('""');
    vi.spyOn(readClient, "waitForTransactionReceipt").mockResolvedValue(receipt as never);
    localStorage.setItem("raic.pending-transaction.v1", JSON.stringify({
      hash: `0x${"2".repeat(64)}`, method: "activate_profile", expectedId: "profile-000002",
      submittedAt: "2026-08-11T00:00:00Z",
    }));
    const verifySuccess = vi.fn(async () => undefined);
    await expect(reconcilePending(verifySuccess, vi.fn())).resolves.toBe(true);
    expect(verifySuccess).toHaveBeenCalledOnce();

    localStorage.setItem("raic.pending-transaction.v1", JSON.stringify({
      hash: `0x${"3".repeat(64)}`, method: "activate_profile", expectedId: "profile-000003",
      submittedAt: "2026-08-11T00:00:00Z",
    }));
    const verifyFailure = vi.fn(async () => {
      throw new Error("Predecessor profile was not superseded.");
    });
    await expect(reconcilePending(verifyFailure, vi.fn())).rejects.toThrow(/Predecessor profile was not superseded/);

    localStorage.setItem("raic.pending-transaction.v1", JSON.stringify({
      hash: `0x${"4".repeat(64)}`, method: "activate_profile", expectedId: "profile-000004",
      submittedAt: "2026-08-11T00:00:00Z",
    }));
    const verifyEmptyActiveId = vi.fn(async () => {
      const activeId: string = "";
      if (activeId !== "profile-000004") {
        throw new Error("Recovered active profile for DOI did not resolve to the activated profile.");
      }
    });
    await expect(reconcilePending(verifyEmptyActiveId, vi.fn())).rejects.toThrow(/Recovered active profile for DOI did not resolve/);

    localStorage.setItem("raic.pending-transaction.v1", JSON.stringify({
      hash: `0x${"5".repeat(64)}`, method: "activate_profile", expectedId: "profile-000005",
      submittedAt: "2026-08-11T00:00:00Z",
    }));
    const verifyMismatchActiveId = vi.fn(async () => {
      const activeId: string = "profile-000001";
      if (activeId !== "profile-000005") {
        throw new Error("Recovered active profile for DOI did not resolve to the activated profile.");
      }
    });
    await expect(reconcilePending(verifyMismatchActiveId, vi.fn())).rejects.toThrow(/Recovered active profile for DOI did not resolve/);
  });
});

describe("contract queries and active profile resolution", () => {
  afterEach(() => { vi.restoreAllMocks(); resetRpcStateForTests(); });

  it("reads active profile for DOI when valid", async () => {
    vi.spyOn(readClient, "readContract").mockResolvedValue("profile-000002" as never);
    await expect(readActiveProfile("10.1234/test")).resolves.toBe("profile-000002");
    expect(readClient.readContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "get_active_profile",
      args: ["10.1234/test"],
    }));
  });

  it("returns empty string when no active profile exists", async () => {
    vi.spyOn(readClient, "readContract").mockResolvedValue("" as never);
    await expect(readActiveProfile("10.1234/empty")).resolves.toBe("");
  });

  it("fails closed when get_active_profile returns malformed or non-string response", async () => {
    vi.spyOn(readClient, "readContract").mockResolvedValue("not-a-valid-profile-id" as never);
    await expect(readActiveProfile("10.1234/test")).rejects.toThrow(/invalid profile ID/);

    vi.spyOn(readClient, "readContract").mockResolvedValue(null as never);
    await expect(readActiveProfile("10.1234/test")).rejects.toThrow(/invalid profile ID/);

    vi.spyOn(readClient, "readContract").mockResolvedValue(12345 as never);
    await expect(readActiveProfile("10.1234/test")).rejects.toThrow(/invalid profile ID/);

    vi.spyOn(readClient, "readContract").mockResolvedValue({ id: "profile-000001" } as never);
    await expect(readActiveProfile("10.1234/test")).rejects.toThrow(/invalid profile ID/);
  });
});

describe("Studionet RPC budget", () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); resetRpcStateForTests(); });

  it("deduplicates in-flight reads and serves a bounded cache hit", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise<unknown>((done) => { resolve = done; });
    const spy = vi.spyOn(readClient, "readContract").mockReturnValue(pending as never);
    const first = readProfile("profile-000006");
    const second = readProfile("profile-000006");
    resolve({ profile_id: "profile-000006" });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    await readProfile("profile-000006");
    expect(spy).toHaveBeenCalledOnce();
    expect(rpcMetrics.reads).toBe(1);
  });

  it("invalidates safe cached reads before authoritative reconciliation", async () => {
    const spy = vi.spyOn(readClient, "readContract").mockResolvedValue({ profile_id: "profile-000006" } as never);
    await readProfile("profile-000006");
    await readProfile("profile-000006");
    invalidateReadCache();
    await readProfile("profile-000006");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("retries rate limits with a bounded budget", async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(readClient, "readContract")
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockRejectedValueOnce(new Error("Server busy"))
      .mockResolvedValue({ profile_id: "profile-000006" } as never);
    const result = readProfile("profile-000006");
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ profile_id: "profile-000006" });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(rpcMetrics.retries).toBe(2);
  });

  it("cancels bounded retry without issuing another read", async () => {
    vi.useFakeTimers();
    vi.spyOn(readClient, "readContract").mockRejectedValue(new Error("429 rate limit"));
    const controller = new AbortController();
    const result = readProfile("profile-000006", controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(result).rejects.toThrow(/cancelled/);
    expect(rpcMetrics.reads).toBe(1);
  });

  it("pauses finality polling while hidden and cancels on teardown", async () => {
    let visibility = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility as DocumentVisibilityState);
    const wait = vi.spyOn(readClient, "waitForTransactionReceipt").mockResolvedValue(receiptWithReturn('"profile-000006"') as never);
    localStorage.setItem("raic.pending-transaction.v1", JSON.stringify({
      hash: `0x${"6".repeat(64)}`, method: "create_profile", expectedId: "", submittedAt: "2026-08-11T00:00:00Z",
    }));
    const paused = reconcilePending(vi.fn(async () => undefined), vi.fn());
    await Promise.resolve();
    expect(wait).not.toHaveBeenCalled();
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await expect(paused).resolves.toBe(true);
    expect(wait).toHaveBeenCalledOnce();

    visibility = "hidden";
    localStorage.setItem("raic.pending-transaction.v1", JSON.stringify({
      hash: `0x${"7".repeat(64)}`, method: "create_profile", expectedId: "", submittedAt: "2026-08-11T00:00:00Z",
    }));
    const cancelled = reconcilePending(vi.fn(async () => undefined), vi.fn());
    await Promise.resolve();
    cancelRpcActivity();
    await expect(cancelled).rejects.toThrow(/cancelled/);
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
