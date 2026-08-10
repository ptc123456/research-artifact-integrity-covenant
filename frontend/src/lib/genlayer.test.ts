import { describe, expect, it, vi } from "vitest";
import { assertSuccessfulFinalizedReceipt, connectWallet } from "./genlayer";
import type { WalletProviderDetail } from "./walletProviders";

describe("transaction acceptance", () => {
  it("requires finality, successful execution, and validator agreement", () => {
    expect(() => assertSuccessfulFinalizedReceipt({ status: 7, txExecutionResultName: "FINISHED_WITH_RETURN", resultName: "MAJORITY_AGREE" })).not.toThrow();
    expect(() => assertSuccessfulFinalizedReceipt({ statusName: "PENDING", txExecutionResultName: "FINISHED_WITH_RETURN" })).toThrow(/status PENDING/);
    expect(() => assertSuccessfulFinalizedReceipt({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_ERROR" })).toThrow(/execution did not succeed/);
    expect(() => assertSuccessfulFinalizedReceipt({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN", resultName: "MAJORITY_DISAGREE" })).toThrow(/did not agree/);
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
