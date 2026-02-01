---
sidebar_position: 4
title: API Reference
---

# API Reference

The Payroll Builder Service exposes REST APIs for payrun and claim management.

## Base URL

```
Development: http://localhost:3001
Production: https://api.zurpay.xyz
```

## Authentication

Most endpoints require JWT authentication:

```
Authorization: Bearer <jwt_token>
```

Tokens are issued via wallet signature verification.

---

## Organizations

### Create Organization

```http
POST /api/organizations
```

**Request:**

```json
{
  "name": "Acme Corp",
  "adminWallet": "7xKX...abc"
}
```

**Response:**

```json
{
  "id": "org_123",
  "name": "Acme Corp",
  "adminWallet": "7xKX...abc",
  "createdAt": "2026-01-15T10:00:00Z"
}
```

### Get Organization

```http
GET /api/organizations/:id
```

---

## Payruns

### Create Payrun

```http
POST /api/payruns/create
```

**Request:**

```json
{
  "organizationId": "org_123",
  "workers": [
    { "email": "alice@acme.com", "amount": 5000000000 },
    { "email": "bob@acme.com", "amount": 3500000000 }
  ]
}
```

**Response:**

```json
{
  "id": "payrun_456",
  "organizationId": "org_123",
  "merkleRoot": "0x1234...abcd",
  "totalAmount": 8500000000,
  "workerCount": 2,
  "status": "DRAFT",
  "claims": [
    {
      "email": "alice@acme.com",
      "token": "tok_abc123",
      "claimUrl": "https://employee.zurpay.xyz/claims/payrun_456?token=tok_abc123"
    },
    {
      "email": "bob@acme.com",
      "token": "tok_def456",
      "claimUrl": "https://employee.zurpay.xyz/claims/payrun_456?token=tok_def456"
    }
  ]
}
```

### Validate Payrun

Generate Merkle tree and ZK proofs.

```http
POST /api/payruns/:id/validate
```

**Response:**

```json
{
  "id": "payrun_456",
  "status": "VALIDATED",
  "merkleRoot": "0x1234...abcd",
  "proofsGenerated": 2
}
```

### Get Payrun

```http
GET /api/payruns/:id
```

### List Payruns

```http
GET /api/payruns?organizationId=org_123
```

---

## Claims

### Get Claim by Token

Public endpoint - no auth required.

```http
GET /api/v1/claims/:token
```

**Response:**

```json
{
  "payrunId": "payrun_456",
  "amount": 5000000000,
  "proof": "0xabc...",
  "publicInputs": "0x123...",
  "encryptedAmount": "0xdef...",
  "merkleRoot": "0x1234...abcd",
  "status": "PENDING",
  "expiresAt": "2026-02-15T10:00:00Z"
}
```

### Mark Claim Used

Called after successful on-chain claim.

```http
POST /api/v1/claims/:token/mark-used
```

**Request:**

```json
{
  "transactionSignature": "5xYz...123"
}
```

**Response:**

```json
{
  "success": true,
  "status": "CLAIMED"
}
```

---

## Payment Requests

### Create Request

```http
POST /api/v1/requests
```

**Request:**

```json
{
  "amount": 1000000000,
  "memo": "Invoice #123",
  "recipientWallet": "7xKX...abc"
}
```

**Response:**

```json
{
  "id": "req_789",
  "amount": 1000000000,
  "memo": "Invoice #123",
  "recipientWallet": "7xKX...abc",
  "status": "PENDING",
  "payUrl": "https://employee.zurpay.xyz/pay/req_789"
}
```

### Get Request

```http
GET /api/v1/requests/:id
```

### Mark Request Paid

```http
POST /api/v1/requests/:id/mark-paid
```

**Request:**

```json
{
  "transactionSignature": "5xYz...123",
  "payerWallet": "8yZa...def"
}
```

---

## Workers

### Invite Worker

```http
POST /api/organizations/:orgId/workers/invite
```

**Request:**

```json
{
  "email": "carol@acme.com",
  "role": "EMPLOYEE",
  "compensation": {
    "amount": 4000000000,
    "frequency": "MONTHLY"
  }
}
```

### List Workers

```http
GET /api/organizations/:orgId/workers
```

### Accept Invite

```http
POST /api/workers/accept-invite
```

**Request:**

```json
{
  "token": "invite_token_xyz"
}
```

---

## Schedules

### Create Schedule

```http
POST /api/organizations/:orgId/schedules
```

**Request:**

```json
{
  "name": "Monthly Payroll",
  "frequency": "MONTHLY",
  "dayOfMonth": 1,
  "workerFilter": "ALL"
}
```

### Run Schedule Now

```http
POST /api/schedules/:id/run
```

---

## Health Check

```http
GET /health
```

**Response:**

```json
{
  "status": "ok",
  "database": "connected",
  "version": "1.0.0"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Claim token is invalid or expired"
  }
}
```

### Common Error Codes

| Code                 | HTTP Status | Description                   |
| -------------------- | ----------- | ----------------------------- |
| `UNAUTHORIZED`       | 401         | Missing or invalid auth token |
| `FORBIDDEN`          | 403         | Insufficient permissions      |
| `NOT_FOUND`          | 404         | Resource not found            |
| `INVALID_TOKEN`      | 400         | Claim token invalid/expired   |
| `ALREADY_CLAIMED`    | 400         | Claim already used            |
| `VALIDATION_ERROR`   | 400         | Request validation failed     |
| `INSUFFICIENT_FUNDS` | 400         | Treasury underfunded          |

---

## Rate Limits

| Endpoint                | Limit        |
| ----------------------- | ------------ |
| Public endpoints        | 100 req/min  |
| Authenticated endpoints | 1000 req/min |
| Proof generation        | 10 req/min   |

Exceeded limits return `429 Too Many Requests`.
