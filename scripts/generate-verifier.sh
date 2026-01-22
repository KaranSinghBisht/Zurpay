#!/bin/bash
set -e

echo "=== Zurpay Verifier Generation Script ==="

if ! command -v nargo &> /dev/null; then
    echo "Error: nargo not found. Install with: noirup"
    exit 1
fi

if ! command -v sunspot &> /dev/null; then
    echo "Error: sunspot not found."
    echo "Install: git clone https://github.com/reilabs/sunspot && cd sunspot && go build"
    exit 1
fi

echo "Step 1: Compiling Noir circuit..."
cd circuits/claim_eligibility
nargo compile

echo "Step 2: Converting ACIR to Gnark CCS..."
sunspot compile target/claim_eligibility.json

echo "Step 3: Generating proving/verifying keys..."
sunspot setup claim_eligibility.ccs

echo "Step 4: Building Solana verifier program..."
sunspot deploy verifying_key.vk

echo "Step 5: Deploying to Solana..."
VERIFIER_ID=$(solana program deploy verifier.so --output json | jq -r '.programId')

echo ""
echo "=== Verifier Deployed ==="
echo "Program ID: $VERIFIER_ID"
echo ""
echo "Update these files with the new program ID:"
echo "  - packages/sdk/src/constants.ts (ZK_VERIFIER_PROGRAM_ID)"
echo "  - Anchor.toml (if needed)"
