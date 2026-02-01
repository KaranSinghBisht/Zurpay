---
sidebar_position: 3
title: Employee Claims
---

# Employee Claims

This guide covers how employees claim their confidential payments.

## Receiving a Claim Link

Employees receive claim links via:

- **Email** from employer's payroll system
- **Direct message** (Slack, Discord, etc.)
- **Employee portal** (if authenticated)

Link format:

```
https://employee.zurpay.xyz/claims/{payrunId}?token={uniqueToken}
```

:::warning Keep Your Link Private
Your claim link is like a password. Anyone with the link can see the claim amount (but only YOU can claim it, since it's bound to your wallet).
:::

## Step 1: Open Claim Link

Click the link to open the Employee Portal claim page.

You'll see:

- Amount to claim
- Organization name
- Expiration status

## Step 2: Connect Wallet

Click **"Connect Wallet"** and select your wallet provider.

Supported wallets:

- Phantom
- Solflare
- Other Solana wallets

:::tip Wallet Binding
The claim is bound to YOUR wallet via a hash in the ZK proof. Only you can claim, regardless of who has the link.
:::

## Step 3: Initialize Confidential Account

If this is your first time receiving confidential tokens, you'll see:

**"Initialize Confidential Account"**

Click this to create your Inco token account. This:

- Creates an encrypted balance account
- Enables receiving confidential transfers
- Costs ~0.01 SOL in fees

:::info One-Time Setup
You only need to do this once per wallet. Future claims skip this step.
:::

## Step 4: Claim Payment

Click **"Claim"** to submit your claim transaction.

The transaction:

1. Submits your pre-generated ZK proof
2. Verifies proof on-chain
3. Records nullifier (prevents double-claim)
4. Executes Inco confidential transfer

### What Happens On-Chain

```
1. Sunspot verifier checks ZK proof ✓
2. Zurpay program checks nullifier not used ✓
3. Nullifier PDA created (prevents replay) ✓
4. Inco transfer executes (encrypted amount) ✓
```

## Step 5: Confirmation

After successful claim:

- **Success message** with transaction link
- **Balance updated** in your confidential account
- **Claim status** changes to "Claimed"

Click the transaction link to view on Solana Explorer.

:::tip Amount Not Visible on Explorer
This is intentional! The amount is encrypted. Only you can see your actual balance via the Inco SDK or compatible wallets.
:::

## Viewing Your Balance

Your confidential balance is encrypted on-chain. To view it:

### Option A: Employee Portal

Go to **My Balance** in the Employee Portal (requires wallet connection).

### Option B: Inco SDK

```typescript
const balance = await incoClient.getDecryptedBalance(wallet.publicKey, USDC_MINT);
```

## Troubleshooting

### "Invalid token"

- Link may have expired
- Link may have been used already
- Contact your employer for a new link

### "Wallet mismatch"

The connected wallet doesn't match the one in the ZK proof. Connect the correct wallet.

### "Already claimed"

Each claim can only be executed once. Check your transaction history.

### "Confidential account not found"

Click "Initialize Confidential Account" first.

### "Proof verification failed"

The ZK proof is invalid. This shouldn't happen with legitimate claims. Contact support.

## Security Notes

### What's Protected

| Data                     | Protection                       |
| ------------------------ | -------------------------------- |
| Your salary amount       | Encrypted (Inco FHE)             |
| Your identity in payroll | Hidden (ZK proof)                |
| Your wallet balance      | Encrypted (only you can decrypt) |

### What's Visible

| Data                     | Visibility                     |
| ------------------------ | ------------------------------ |
| That a claim happened    | Public (transaction on-chain)  |
| Nullifier (random bytes) | Public (prevents double-claim) |
| Your wallet address      | Public (you signed the tx)     |

## Next Steps

- [Payment Requests](/user-guide/payment-requests) — Create and receive P2P payments
