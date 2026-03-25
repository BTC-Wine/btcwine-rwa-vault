# TERWA : Technical Architecture

## Tokenized Wine Presale Infrastructure on Stellar

> **Companion document**: For implementation-level details including data model, dependencies, testing, deployment pipeline, and security -> see [`TECHNICAL.md`](TECHNICAL.md).
>
> This document represents preparatory architectural design completed ahead of development. It defines the system structure, component responsibilities, capital flow, and deliverable scope that will guide implementation once the project is funded.

---

## 1. Overview

TERWA is a tokenized wine presale platform built on the Stellar blockchain using Soroban smart contracts. The platform allows users to purchase tokenized wine assets during a presale period. Each token represents a **proof of ownership and a right to claim the underlying physical wine asset** at maturity.

The platform operates on a **fixed-term model**. Users purchase tokens with stablecoins during the presale window. Deposited capital is used to fund wine production and asset custody. At vault maturity, token holders can either redeem their tokens for stablecoins (at the independently appraised value) or claim the underlying physical wine asset via an established supply chain.

The TERWA token is issued as a **Stellar Classic Asset** and wrapped via a **Stellar Asset Contract (SAC)** to enable Soroban smart contract interactions (minting, burning, transfer restrictions). This two-layer approach ensures native compatibility with all Stellar wallets while enabling programmable logic on-chain.

The RWA provider (wine production partner) issues a **legally binding buyback guarantee**, committing to repurchase the underlying asset at vault maturity at no less than the original issuance price. A formal legal engagement letter is available as a separate annex upon request.

The architecture is designed so that the vault contract and token logic can be reused for other RWA asset classes beyond wine.

---

## 2. Architecture Diagram

```
+---------------------------------------------------------------+
|                        TERWA Platform                         |
+---------------------------------------------------------------+

                     +-------------------+
                     |    End Users      |
                     | (Stellar Wallets) |
                     | via Wallet Kit:   |
                     | Freighter, xBull, |
                     | Lobstr, etc.      |
                     +--------+----------+
                              |
                              v
+-----------------------------------------------------------------+
|                       Web Platform                              |
|                                                                 |
|  - Presale purchase flow       - Portfolio dashboard            |
|  - Vault overview (public)     - Redemption / physical claim    |
|  - Transaction history         - Valuation transparency         |
|  - How it works / FAQ          - Buyback guarantee info         |
|                                                                 |
+----------------------------+------------------------------------+
                             |
                Purchase (USDC) / Redeem / Claim
                             |
                             v
+-----------------------------------------------------------------+
|                   Soroban Smart Contract Layer                   |
|                                                                 |
|  +---------------------------+   +---------------------------+  |
|  |   TERWA Vault Contract    |   |   TERWA Token (SAC)       |  |
|  |                           |   |                           |  |
|  |  - Accept USDC deposits   |   |  - Stellar Classic Asset  |  |
|  |  - Mint/burn tokens       |<->|  - Wrapped via SAC for    |  |
|  |  - Track vault state      |   |    Soroban interaction    |  |
|  |  - Enforce maturity lock  |   |  - Visible in all Stellar |  |
|  |  - Handle redemptions     |   |    wallets and explorers  |  |
|  |  - Handle physical claims |   |                           |  |
|  +-------------+-------------+   +---------------------------+  |
|                |                                                |
+-----------------------------------------------------------------+
                 |
                 |  Valuation updates (annual)
                 v
+-----------------------------------------------------------------+
|                   Off-chain Management Layer                    |
|                                                                 |
|  +---------------------------+   +---------------------------+  |
|  |   Valuation Service       |   |   Physical Fulfillment    |  |
|  |                           |   |                           |  |
|  |  - Independent wine       |   |  - Established supply     |  |
|  |    expert appraisal       |   |    chain for delivery     |  |
|  |  - Annual valuation       |   |  - Packaging, shipping,   |  |
|  |    update on-chain        |   |    tracking               |  |
|  |  - Axum backend submits   |   |  - Delivery confirmation  |  |
|  |    via report_rwa_value   |   |    linked on-chain        |  |
|  +---------------------------+   +---------------------------+  |
|                                                                 |
|  +---------------------------+   +---------------------------+  |
|  |   Wine Asset Custody      |   |   Compliance              |  |
|  |                           |   |                           |  |
|  |  - Production partner     |   |  - KYC/AML off-chain      |  |
|  |    holds physical assets  |   |  - Legal framework with   |  |
|  |  - Buyback guarantee      |   |    RWA provider           |  |
|  |    (legal engagement)     |   |                           |  |
|  +---------------------------+   +---------------------------+  |
|                                                                 |
+-----------------------------------------------------------------+
```

