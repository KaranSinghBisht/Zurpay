#!/bin/bash

# Zurpay Development Script
# Usage: ./dev.sh [start|stop|restart|clean]

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ports used by services
BACKEND_PORT=4000
ADMIN_PORT=3000
EMPLOYEE_PORT=3002
DOCS_PORT=3003

kill_ports() {
    echo -e "${YELLOW}Killing processes on ports $BACKEND_PORT, $ADMIN_PORT, $EMPLOYEE_PORT, $DOCS_PORT...${NC}"
    lsof -ti:$BACKEND_PORT | xargs kill -9 2>/dev/null
    lsof -ti:$ADMIN_PORT | xargs kill -9 2>/dev/null
    lsof -ti:$EMPLOYEE_PORT | xargs kill -9 2>/dev/null
    lsof -ti:$DOCS_PORT | xargs kill -9 2>/dev/null
    echo -e "${GREEN}✓ Ports cleared${NC}"
}

clean_cache() {
    echo -e "${YELLOW}Cleaning .next cache...${NC}"
    rm -rf "$PROJECT_DIR/apps/admin/.next"
    rm -rf "$PROJECT_DIR/apps/employee/.next"
    rm -rf "$PROJECT_DIR/apps/docs/.docusaurus"
    echo -e "${GREEN}✓ Cache cleared${NC}"
}

start_services() {
    echo -e "${BLUE}Starting Zurpay services...${NC}"
    echo ""
    
    # Start payroll-builder backend
    echo -e "${YELLOW}[1/4] Starting payroll-builder on port $BACKEND_PORT...${NC}"
    cd "$PROJECT_DIR/services/payroll-builder" && npm run dev &
    sleep 2
    
    # Start admin app
    echo -e "${YELLOW}[2/4] Starting admin app on port $ADMIN_PORT...${NC}"
    cd "$PROJECT_DIR/apps/admin" && npm run dev &
    sleep 2
    
    # Start employee app
    echo -e "${YELLOW}[3/4] Starting employee app on port $EMPLOYEE_PORT...${NC}"
    cd "$PROJECT_DIR/apps/employee" && npm run dev &
    sleep 2
    
    # Start docs
    echo -e "${YELLOW}[4/4] Starting docs on port $DOCS_PORT...${NC}"
    cd "$PROJECT_DIR/apps/docs" && npm run start -- --port $DOCS_PORT &
    
    echo ""
    echo -e "${GREEN}=====================================${NC}"
    echo -e "${GREEN}All services started!${NC}"
    echo -e "${GREEN}=====================================${NC}"
    echo ""
    echo -e "  ${BLUE}Backend:${NC}  http://localhost:$BACKEND_PORT"
    echo -e "  ${BLUE}Admin:${NC}    http://localhost:$ADMIN_PORT"
    echo -e "  ${BLUE}Employee:${NC} http://localhost:$EMPLOYEE_PORT"
    echo -e "  ${BLUE}Docs:${NC}     http://localhost:$DOCS_PORT"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
    
    # Wait for all background processes
    wait
}

show_help() {
    echo "Zurpay Development Script"
    echo ""
    echo "Usage: ./dev.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start    Start all services"
    echo "  stop     Stop all services (kill ports)"
    echo "  restart  Stop, clean cache, and start all services"
    echo "  clean    Clean .next cache only"
    echo "  help     Show this help message"
    echo ""
    echo "If no command is given, 'restart' is used by default."
}

# Main
case "${1:-restart}" in
    start)
        start_services
        ;;
    stop)
        kill_ports
        ;;
    restart)
        kill_ports
        clean_cache
        start_services
        ;;
    clean)
        clean_cache
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        show_help
        exit 1
        ;;
esac
