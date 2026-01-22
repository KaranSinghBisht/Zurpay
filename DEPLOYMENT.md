# Zurpay Solana Program Deployment

## 📍 Deployed Program Info

| Field | Value |
|-------|-------|
| **Program ID** | `Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9` |
| **Network** | Devnet |
| **Deployed** | Jan 21, 2026 |
| **Program Size** | 276 KB |

### Explorer Links
- **Program**: https://explorer.solana.com/address/Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9?cluster=devnet

---

## 🔑 Deploy Wallet

| Field | Value |
|-------|-------|
| **Wallet Address** | `9MzroaivQjCoqQd36ZFUhNPQBgtPLnfKWvAAVbwHKmYE` |
| **Keypair Path** | `~/.config/solana/id.json` |

> ⚠️ **Seed Phrase (backup):** `equal hotel taxi casual grunt often grain grain joy bread garlic head`

---

## 📁 Key Files

- **Anchor.toml** - Contains program ID configuration
- **target/deploy/zurpay_payroll.so** - Compiled program binary
- **target/deploy/zurpay_payroll-keypair.json** - Program keypair

---

## 🛠️ Redeployment Commands

```bash
# Set to devnet
solana config set --url devnet

# Check balance (need ~2 SOL to deploy)
solana balance

# Build program
~/.avm/bin/anchor build

# Copy .so to deploy folder
cp programs/zurpay_payroll/target/deploy/zurpay_payroll.so target/deploy/

# Deploy
~/.avm/bin/anchor deploy --provider.cluster devnet
```

---

## 🔧 Dependency Fixes Applied

Fixed rustc 1.79 compatibility by downgrading:
```
cargo update proc-macro-crate@3.4.0 --precise 3.1.0
cargo update indexmap --precise 2.7.0
cargo update borsh@1.6.0 --precise 1.5.3
```