---

## 3. Core Components

### 3.1 TERWA Vault Smart Contract (Soroban)

The central contract deployed on Stellar via Soroban. It manages:

- **Presale deposits**: Accepts USDC from users and mints TERWA tokens. Each token represents proof of ownership over a share of the underlying wine asset.
- **Lock period**: No early withdrawals. Capital is committed for the full vault term to fund wine production and custody.
- **Redemptions**: At vault maturity, burns tokens and returns the proportional share of vault assets in USDC (based on independently appraised value). The RWA buyback guarantee is exercised to make capital available.
- **Physical asset claim**: At vault maturity, token holders can opt to receive the underlying physical wine asset instead of stablecoin redemption.
- **Accounting**: Tracks total deposits, vault value (based on latest appraisal), and per-user balances on-chain.
- **Admin controls**: Authorized addresses can update vault parameters and submit valuation updates.

**Contract interface (simplified):**

```rust
pub trait TerwaVaultTrait {
    fn initialize(env: Env, admin: Address, vault_token: Address, stablecoin: Address,
        oracle: Address, maturity_timestamp: u64, buyback_price: i128) -> Result<(), VaultError>;
    fn deposit(env: Env, user: Address, amount: i128) -> Result<i128, VaultError>;
    fn redeem(env: Env, user: Address, token_amount: i128) -> Result<i128, VaultError>;
    fn claim_physical(env: Env, user: Address, token_amount: i128,
        delivery_hash: BytesN<32>) -> Result<(), VaultError>;
    fn get_vault_value(env: Env) -> i128;
    fn report_rwa_value(env: Env, oracle: Address, value: i128) -> Result<(), VaultError>;
}
```

