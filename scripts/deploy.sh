#!/bin/bash
set -e

echo "=== Zurpay Deployment Script ==="

echo "Checking prerequisites..."
command -v solana >/dev/null 2>&1 || { echo "solana CLI required"; exit 1; }
command -v anchor >/dev/null 2>&1 || { echo "anchor CLI required"; exit 1; }

echo "Current Solana config:"
solana config get

echo ""
read -p "Deploy to this cluster? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

echo "Step 1: Building Anchor program..."
anchor build

echo "Step 2: Deploying Zurpay program..."
PROGRAM_ID=$(anchor deploy --provider.cluster devnet 2>&1 | grep "Program Id:" | awk '{print $3}')

if [ -z "$PROGRAM_ID" ]; then
    echo "Deployment failed or program ID not found"
    anchor deploy --provider.cluster devnet
else
    echo ""
    echo "=== Zurpay Program Deployed ==="
    echo "Program ID: $PROGRAM_ID"
    echo ""
    echo "Update these files:"
    echo "  - packages/sdk/src/constants.ts (ZURPAY_PROGRAM_ID)"
    echo "  - programs/zurpay_payroll/src/lib.rs (declare_id!)"
    echo "  - Anchor.toml"
fi
