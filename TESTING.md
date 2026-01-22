# Zurpay Testing Guide

## Prerequisites
1. **Phantom Wallet** - Set to **Devnet** (Settings → Developer Settings → Devnet)
2. **Devnet SOL** - Get from https://faucet.solana.com

---

## Part 1: Onboarding (New User)

1. Go to **http://localhost:3000**
2. Click **"Get Started"** → goes to `/onboarding`
3. **Step 1 - Welcome**: Click **"Select Wallet"** → connect Phantom
4. **Step 2 - Auth**: Click **"Sign In with Wallet"** → approve signature
5. **Step 3 - Org Choice**: Click **"Create Organization"**
6. **Step 4 - Create Org**: Enter org name → Click **"Create Organization →"**
7. **Step 5 - Add Worker**: Enter worker wallet or **"Skip for now"**
8. **Step 6 - Complete**: Click **"Go to Dashboard →"**

---

## Part 2: Dashboard (Create Payrun)

1. Go to **Workers** → Add a worker with compensation plan
2. Go to **Payruns** → Click **"New Payrun"**
3. Create payrun → Click **"Validate"** on detail page
4. Copy the **claim link**

---

## Part 3: Employee Claim

1. Open **incognito window** or different browser
2. Go to **http://localhost:3002** (employee app)
3. Paste the claim link
4. Connect with **worker's wallet** (NOT admin wallet)
5. Click **"Claim"** → 🎉 Confetti!

---

## Quick URLs

| Page | URL |
|------|-----|
| Landing | http://localhost:3000 |
| Onboarding | http://localhost:3000/onboarding |
| Dashboard | http://localhost:3000/dashboard |
| Employee App | http://localhost:3002 |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Unauthorized" | Sign the SIWS message in Phantom |
| "useAuth error" | Make sure page has SolanaProviders |
| Database errors | Check DATABASE_URL in .env.local |
| Claim not found | Make sure payrun was validated |
