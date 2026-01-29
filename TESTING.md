# Zurpay Testing Guide

## Prerequisites

- Node.js 18+
- Phantom/Solflare wallet set to **Solana Devnet**
- Devnet SOL (get from https://faucet.solana.com)
- PostgreSQL running (or Supabase connection active)

---

## Chain & Token Info

| Item | Value |
|------|-------|
| **Network** | Solana Devnet |
| **RPC** | `https://api.devnet.solana.com` |
| **Token** | Inco Confidential USDC |
| **Mint Address** | `FGSe7zNdqqthJrJLmZ2dDTmJjLKdVrXJVAGxMuVoPqhC` |

### Getting Test Tokens

**1. Get Devnet SOL (for gas fees):**
```bash
# Via CLI
solana airdrop 2 --url devnet

# Or via web faucet
# https://faucet.solana.com
```

**2. Get Inco USDC (for payments):**

Inco USDC is a confidential token - balances are encrypted on-chain. To get test tokens:

```bash
# Option A: Use the Inco devnet faucet (if available)
# Check: https://docs.inco.org/solana

# Option B: Fund treasury from admin dashboard
# 1. Go to Dashboard → Treasury
# 2. Click "Deposit" and follow the flow
# This mints test Inco USDC to your treasury

# Option C: Manual mint via CLI (requires Inco SDK)
# See: packages/sdk/src/inco-token.ts for reference
```

**Note:** Regular USDC won't work - Zurpay uses Inco's FHE-encrypted confidential tokens for privacy

---

## 1. Start Services

```bash
# Terminal 1 - Backend
cd services/payroll-builder && npm run dev
# Should show: Server running on port 3001

# Terminal 2 - Admin app
cd apps/admin && npm run dev
# Should show: Ready on http://localhost:3000

# Terminal 3 - Employee app
cd apps/employee && npm run dev
# Should show: Ready on http://localhost:3002
```

**Verify:**
- [ ] `curl http://localhost:3001/health` returns `{"status":"ok","database":"connected"}`
- [ ] Admin app loads at http://localhost:3000
- [ ] Employee app loads at http://localhost:3002

---

## 2. Admin Flow

### 2.1 Landing → Dashboard Routing
1. Go to http://localhost:3000
2. Click **"Launch App"**
3. **Expected:** Goes to `/dashboard`
4. **Expected:** Shows "Connect Your Wallet" if not connected
5. Connect wallet
6. **If no org:** Auto-redirects to `/onboarding`
7. **If has org:** Shows dashboard

- [ ] Launch App routes to dashboard
- [ ] Wallet prompt works
- [ ] Auto-redirect to onboarding if no org

### 2.2 Onboarding (First Time)
1. Complete wizard: name org, initialize treasury
2. Treasury init requires on-chain tx signature
3. **Expected:** Dashboard loads after completion

- [ ] Wizard completes
- [ ] Treasury initialized on-chain

### 2.3 Create Payrun
1. Dashboard → Payruns → **New Payrun**
2. Upload CSV:
   ```csv
   email,amount
   test@example.com,1000000
   ```
   (1000000 = 1 USDC)
3. Click **"Validate"**
4. Click **"Post On-Chain"** (signs tx)
5. Click **"Open Claims"**
6. Copy claim link

- [ ] CSV uploads
- [ ] Validation generates merkle root
- [ ] On-chain post succeeds
- [ ] Claims open
- [ ] Claim link generated

### 2.4 Create Paylink
1. Dashboard → Paylinks → **Create**
2. Enter amount
3. Click **"Post On-Chain"**
4. Copy link

- [ ] Paylink created
- [ ] On-chain post succeeds
- [ ] Link generated

### 2.5 Payment Requests
1. Dashboard → Requests
2. View pending requests
3. Click **"Approve & Pay"**

- [ ] Requests list loads
- [ ] Approve triggers confidential transfer
- [ ] Status updates to PAID

---

## 3. Employee Flow

### 3.1 Claim from Payrun
1. Open claim link (or `http://localhost:3002/claims/{payrunId}?token={token}`)
2. Connect wallet
3. Click **"Initialize Account"** if prompted
4. Click **"Claim"**

- [ ] Page loads with amount
- [ ] Account init works
- [ ] Claim succeeds
- [ ] Can't claim twice

### 3.2 Claim from Paylink
1. Open paylink URL
2. Connect wallet
3. Click **"Claim"**

- [ ] Page shows amount
- [ ] Claim succeeds

### 3.3 Create Payment Request
1. Go to http://localhost:3002/request
2. Connect wallet
3. Enter amount, optional memo
4. Click **"Create Request"** (signs message)

- [ ] Request created
- [ ] Pay link generated

### 3.4 Pay Request (Confidential Transfer)

Payment requests now use **Inco confidential transfers** - amounts are encrypted on-chain.

**Setup (one-time per wallet):**
1. Open pay link: `http://localhost:3002/pay/{requestId}`
2. Connect payer wallet
3. If prompted: Click **"Create Confidential Account"**
   - This creates an Inco token account for your wallet
   - Requires signing a transaction
   - Account address is saved in localStorage

**Payment flow:**
1. Open pay link: `http://localhost:3002/pay/{requestId}`
2. Connect payer wallet (must have Inco USDC balance)
3. Page shows:
   - Amount requested
   - Recipient wallet (truncated)
   - Transfer type: "Confidential (Inco)"
4. Click **"Pay [amount]"**
5. Steps execute:
   - Checking accounts...
   - Encrypting amount...
   - Executing confidential transfer...
   - Recording payment...
6. Success screen shows tx link

**Checklist:**
- [ ] Payer without conf account sees "Create Confidential Account" button
- [ ] Conf account creation succeeds
- [ ] Payment encrypts amount before transfer
- [ ] Transfer executes via Inco program (not System program)
- [ ] Tx on explorer shows Inco Token Program interaction
- [ ] Amount is NOT visible on-chain (encrypted)
- [ ] Status updates to PAID

**If recipient has no conf account:**
- [ ] Shows warning: "Recipient hasn't set up their confidential account"
- [ ] Pay button is disabled

---

## 4. Error Scenarios

### Duplicate Transaction
1. Click "Post On-Chain" twice quickly
2. **Expected:** Second click ignored or friendly error

- [ ] No crash
- [ ] Graceful error message

### Expired Token
- [ ] Shows "Claim Expired"

### Already Claimed
- [ ] Shows error, prevents double-claim

### Wallet Not Connected
- [ ] Shows "Connect Wallet" prompt

---

## 5. Quick Commands

```bash
# Health check
curl http://localhost:3001/health

# Database browser
cd services/payroll-builder && npx prisma studio

# Solana status
solana config get
solana balance

# Check program
solana program show Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9 --url devnet
```

---

## 6. Common Issues

| Issue | Solution |
|-------|----------|
| Connection timeout | Supabase cold start - retry |
| Treasury not initialized | Complete onboarding |
| Conf account not found | Click "Initialize Account" |
| Paylink not on-chain | Admin clicks "Post On-Chain" |
| Token expired | Generate new one |
| "Already processed" | Don't double-click, wait for UI |
| Tx fails | Check devnet SOL balance |
| "Recipient has no conf account" | Recipient must create one first (visit /request) |
| "Source account not found" | Payer needs Inco conf account - click "Create Confidential Account" |
| "Insufficient balance" | Fund payer's conf account with Inco USDC |
| Payment shows 0 on explorer | Correct! Amount is encrypted (FHE) |
| Schedule reminder not sent | Check RESEND_API_KEY env, or check console logs |
| Cron endpoint 401 | Set CRON_SECRET env (not needed in dev) |

---

## 7. Schedule Reminders

### 7.1 Create a Test Schedule
1. Dashboard → Schedules → **Create Schedule**
2. Name: "Test Weekly Payroll"
3. Frequency: Weekly, pick a day
4. Leave workers empty (includes all)
5. Click **Create**

- [ ] Schedule created
- [ ] Next run date calculated

### 7.2 Test Run Now (Improved UX)
1. On schedule card, click **"Run Payroll"**
2. Confirm dialog
3. **Expected:** Success modal with:
   - Worker count
   - Total amount
   - Payrun ID
   - "Go to Payruns" button
4. Click "Go to Payruns"

- [ ] Payrun created from schedule
- [ ] Modal shows correct info
- [ ] Navigation to payruns works

### 7.3 Test Schedule Reminder Emails
```bash
# Trigger reminder check (requires CRON_SECRET in prod)
curl -X POST http://localhost:3001/api/cron/schedule-reminders

# Check specific schedule
curl -X POST http://localhost:3001/api/cron/schedule-reminders/{scheduleId}

# With hours ahead param (default 24)
curl -X POST "http://localhost:3001/api/cron/schedule-reminders?hoursAhead=48"
```

**Expected response:**
```json
{
  "success": true,
  "processed": 2,
  "notified": 1,
  "errors": 1,
  "results": [...]
}
```

- [ ] Endpoint returns schedule check results
- [ ] Email sent (check Resend dashboard or logs)
- [ ] Email contains schedule name, worker count, amount

**Note:** Set `RESEND_API_KEY` env var for actual email delivery. Without it, emails log to console.

---

## 8. Program IDs (Devnet)

| Program | ID |
|---------|-----|
| Zurpay | `Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9` |
| Inco Token Program | `4cyJHzecVWuU2xux6bCAPAhALKQT8woBh4Vx3AGEGe5N` |
| Inco Program | `5sjEbPiqgZrYwR31ahR6Uk9wf5awoX61YGg7jExQSwaj` |
| Inco USDC Mint | `FGSe7zNdqqthJrJLmZ2dDTmJjLKdVrXJVAGxMuVoPqhC` |

---

## 9. End-to-End Happy Paths

### Path A: Payroll Claim
1. **Admin:** Create org → Fund treasury → Create payrun
2. **Admin:** Validate → Post on-chain → Open claims
3. **Employee:** Open link → Connect → Init account → Claim
4. **Verify:** Success message, balance encrypted

### Path B: Payment Request (P2P Confidential)
1. **Employee A:** Go to /request → Enter amount → Create request
2. **Employee A:** Copy pay link, send to Employee B
3. **Employee B:** Open pay link → Connect wallet
4. **Employee B:** Create conf account (if needed)
5. **Employee B:** Click Pay → Sign transaction
6. **Verify:**
   - Tx on Solana Explorer shows Inco program
   - Amount NOT visible (encrypted)
   - Request status = PAID

### Path C: Recurring Schedule
1. **Admin:** Create schedule (weekly/monthly)
2. **Admin:** Click "Run Payroll" on schedule
3. **Admin:** See success modal → Go to Payruns
4. **Admin:** Post payrun on-chain → Open claims
5. **Employees:** Claim as usual

---

## 10. Quick URLs

| Page | URL |
|------|-----|
| Landing | http://localhost:3000 |
| Dashboard | http://localhost:3000/dashboard |
| Onboarding | http://localhost:3000/onboarding |
| Employee | http://localhost:3002 |
| Request | http://localhost:3002/request |
