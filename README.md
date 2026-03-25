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

- **Tokenized Presale**: Purchase TERWA tokens with USDC during presale window
- **Proof of Ownership**: Each token represents a right to claim physical wine assets
- **Fixed-Term Model**: Capital locked until vault maturity for asset appreciation
- **Dual Redemption**: At maturity, redeem for USDC (appraised value) or claim physical wine
- **Multi-Wallet Support**: Stellar Wallet Kit integration (Freighter, xBull, Lobstr, etc.)
- **Independent Valuation**: Annual wine expert appraisals with transparent methodology
- **Buyback Guarantee**: Legal commitment from RWA provider (annex available)
