# TERWA Platform Documentation

## Overview

TERWA is a tokenized wine presale platform built on the Stellar blockchain using Soroban smart contracts. The platform allows users to purchase tokenized wine assets during a presale period, with each token representing proof of ownership and a right to claim the underlying physical wine asset at maturity.

## Documentation

This repository contains two core documentation files:

### [ARCHITECTURE.md](ARCHITECTURE.md)
High-level system architecture and design documentation covering:
- Platform overview and token design (proof of ownership/utility token)
- Complete architecture diagram with all system layers
- Core components: Vault Contract, Token (Classic Asset + SAC), Web Platform, Off-chain Management
- Capital flow and transaction lifecycle
- Integration details with Stellar blockchain
- Development plan and deliverables
- Phase 2 future extensions (DeFi deployment, cross-ecosystem bridges)
- Risk assessment and mitigations

### [TECHNICAL.md](TECHNICAL.md)
Detailed technical implementation specification including:
- Complete technology stack and repository structure
- Soroban contract data model, storage keys, and error codes
- Full contract interface and event definitions
- Token design: Stellar Classic Asset + SAC wrapper implementation
- Frontend wallet integration (Stellar Wallet Kit)
- Valuation service architecture and methodology
- Comprehensive testing strategy
- Deployment pipeline and CI/CD
- Security considerations and Soroban-specific notes
- Cost estimation for on-chain operations

## Key Features

- **En Primeur Presale**: pre-order allocations, payable in USDC (or in XLM, converted client side)
- **Proof of Ownership**: each token represents a lot of three bottles and the right to claim them
- **Fixed-Term Presale**: tokens are held until each vintage reaches its release date
- **Three Exit Options**: at each release, physical delivery of the bottles, free resale of the certificates, or the producer take-back
- **Multi-Wallet Support**: Stellar Wallet Kit integration (Freighter, xBull, Lobstr, etc.)
- **Indicative Valuation**: an annual valuation by a wine expert, published for information only, that never drives payouts
- **Producer Take-back Floor**: a minimum take-back price committed in advance by the producer (a producer commitment, not a contract guarantee)

## Milestone 1 Implementation

The MVP delivery for milestone 1 lives in this repository:

- `contracts/` : Soroban vault and allocation-sale contracts, with unit tests
- `frontend/` : the web platform deployed at https://terwa.io
- `scripts/` : testnet deployment and environment scripts
- `legal/` : buyer attestation text (its hash is signed on-chain at purchase)
- [`MILESTONE-1.md`](MILESTONE-1.md) : delivery report with completion criteria, deployed contract addresses and a step-by-step verification procedure

## Milestone 2 Implementation (Testnet)

Milestone 2 delivers the full end-to-end platform on the Stellar testnet: the
backend services, SEP-10 web authentication, identity verification at exit, and
the maturity flows (producer take-back and physical claim) exercised live
on-chain with allowlist gating.

- `backend/` : event indexer, transaction history API, delivery claim service, producer take-back queue, valuation oracle service, holder notifications, admin operations and health monitoring (TypeScript, Fastify, PostgreSQL)
- `contracts/`, `frontend/`, `scripts/` : updated for the testnet platform
- [`MILESTONE-2.md`](MILESTONE-2.md) : delivery report against criterion D3, deployed contract addresses, the on-chain redeem and claim transaction hashes, measured test coverage, and the tranche 1 addendum commitments held
- [`DESIGN.md`](DESIGN.md) : the platform design system
