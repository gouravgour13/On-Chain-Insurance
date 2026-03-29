# Frontend (React + Vite)

This frontend provides a UI for the Soroban insurance contract methods:

- `create_policy`
- `file_claim`
- `settle_claim`
- `view_pool_status`
- `view_policy`
- `view_claim`

## 1) Setup

1. Copy `.env.example` to `.env`
2. Install dependencies:

```bash
npm install
```

## 2) Run

```bash
npm run dev
```

The app expects Freighter wallet for signed transactions.

## 3) Build

```bash
npm run build
```

## Environment Variables

- `VITE_SOROBAN_RPC_URL`
- `VITE_SOROBAN_NETWORK_PASSPHRASE`
- `VITE_CONTRACT_ID`
