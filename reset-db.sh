#!/bin/bash

# Zurpay Database Reset Script
# Usage: ./reset-db.sh [--force]

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}   Zurpay Database Reset Script      ${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Check for --force flag
if [ "$1" != "--force" ]; then
    echo -e "${YELLOW}⚠️  WARNING: This will DELETE ALL DATA in the database!${NC}"
    echo ""
    read -p "Are you sure you want to continue? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo -e "${RED}Aborted.${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${YELLOW}Resetting database...${NC}"

cd "$PROJECT_DIR/services/payroll-builder"

# Reset the database using Prisma
npx prisma db push --force-reset --accept-data-loss 2>&1

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Database reset successfully!${NC}"
    echo -e "${GREEN}  All tables have been cleared.${NC}"
else
    echo ""
    echo -e "${RED}✗ Database reset failed!${NC}"
    echo -e "${YELLOW}  Make sure the database is accessible.${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Ready for fresh testing!${NC}"
