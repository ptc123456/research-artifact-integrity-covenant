import { discoverWalletProviders } from "./walletProviders";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("wallet provider discovery", () => {
  afterEach(() => { delete window.ethereum; });

  it("lists legacy providers without selecting one", () => {
    const provider = { request: vi.fn(), isMetaMask: true };
    window.ethereum = provider;
    const changes: string[][] = [];
    const cleanup = discoverWalletProviders((items) => changes.push(items.map((item) => item.info.name)));
    expect(changes.at(-1)).toEqual(["MetaMask"]);
    expect(provider.request).not.toHaveBeenCalled();
    cleanup();
  });

  it("deduplicates the same provider announced twice", () => {
    const provider = { request: vi.fn() };
    const changes: number[] = [];
    const cleanup = discoverWalletProviders((items) => changes.push(items.length));
    const detail = { info: { uuid: "wallet-1", name: "Wallet" }, provider };
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
    expect(changes).toEqual([1]);
    cleanup();
  });
});
