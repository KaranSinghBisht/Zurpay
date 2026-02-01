---
sidebar_position: 2
title: Create Payrun
---

# Create Payrun

A payrun is a batch payment to multiple employees. This guide covers creating and executing a confidential payrun.

## Step 1: Prepare CSV

Create a CSV file with worker emails and amounts:

```csv
email,amount
alice@company.com,5000000000
bob@company.com,3500000000
carol@company.com,4200000000
```

:::info Amount Format
Amounts are in **lamports** (1 USDC = 1,000,000 lamports for 6 decimals).

Example: `5000000000` = 5,000 USDC
:::

## Step 2: Create Payrun

1. Go to **Dashboard → Payruns**
2. Click **"New Payrun"**
3. Upload your CSV file
4. Review the parsed data

The system shows:

- Total amount
- Worker count
- Individual breakdowns

## Step 3: Validate

Click **"Validate"** to generate the cryptographic commitments:

This step:

- Generates Merkle tree from claims
- Creates ZK proof for each employee
- Encrypts amounts using Inco
- Stores claim packages server-side

:::tip Processing Time
Proof generation takes 10-30 seconds depending on worker count.
:::

## Step 4: Post On-Chain

Click **"Post On-Chain"** to commit the payrun to Solana:

```
Transaction contents:
- Merkle root (32 bytes)
- Organization ID
- Payrun metadata
```

Sign the transaction in your wallet.

:::warning Insufficient Funds?
Ensure your treasury has enough Inco USDC to cover all claims. The transaction will fail if underfunded.
:::

## Step 5: Open Claims

Click **"Open Claims"** to enable employees to claim their payments.

This:

- Flips the `claims_opened` flag on-chain
- Generates tokenized claim links
- Sends claim emails to workers (if configured)

## Step 6: Distribute Links

Each employee receives a unique claim link:

```
https://employee.zurpay.xyz/claims/{payrunId}?token={uniqueToken}
```

Options for distribution:

- **Automatic emails** — System sends via configured email provider
- **Manual copy** — Copy links from dashboard and share directly
- **Slack/Discord** — Integrate with your team communication

## Monitoring Claims

Track claim status from the payrun detail page:

| Status      | Meaning                          |
| ----------- | -------------------------------- |
| **Pending** | Employee hasn't claimed yet      |
| **Claimed** | Successfully claimed             |
| **Expired** | Token expired (configurable TTL) |

## Troubleshooting

### "Merkle root already exists"

You're trying to post a duplicate payrun. Each payrun needs unique data.

### "Insufficient treasury balance"

Fund your treasury before posting. Claims will fail if treasury can't cover payouts.

### "Proof generation failed"

Check that all emails are valid and amounts are positive integers.

### Employee can't claim

1. Verify they're using the correct link
2. Check token hasn't expired
3. Ensure claims are opened
4. Confirm their wallet is connected

## Next Steps

- [Employee Claims](/user-guide/employee-claims) — How employees claim payments
