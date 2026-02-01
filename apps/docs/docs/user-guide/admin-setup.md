---
sidebar_position: 1
title: Admin Setup
---

# Admin Setup

This guide walks through setting up your organization on Zurpay.

## Prerequisites

- **Phantom** or **Solflare** wallet
- **Devnet SOL** for transaction fees
- Organization details ready

## Step 1: Connect Wallet

1. Go to the Admin Dashboard
2. Click **"Connect Wallet"**
3. Select your wallet provider
4. Approve the connection

:::tip Devnet Required
Make sure your wallet is set to **Solana Devnet**. Mainnet transactions will fail.
:::

## Step 2: Complete Onboarding

If this is your first time, you'll be redirected to the onboarding wizard.

### Organization Details

Enter your organization name. This is stored on-chain and identifies your treasury.

### Initialize Treasury

Click **"Initialize Treasury"** to create your organization's confidential treasury account.

This transaction:

- Creates the organization PDA
- Initializes an Inco confidential token account
- Sets you as the organization admin

:::info Transaction Required
You'll need to sign a transaction. This costs ~0.01 SOL in devnet fees.
:::

## Step 3: Fund Treasury

Before running payroll, fund your treasury with Inco USDC.

### Option A: Deposit Flow (Recommended)

1. Go to **Dashboard → Treasury**
2. Click **"Deposit"**
3. Enter amount
4. Sign the transaction

### Option B: Direct Transfer

Transfer Inco USDC directly to your treasury's confidential account address.

:::warning Correct Token Required
Zurpay uses **Inco Confidential USDC** (mint: `FGSe7zNdqqthJrJLmZ2dDTmJjLKdVrXJVAGxMuVoPqhC`). Regular USDC won't work.
:::

## Step 4: Add Workers (Optional)

You can pre-register workers for recurring payroll:

1. Go to **Dashboard → Workers**
2. Click **"Invite Worker"**
3. Enter email and compensation details
4. Worker receives invite email

Workers who accept invites can be automatically included in scheduled payroll runs.

## Dashboard Overview

After setup, your dashboard shows:

| Section       | Purpose                           |
| ------------- | --------------------------------- |
| **Treasury**  | Balance and deposit/withdraw      |
| **Payruns**   | Create and manage payroll runs    |
| **Workers**   | Manage worker invitations         |
| **Schedules** | Set up recurring payroll          |
| **Requests**  | View and approve payment requests |

## Next Steps

- [Create Payrun](/user-guide/create-payrun) — Run your first confidential payroll
- [Payment Requests](/user-guide/payment-requests) — Handle ad-hoc payments
