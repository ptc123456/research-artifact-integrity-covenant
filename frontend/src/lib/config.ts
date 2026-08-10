export const STUDIONET_CHAIN_ID = 61_999;
export const STUDIONET_CHAIN_HEX = "0xf22f";
export const STUDIONET_RPC_URL = "https://studio.genlayer.com/api";
export const STUDIONET_EXPLORER_URL = "https://explorer-studio.genlayer.com";

const configuredAddress = (import.meta.env.VITE_GENLAYER_CONTRACT_ADDRESS ?? "").trim();

export const contractAddress = /^0x[0-9a-fA-F]{40}$/.test(configuredAddress)
  ? (configuredAddress as `0x${string}`)
  : null;

export const configurationError = contractAddress
  ? null
  : "Contract not configured. A verified Studionet deployment address is required before live actions are enabled.";
