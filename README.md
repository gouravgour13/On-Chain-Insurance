# On-Chain Insurance

## Table of Contents

- [Project Title](#on-chain-insurance)
- [Project Description](#project-description)
- [Project Vision](#project-vision)
- [Key Features](#key-features)
- [Future Scope](#future-scope)

---

## Project Description

**On-Chain Insurance** is a decentralized insurance protocol built on the **Stellar blockchain** using the **Soroban smart contract SDK**. It enables users to purchase transparent, tamper-proof insurance policies and file claims — all enforced automatically by on-chain logic, with no reliance on opaque intermediaries.

The contract manages the full lifecycle of an insurance policy:

1. **Policy Creation** — A user registers a policy by specifying a coverage amount, a premium, and a validity duration. The policy is stored immutably on-chain with a unique ID and an auto-calculated expiry timestamp.
2. **Claim Filing** — A policyholder files a claim against their active, non-expired policy. The contract validates eligibility (active status, expiry window, and claim amount bounds) before recording the claim on-chain.
3. **Claim Settlement** — An authorized administrator reviews and settles pending claims. On settlement, the policy is marked inactive and the global pool statistics are updated.

Two additional read-only functions (`view_policy` and `view_claim`) allow anyone to audit the state of any policy or claim at any time, ensuring complete transparency.

---

## Project Vision

Traditional insurance is plagued by information asymmetry, slow claim processing, and a fundamental lack of trust between policyholders and insurers. Customers rarely know how premiums are pooled, whether their claims will be honored, or how long settlement will take.

**On-Chain Insurance** envisions a world where:

- **Insurance terms are code** — policies are smart contracts, not PDFs. Every condition is publicly auditable and deterministically enforced.
- **Claims cannot be arbitrarily denied** — the blockchain records every policy and claim, creating an immutable audit trail that holds both parties accountable.
- **Settlements are fast and verifiable** — instead of weeks of manual review, claim processing is triggered on-chain and settled in seconds.
- **Trust is replaced by cryptographic proof** — users do not need to trust the insurer; they trust the math.

The long-term vision is to bring parametric, peer-to-peer, and community-pooled insurance products to anyone with a Stellar wallet — regardless of geography, credit history, or institutional access.

---

## Key Features

| Feature                          | Description                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Policy Registration**          | Users can create insurance policies with a defined coverage amount, premium, and duration. Each policy receives a unique on-chain ID.   |
| **Automatic Expiry Enforcement** | Policy validity is enforced using ledger timestamps. Attempting to file a claim against an expired policy is automatically rejected.    |
| **Claim Filing**                 | Policyholders can file claims against active policies. The contract validates that the claim amount does not exceed the coverage limit. |
| **Admin-Controlled Settlement**  | A designated admin can settle verified claims, updating both the claim record and the associated policy status atomically.              |
| **Global Pool Transparency**     | A `PoolStatus` struct tracks total policies, active policies, total claims, and settled claims — queryable by anyone at any time.       |
| **Duplicate Claim Prevention**   | Once a policy has been claimed and settled, it cannot be claimed again, preventing double-spend or fraudulent re-claims.                |
| **Immutable Audit Trail**        | Every policy and claim is stored on-chain with timestamps, providing a permanent, tamper-proof record.                                  |

---

## Product Walkthrough

🎥 **Watch the full product demonstration:**

[Click here to watch the video](https://github.com/username/repo/blob/main/product_walkthrough/On-Chain_inurance.mp4)

_This video demonstrates the complete workflow: policy creation, claim filing, and settlement using the Soroban smart contract on Stellar testnet._

---

## Future Scope

The current implementation is a minimal viable foundation. The following enhancements are planned for future iterations:

- **Decentralized Claim Arbitration** — Replace the single admin with a multi-signature committee or a DAO-based voting mechanism to eliminate centralized control over claim settlements.
- **Native Token Integration** — Integrate Stellar's native asset (XLM) or Soroban token standard (SEP-41) to handle actual on-chain premium payments and automated payouts directly within the contract.
- **Parametric Insurance Triggers** — Connect oracle feeds (e.g., weather data, flight delays, price indices) to auto-trigger and auto-settle claims when predefined conditions are met — eliminating the manual settlement step entirely.
- **Risk Pooling & Reinsurance** — Implement a shared liquidity pool where multiple users contribute premiums collectively, enabling community-funded coverage and risk distribution across participants.
- **Policy NFTs** — Represent insurance policies as transferable NFTs on Stellar, allowing secondary markets where policies can be sold, traded, or used as collateral.
- **Multi-Tier Coverage Plans** — Support tiered policy types (basic, standard, premium) with different risk levels, premium rates, and coverage caps, governed by configurable on-chain parameters.
- **Fraud Detection Hooks** — Integrate on-chain analytics or external oracle attestations to flag suspicious claim patterns before settlement is authorized.
- **Cross-Chain Compatibility** — Explore bridges to allow policies initiated on other chains to be settled or verified using the Stellar Soroban contract as a source of truth.

##Contract ID: CCVSLJ6NOHV35GY7BYLTZOXQCIXPPTUVDWABABJSHPFYI2JZZE55FLD4
<img width="1784" height="862" alt="Screenshot 2026-03-28 190025" src="https://github.com/user-attachments/assets/668d5262-7290-477d-87c1-14437fd2d4a7" />

---

## Frontend

A React + Vite frontend has been added in `frontend/`.

### Run frontend locally

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

### Build frontend

```bash
cd frontend
npm run build
```

The frontend is configured for Soroban testnet and uses Freighter wallet to sign transactions.
