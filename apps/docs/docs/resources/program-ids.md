---
sidebar_position: 1
title: Program IDs
---

# Program IDs

All Zurpay smart contracts and related programs on Solana Devnet.

## Zurpay Contracts

| Program            | Address                                        | Description              |
| ------------------ | ---------------------------------------------- | ------------------------ |
| **Zurpay Payroll** | `Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9` | Main payroll program     |
| **ZK Verifier**    | `4MZoLmEsXE1hx62GeSRABGzSGEv7isjck8h4rsnidFkU` | Sunspot Groth16 verifier |

## Inco Lightning

| Program                | Address                                        | Description                  |
| ---------------------- | ---------------------------------------------- | ---------------------------- |
| **Inco Token Program** | `4cyJHzecVWuU2xux6bCAPAhALKQT8woBh4Vx3AGEGe5N` | Confidential token transfers |
| **Inco Program**       | `5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj` | Inco core program            |

## Tokens

| Token         | Mint Address                                   | Decimals |
| ------------- | ---------------------------------------------- | -------- |
| **Inco USDC** | `FGSe7zNdqqthJrJLmZ2dDTmJjLKdVrXJVAGxMuVoPqhC` | 6        |

:::warning Devnet Only
These addresses are for **Solana Devnet**. Do not use on mainnet.
:::

## Verifying Deployment

Check program deployment status:

```bash
# Zurpay Program
solana program show Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9 --url devnet

# Check account
solana account Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9 --url devnet
```

## Explorer Links

- [Zurpay Program](https://explorer.solana.com/address/Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9?cluster=devnet)
- [Inco Token Program](https://explorer.solana.com/address/4cyJHzecVWuU2xux6bCAPAhALKQT8woBh4Vx3AGEGe5N?cluster=devnet)
- [Inco USDC Mint](https://explorer.solana.com/address/FGSe7zNdqqthJrJLmZ2dDTmJjLKdVrXJVAGxMuVoPqhC?cluster=devnet)

## RPC Endpoints

| Provider      | URL                                               | Notes        |
| ------------- | ------------------------------------------------- | ------------ |
| Solana Public | `https://api.devnet.solana.com`                   | Rate limited |
| Helius        | `https://devnet.helius-rpc.com/?api-key=YOUR_KEY` | Recommended  |

:::tip Helius RPC
For better reliability and rate limits, use a [Helius](https://dev.helius.xyz) API key. Free tier available.
:::

## Environment Variables

```bash
# Apps (.env.local)
NEXT_PUBLIC_ZURPAY_PROGRAM_ID=Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9
NEXT_PUBLIC_ZK_VERIFIER_PROGRAM_ID=4MZoLmEsXE1hx62GeSRABGzSGEv7isjck8h4rsnidFkU
NEXT_PUBLIC_INCO_PROGRAM_ID=5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj
NEXT_PUBLIC_INCO_TOKEN_PROGRAM_ID=4cyJHzecVWuU2xux6bCAPAhALKQT8woBh4Vx3AGEGe5N
NEXT_PUBLIC_USDC_MINT=FGSe7zNdqqthJrJLmZ2dDTmJjLKdVrXJVAGxMuVoPqhC
```
