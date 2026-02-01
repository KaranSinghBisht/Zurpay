---
sidebar_position: 4
title: Payment Requests
---

# Payment Requests

Payment requests enable peer-to-peer confidential payments outside of scheduled payroll.

## Use Cases

- **Contractor invoices** — One-time payments to contractors
- **Reimbursements** — Expense repayments
- **Bonuses** — Ad-hoc employee bonuses
- **Invoicing** — Bill clients confidentially

## Creating a Payment Request

### Step 1: Go to Request Page

Open the Employee Portal and navigate to **Request Payment**.

### Step 2: Connect Wallet

Connect your wallet — this will be the recipient address.

### Step 3: Enter Details

| Field               | Description            |
| ------------------- | ---------------------- |
| **Amount**          | Payment amount in USDC |
| **Memo** (optional) | Note for the payer     |

### Step 4: Create Request

Click **"Create Request"** and sign the message.

This:

- Creates a request record
- Generates a shareable pay link
- Does NOT post anything on-chain yet

### Step 5: Share Link

Copy the pay link and send to your payer:

```
https://employee.zurpay.xyz/pay/{requestId}
```

## Paying a Request

### Step 1: Open Pay Link

The payer opens the link you shared.

### Step 2: Connect Wallet

Payer connects their wallet (must have Inco USDC balance).

### Step 3: Setup (First Time)

If payer hasn't used confidential transfers before:

1. Click **"Create Confidential Account"**
2. Sign the transaction
3. Fund the account with Inco USDC

### Step 4: Review and Pay

Payer sees:

- Amount requested
- Recipient address (truncated)
- Transfer type: "Confidential (Inco)"

Click **"Pay"** to execute the confidential transfer.

### Step 5: Confirmation

After successful payment:

- Transaction link provided
- Request status updates to "PAID"
- Both parties notified

## Request Status

| Status        | Meaning                        |
| ------------- | ------------------------------ |
| **PENDING**   | Created, awaiting payment      |
| **PAID**      | Successfully paid              |
| **EXPIRED**   | Request expired (configurable) |
| **CANCELLED** | Cancelled by requester         |

## Admin Approval Flow

For organizational payment requests:

1. Employee creates request through company portal
2. Request appears in **Admin Dashboard → Requests**
3. Admin reviews and clicks **"Approve & Pay"**
4. Treasury executes confidential transfer

This enables expense approval workflows with confidential amounts.

## Privacy Features

### What's Hidden

| Data             | Protection         |
| ---------------- | ------------------ |
| Payment amount   | Encrypted on-chain |
| Account balances | Encrypted (FHE)    |

### What's Visible

| Data                 | Visibility |
| -------------------- | ---------- |
| Transaction occurred | Public     |
| Sender address       | Public     |
| Recipient address    | Public     |

:::info Amount Visibility
The amount in the pay link is visible to whoever has the link. After payment, the on-chain amount is encrypted.
:::

## Troubleshooting

### "Recipient has no confidential account"

The recipient must initialize their Inco account first:

1. Recipient visits /request page
2. Connects wallet
3. Clicks "Initialize Confidential Account"

### "Source account not found"

The payer needs to create their confidential account and fund it with Inco USDC.

### "Insufficient balance"

Payer's confidential account doesn't have enough Inco USDC. They need to deposit more.

### Request expired

Create a new payment request. Expired requests cannot be paid.

## API Integration

For programmatic payment requests:

```bash
# Create request
POST /api/v1/requests
{
  "amount": 1000000000,
  "memo": "Invoice #123",
  "recipient": "wallet_pubkey"
}

# Get request
GET /api/v1/requests/{id}
```

See [API Reference](/technical/api-reference) for full documentation.
