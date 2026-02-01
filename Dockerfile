FROM node:22.12.0-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY tsconfig.json ./
COPY packages/sdk/package.json ./packages/sdk/
COPY services/payroll-builder/package.json ./services/payroll-builder/
COPY services/payroll-builder/prisma ./services/payroll-builder/prisma/

RUN npm ci --include=dev

COPY packages/sdk ./packages/sdk
COPY services/payroll-builder ./services/payroll-builder

RUN npm run build --workspace=@zurpay/sdk
RUN cd services/payroll-builder && npx prisma generate
RUN npm run build --workspace=@zurpay/payroll-builder

WORKDIR /app/services/payroll-builder

EXPOSE 3001

CMD ["npm", "run", "start"]