For the full interface with doc comments, data model, error codes, and event definitions, see [`TECHNICAL.md` §3](TECHNICAL.md#3-soroban-contract--data-model).

### 3.2 TERWA Token (Stellar Classic Asset + SAC)

The TERWA token represents a **proof of ownership and a right to claim the underlying wine asset**. It is not a financial product or investment vehicle.

**Issuance model:**

1. **Stellar Classic Asset**: The token is first issued as a standard Stellar asset (`TERWA` issued by the admin account). This ensures visibility in all Stellar wallets (Freighter, xBull, Lobstr, etc.) and block explorers without any special integration.
2. **SAC wrapping**: The Classic Asset is then wrapped via a Stellar Asset Contract (SAC), which gives the vault contract programmatic control over minting, burning, and transfer logic through Soroban.

**Key properties:**

- **Minted** on deposit, proportional to the current vault value.
- **Burned** on redemption or physical claim.
- **Transferable** on Stellar, enabling secondary market trading.
- The vault contract is set as the SAC admin, so only the vault can mint. No external minting is possible.

### 3.3 Off-chain Management Layer

A service layer that bridges on-chain vault state with real-world wine production assets.

- **Valuation**: Wine asset valuation is performed by independent wine appraisal experts on an annual basis. The valuation follows standard methods used in the wine industry (comparable sales, production cost, and cellaring potential). The appraised value is submitted on-chain by an authorized backend service via `report_rwa_value`. The valuation report is stored off-chain and referenced on-chain via the update timestamp.
- **Asset custody**: The production partner holds and manages the physical wine assets for the duration of the vault term.
- **Buyback guarantee**: The RWA provider commits to repurchase the underlying asset at vault maturity at no less than the original issuance price. This commitment is formalized in a legal engagement letter (available as a separate annex upon request).
- **Physical asset delivery**: An established supply chain is operational to fulfill physical wine asset claims. Upon a user's claim request, the logistics pipeline handles packaging, shipping, and delivery directly to the holder's preferred address.
- **Compliance**: KYC/AML requirements are handled off-chain. A legal framework is established with the RWA provider.
- **Audit trail**: All valuation submissions are recorded on-chain for transparency.

### 3.4 Web Platform

The TERWA web platform is the primary interface through which users interact with the vault. It is a publicly accessible website where users can connect their Stellar wallet, purchase TERWA tokens, monitor vault status, and exercise their rights at maturity.

**Core features:**

- **Wallet connection**: Users connect via Stellar Wallet Kit (Freighter, xBull, Lobstr, etc.). No account creation or email registration is required; the wallet address is the user's identity.
- **Presale purchase**: A guided flow to deposit USDC and receive TERWA tokens. Displays the current token price, vault term, maturity date, and buyback guarantee before confirmation.
- **Portfolio dashboard**: Shows the user's TERWA token balance, current appraised value per token, total portfolio value, and vault maturity countdown.
- **Vault overview**: Public page (no wallet required) displaying vault status, total deposits, number of token holders, latest valuation date, and maturity timeline.
- **Redemption (at maturity)**: When the vault reaches maturity, token holders can initiate a redemption to receive USDC proportional to the appraised vault value.
- **Physical claim (at maturity)**: Token holders can alternatively request delivery of the underlying physical wine asset. The platform collects delivery details and initiates the fulfillment pipeline.
- **Transaction history**: A record of the user's deposits, redemptions, and claims with links to on-chain transaction records (Stellar explorer).
- **Valuation transparency**: Displays the latest appraised value, valuation date, and methodology summary. Historical valuation updates are listed with on-chain references.

**Information pages:**

- **How it works**: Explains the presale model, token mechanics, maturity process, and physical claim option in plain language.
- **Buyback guarantee**: Describes the legally binding commitment from the RWA provider and references the legal engagement letter (annex available upon request).
- **FAQ**: Answers common questions about the vault term, token transferability, wallet compatibility, and redemption process.

---

## 4. Capital Flow

```
User purchases TERWA tokens with USDC
        |
        v
+--------------------+
| TERWA Vault        |
| Contract (Soroban) |
+--------+-----------+
         |
         |  1. Mint TERWA tokens to user (proof of ownership)
         |  2. Capital committed for vault term
         |
         v
+---------------------+
| Wine Production     |
| and Custody         |
| (off-chain)         |
|                     |
| - Asset held by     |
|   production partner|
| - Annual valuation  |
|   by independent    |
|   wine experts      |
+--------+------------+
         |
    [vault maturity]
         |
         v
   Buyback guarantee exercised
   (legal engagement with producer)
         |
         v
   Proceeds in USDC returned to vault
         |
         v
   Token holder redeems:
   -> USDC at appraised value
   OR
   -> physical wine asset
   -> delivery via established supply chain
```

---

## 5. Stellar Integration Details

### 5.1 Stablecoin Settlement

- All deposits and redemptions are settled in **USDC on Stellar**.
- The vault contract holds stablecoin balances directly via Soroban token interactions.
- Settlement is near-instant with Stellar's ~5-second finality.

### 5.2 Token Design (Classic Asset + SAC)

- The TERWA token is issued as a **Stellar Classic Asset**, making it natively visible in all Stellar wallets and explorers.
- The Classic Asset is wrapped via a **Stellar Asset Contract (SAC)** to enable Soroban smart contract interactions: programmatic minting on deposit, burning on redemption, and admin-controlled supply.
- This two-layer approach (Classic Asset + SAC) is the standard pattern for Soroban-compatible tokens on Stellar. It avoids creating a purely Soroban-native token that would be invisible to Classic wallets.

### 5.3 Soroban Smart Contracts

- Vault logic is implemented as a **Soroban smart contract** (Rust/no_std).
- Contract state stores: total deposits, oracle-reported RWA values, maturity timestamp, buyback price, and per-user token balances.

### 5.4 On-chain Transparency

- Vault value is computable at any time via `get_vault_value` (returns the latest appraised RWA value).
- All state transitions (deposits, redemptions, valuation updates, physical claims) emit **Soroban events** for indexing and auditing.

### 5.5 Wallet Integration

- The frontend uses **Stellar Wallet Kit** to support multiple Stellar wallets: Freighter, xBull, Lobstr, and others. This provides a unified connection interface rather than being locked to a single wallet provider.
- Contract invocation uses **`@stellar/stellar-sdk`** (JavaScript) for transaction building and submission.

### 5.6 Development Tooling

- **Scaffold Stellar** ([docs](https://developers.stellar.org/docs/tools/scaffold-stellar)) is used to bootstrap the Soroban project structure, generate contract templates, and streamline local development and testing.
- **`soroban-sdk`** (Rust) for contract development.
- **Stellar CLI** for contract deployment, invocation, and integration testing.

---

## 6. Transaction Lifecycle

### Deposit Flow (Presale Purchase)

1. User connects their Stellar wallet via Stellar Wallet Kit.
2. User approves a USDC transfer to the vault contract.
3. Vault contract receives USDC and calculates token mint amount based on current vault value.
4. TERWA tokens are minted and sent to the user's address (proof of ownership).
5. A `deposit` event is emitted on-chain.

### Redemption Flow (Maturity)

Redemptions are available at vault maturity. Before maturity, tokens represent a locked commitment.

**Maturity process:**

1. RWA provider's buyback guarantee is exercised (the underlying wine assets are liquidated at no less than the original issuance price).
2. Vault contract holds the proceeds in USDC.

**User redemption:**

1. User calls `redeem` on the vault contract.
2. Vault contract verifies maturity has been reached.
3. Vault contract calculates the user's share based on their token holdings and the appraised vault value.
4. Tokens are burned.
5. USDC is transferred to the user's address.
6. A `redeem` event is emitted on-chain.

### Physical Asset Claim Flow

1. At vault maturity, user calls `claim_physical` on the vault contract with their delivery details (stored as an off-chain encrypted hash).
2. Vault contract burns the user's TERWA tokens.
3. A `claim` event is emitted on-chain, triggering the off-chain fulfillment pipeline.
4. The existing supply chain processes the order: asset retrieval from custody, packaging, and shipment.
5. Physical wine asset is delivered directly to the user's preferred address.
6. Delivery confirmation is recorded off-chain and referenced on-chain via the delivery hash.

### Valuation Update Flow

1. Independent wine experts perform an annual appraisal of the underlying assets.
2. The backend service submits the updated valuation on-chain via `report_rwa_value`.
3. Contract updates stored RWA value and emits a `valuation` event.
4. Vault value is updated for display and future redemption calculations.

---

## 7. Open-Source Scope

The following components will be open-sourced under the project repository:

| Component | Status | Description |
|---|---|---|
| TERWA Vault Contract | Open-source | Core Soroban smart contract: deposits, redemptions, claims, lifecycle |
| Token Logic | Open-source | SAC-based token mint/burn logic |
| Contract Tests | Open-source | Unit and integration tests for all contract functions |
| Deployment Scripts | Open-source | Stellar CLI scripts for testnet and mainnet deployment |
| Valuation Oracle | Partial | On-chain submission interface is open-source; valuation source integration is private |

See [`TECHNICAL.md`](TECHNICAL.md) for repository structure, dependency versions, CI/CD pipeline, and deployment scripts.

---

## 8. Development Plan

The architecture maps directly to the following deliverables, scoped for Month 1 of development:

| Deliverable | Scope | Completion Criteria |
|---|---|---|
| **D1: Core Vault Contract** | Soroban contract: presale deposits, vault state, lifecycle management, maturity logic, valuation updates | Contract compiles and deploys locally. Deposit logic functional. Vault state readable on-chain. |
| **D2: TERWA Token** | Stellar Classic Asset + SAC wrapper representing proof of ownership over the underlying wine asset | Token issuance logic implemented. Vault mints tokens on deposit. User balances visible in Stellar wallets. |
| **D3: Web Platform** | User-facing website: wallet connection, presale purchase flow, portfolio dashboard, vault overview, redemption and physical claim interfaces, transaction history, valuation transparency | Platform deployed and accessible. Users can connect wallet, purchase tokens, and view vault status. Maturity flows (redeem, claim) functional. |

All components use established Stellar and Soroban primitives.

---

## 9. Phase 2 : Future Extensions

The following capabilities are planned for a second phase and are not part of the current MVP scope:

- **DeFi capital deployment**: Modular on-chain deployment of a portion of vault capital into whitelisted yield-generating strategies (lending, liquidity pools) on Stellar.
- **Cross-ecosystem bridges**: Enabling TERWA token visibility and trading on other blockchains.
- **Multi-asset vaults**: Extending the platform to support additional RWA asset classes beyond wine.

These extensions will be submitted as part of a future candidature (e.g., Stellar Integration Track) once the core tokenization platform is live.

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Valuation accuracy | Appraised value may not reflect actual market price | Independent wine experts with established methodology; annual updates; valuation reports available on request |
| Single RWA provider dependency | Buyback guarantee relies on one counterparty | Guarantee is formalized in a legal engagement letter (annex available); provider diversification planned for future vaults |
| Regulatory uncertainty | Tokenized wine assets may face jurisdiction-specific restrictions | KYC/AML handled off-chain; legal framework established with RWA provider |
| Locked capital risk | Users cannot exit before maturity | Lock period clearly communicated at purchase; vault term and maturity date stored on-chain and visible to all participants |
| Smart contract bugs | Loss of funds or incorrect accounting | Third-party contract audit planned before mainnet deployment; comprehensive test coverage (see [`TECHNICAL.md` §8](TECHNICAL.md#8-testing-strategy)) |

---

## 11. Readiness to Build

The architecture described in this document is finalized and ready for implementation.

For the full technology stack, build configuration, testing strategy, deployment pipeline, and cost estimation, see [`TECHNICAL.md`](TECHNICAL.md).

The team is prepared to begin development immediately upon grant approval.
