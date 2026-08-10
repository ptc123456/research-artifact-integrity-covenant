export interface Eip1193Provider {
  request(args: { method: string; params?: readonly unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface WalletProviderInfo {
  uuid: string;
  name: string;
  icon?: string;
  rdns?: string;
}

export interface WalletProviderDetail {
  info: WalletProviderInfo;
  provider: Eip1193Provider;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
  }
}

function legacyName(provider: Eip1193Provider, index: number): string {
  const flags = provider as unknown as Record<string, unknown>;
  if (flags.isMetaMask) return "MetaMask";
  if (flags.isCoinbaseWallet) return "Coinbase Wallet";
  if (flags.isRabby) return "Rabby Wallet";
  return index === 0 ? "Browser wallet" : `Browser wallet ${index + 1}`;
}

export function discoverWalletProviders(onChange: (providers: WalletProviderDetail[]) => void): () => void {
  const providers: WalletProviderDetail[] = [];
  const seen = new Set<Eip1193Provider>();

  const publish = (detail: WalletProviderDetail) => {
    if (seen.has(detail.provider)) return;
    seen.add(detail.provider);
    providers.push(detail);
    onChange([...providers]);
  };

  const announce = (event: Event) => {
    const detail = (event as CustomEvent<WalletProviderDetail>).detail;
    if (detail?.provider && detail?.info?.uuid && detail?.info?.name) publish(detail);
  };

  window.addEventListener("eip6963:announceProvider", announce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  const legacy = window.ethereum?.providers ?? (window.ethereum ? [window.ethereum] : []);
  legacy.forEach((provider, index) => publish({
    info: { uuid: `legacy-${index}`, name: legacyName(provider, index) },
    provider,
  }));

  return () => window.removeEventListener("eip6963:announceProvider", announce);
}
