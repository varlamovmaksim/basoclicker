"use client";

/** Minimal ABI for TapperVault (recordDaily, donate). */
export const TAPPER_VAULT_ABI = [
  {
    name: "recordDaily",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "donate",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256", internalType: "uint256" }],
    outputs: [],
  },
] as const;

/** Minimal ABI for ERC20 (approve, balanceOf). */
export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
    ],
    outputs: [{ type: "bool", internalType: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address", internalType: "address" }],
    outputs: [{ type: "uint256", internalType: "uint256" }],
  },
] as const;

export function getVaultAddress(): `0x${string}` | null {
  const a = process.env.NEXT_PUBLIC_TAPPER_VAULT_ADDRESS;
  if (!a || !a.startsWith("0x")) return null;
  return a as `0x${string}`;
}

export function getTokenAddress(): `0x${string}` | null {
  const a = process.env.NEXT_PUBLIC_TAPPER_TOKEN_ADDRESS;
  if (!a || !a.startsWith("0x")) return null;
  return a as `0x${string}`;
}

/** USDT/USDC on Base use 6 decimals. */
export const TOKEN_DECIMALS = 6;
