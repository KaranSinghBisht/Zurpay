# Zurpay Development TODO

## Completed

- [x] Monorepo scaffolding with npm workspaces
- [x] TypeScript SDK with Merkle tree implementation
- [x] Noir circuit for claim eligibility (merkle membership + nullifier)
- [x] Anchor program with init_org, set_payrun, claim instructions
- [x] Inco confidential transfer integration in claim
- [x] Payroll builder service (CSV parsing, Merkle tree, claim packages)
- [x] Admin dashboard skeleton (Next.js)
- [x] Employee portal skeleton (Next.js)

## In Progress

- [ ] Sunspot verifier generation and deployment
- [ ] End-to-end testing on localnet
- [ ] Devnet deployment

## Pending

### Phase 1 - Core Integration

- [ ] Install Sunspot and generate verifier from Noir circuit
- [ ] Deploy verifier program to devnet
- [ ] Update program with actual verifier program ID
- [ ] Test ZK proof verification CPI

### Phase 2 - UI Polish

- [ ] Implement wallet connection in admin app
- [ ] Implement wallet connection in employee app
- [ ] Wire up CSV upload to payroll-builder API
- [ ] Implement proof generation in browser (noir-js)
- [ ] Add loading states and error handling

### Phase 3 - Demo

- [ ] Create demo video script
- [ ] Record 3-minute demo
- [ ] Deploy all services to production
- [ ] Write submission documentation

## Sunspot Verifier Setup

```bash
# Clone sunspot
git clone https://github.com/reilabs/sunspot
cd sunspot && go build

# Compile Noir to ACIR
cd circuits/claim_eligibility
nargo compile

# Generate verifier
sunspot compile target/claim_eligibility.json
sunspot setup claim_eligibility.ccs
sunspot deploy verifying_key.vk

# Deploy to Solana
solana program deploy verifier.so
```

## Environment Variables

```env
# .env.local
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_ZURPAY_PROGRAM_ID=<deployed_program_id>
NEXT_PUBLIC_ZK_VERIFIER_PROGRAM_ID=<deployed_verifier_id>
PAYROLL_BUILDER_PORT=3001
```
