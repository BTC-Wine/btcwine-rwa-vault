# BTC Wine : Technical Architecture

## RWA Vault Infrastructure on Stellar

> **Companion document**: For implementation-level details including data model, dependencies, testing, deployment pipeline, and security -> see [`TECHNICAL.md`](TECHNICAL.md).
>
> This document represents preparatory architectural design completed ahead of development. It defines the system structure, component responsibilities, capital flow, and deliverable scope that will guide implementation once the project is funded.

---

## 1. Overview

BTC Wine is a Real-World Asset (RWA) vault built on the Stellar blockchain using Soroban smart contracts. The vault tokenizes wine production assets and enables capital-efficient liquidity allocation by splitting deposited capital between off-chain RWA management and on-chain DeFi capital deployment.

The vault operates on a **fixed-term lock model**. When users deposit stablecoins, their capital is locked for the duration of the vault term (until maturity). During this period, 100% of deposited capital is actively deployed (split between off-chain RWA assets and on-chain DeFi strategies according to the configured allocation ratio). This lock period is necessary to allow the RWA-backed assets to appreciate and the DeFi strategies to generate yield.

Depositors receive a Vault Participation Token representing their pro-rata share of the vault. All vault logic (deposits, token issuance, allocation ratios, and accounting) is handled transparently on-chain via Soroban.

At vault maturity, token holders have the option to either redeem their tokens for stablecoins or claim the underlying physical wine asset. An existing supply chain and logistics infrastructure is in place to handle direct delivery of physical assets to the holder's preferred address. There are no early withdrawals as capital remains deployed for the full vault term.

The RWA provider (wine production partner) issues a legally binding buyback guarantee, committing to repurchase the underlying asset at vault maturity at no less than the original issuance price. This provides a price floor for vault participants regardless of market conditions.

The architecture is designed so that the vault contract, token logic, and strategy interface can be reused for other RWA asset classes beyond wine.

---

## 2. High-Level Architecture Diagram

```
+---------------------+
|     End Users        |
|  (Stellar Wallets)   |
+----------+----------+
           |
           | Deposit stablecoin / Redeem tokens
           v
+---------------------+       +---------------------------+
|   RWA Vault Smart   |       |  Vault Participation      |
|   Contract (Soroban) | <---> |  Token (Stellar Asset)    |
+----------+----------+       +---------------------------+
           |
           | Capital allocation logic
           v
+---------------------+---------------------+
|                     |                     |
|  Off-chain RWA      |  On-chain Capital   |
|  Management Layer   |  Deployment Module  |
|                     |                     |
|  - Wine production  |  - Stellar-native   |
|    asset custody    |    liquidity pools  |
|  - Oracle reporting |  - Stablecoin       |
|  - Compliance       |    management       |
|  - Physical asset   |                     |
|    delivery (supply |                     |
|    chain in place)  |                     |
|                     |                     |
+---------------------+---------------------+
```

---

## 3. Core Components

### 3.1 RWA Vault Smart Contract (Soroban)

The central contract deployed on Stellar via Soroban. It manages:

- **Deposits**: Accepts stablecoins from users and mints Vault Participation Tokens. Capital is locked until vault maturity.
- **Lock period**: No early withdrawals. Deposited capital is fully deployed (RWA + DeFi) for the duration of the vault term.
- **Redemptions (maturity only)**: At vault maturity, burns tokens and returns the proportional share of vault assets. DeFi strategies are unwound and the RWA buyback guarantee is exercised to make capital available.
- **Physical asset claim**: At vault maturity, token holders can opt to receive the underlying physical wine asset instead of stablecoin redemption.
- **Allocation ratio**: Configurable split (e.g. 50% RWA / 50% DeFi) stored as contract state. 100% of capital is allocated.
- **Accounting**: Tracks total deposits, total vault value, and per-user balances on-chain.
- **Admin controls**: Authorized addresses can update allocation ratios and trigger rebalancing.

**Contract interface (simplified):**

```rust
pub trait RwaVaultTrait {
    fn initialize(env: Env, admin: Address, vault_token: Address, stablecoin: Address,
        oracle: Address, alloc_rwa_bps: u32, alloc_onchain_bps: u32,
        maturity_timestamp: u64, buyback_price: i128) -> Result<(), VaultError>;
    fn deposit(env: Env, user: Address, amount: i128) -> Result<i128, VaultError>;
    fn redeem(env: Env, user: Address, token_amount: i128) -> Result<i128, VaultError>;
    fn claim_physical(env: Env, user: Address, token_amount: i128,
        delivery_hash: BytesN<32>) -> Result<(), VaultError>;
    fn get_vault_value(env: Env) -> i128;
    fn get_allocation_ratio(env: Env) -> (u32, u32);
    fn set_allocation_ratio(env: Env, admin: Address, rwa_bps: u32,
        onchain_bps: u32) -> Result<(), VaultError>;
    fn report_rwa_value(env: Env, oracle: Address, value: i128) -> Result<(), VaultError>;
    fn add_strategy(env: Env, admin: Address, strategy: Address) -> Result<(), VaultError>;
    fn deploy_to_strategy(env: Env, admin: Address, strategy: Address,
        amount: i128) -> Result<i128, VaultError>;
    fn withdraw_from_strategy(env: Env, admin: Address, strategy: Address,
        amount: i128) -> Result<i128, VaultError>;
}
```

For the full interface with doc comments, data model, error codes, and event definitions, see [`TECHNICAL.md` §3](TECHNICAL.md#3-soroban-contract--data-model).

### 3.2 Vault Participation Token

A Stellar asset (SAC = Stellar Asset Contract) representing a user's share in the vault.

- **Minted** on deposit, proportional to the current vault NAV.
- **Burned** on redemption.
- **Transferable** on Stellar, enabling secondary market liquidity.
- Managed via Soroban's token interface for seamless integration with wallets and explorers.

### 3.3 Capital Allocation Module

A configurable module within the vault contract that determines how deposited capital is split:

```
+---------------------------+
|   Total Vault Deposits    |
|   (locked until maturity) |
+-------------+-------------+
              |
     +--------+--------+
     |                 |
     v                 v
+---------+     +-----------+
| RWA     |     | DeFi      |
| Portion |     | Portion   |
| (e.g.50%)|    | (e.g.50%) |
+---------+     +-----------+
     |                 |
     v                 v
 Wine asset       Whitelisted
 appreciation     yield strategies
     |                 |
     +--------+--------+
              |
              v
     At maturity:
     capital returned
     to vault for
     user redemption
```

- **RWA portion**: Allocated to off-chain wine production assets via the management layer. Capital works for the full vault term, allowing asset appreciation.
- **DeFi portion**: Deployed into whitelisted on-chain strategies for yield generation.
- **Rebalancing**: Admin-triggered or threshold-based rebalancing when ratios drift beyond tolerance.
- **No early exit**: All capital remains deployed until vault maturity. This is required for both RWA asset management and DeFi yield generation.

### 3.4 DeFi Capital Deployment Module

The on-chain portion of vault capital is managed by a modular deployment component that deploys the full DeFi allocation into yield-generating strategies.

**Design principles:**

- **Whitelisted strategies only** : the vault admin maintains a list of approved strategy contract addresses. No arbitrary external calls.
- **Modular strategy interface** : each strategy implements a common trait (`deploy`, `withdraw`, `get_deployed_value`), allowing new strategies to be added without modifying the vault contract.
- **Full deployment** : the entire DeFi allocation is deployed into strategies. The fixed-term lock means no early redemptions are possible, so no reserve is needed.
- **On-chain accounting** : the vault tracks the amount deployed to each strategy. `get_vault_value` sums all deployed strategy valuations plus the oracle-reported RWA value.
- **Maturity unwind** : at vault maturity, the admin withdraws all deployed capital from strategies back to the vault contract, making it available for user redemptions.

**Strategy interface:**

```rust
pub trait DeploymentStrategy {
    /// Deploy USDC into this strategy. Returns the amount accepted.
    fn deploy(env: Env, admin: Address, amount: i128) -> Result<i128, VaultError>;

    /// Withdraw USDC from this strategy. Returns the amount returned.
    fn withdraw(env: Env, admin: Address, amount: i128) -> Result<i128, VaultError>;

    /// Current value of assets deployed in this strategy (in USDC terms).
    fn get_deployed_value(env: Env) -> i128;
}
```

**Vault accounting with deployment:**

```
Vault NAV = sum(strategy.get_deployed_value() for each active strategy)
          + oracle_reported_rwa_value
```

For the MVP, the deployment module will be implemented with a mock/test strategy to validate the accounting and allocation enforcement logic. Production strategies (e.g. Stellar AMM LP positions, lending protocols) will be integrated post-MVP based on available Stellar DeFi infrastructure.

### 3.5 Off-chain RWA Management Layer

A service layer that bridges on-chain vault state with real-world wine production assets.

- **Oracle reporting**: Periodically submits the current valuation of off-chain RWA holdings to the vault contract via `report_rwa_value`.
- **Asset custody**: Interfaces with custodians managing physical wine production assets.
- **Buyback guarantee**: The RWA provider (wine producer) commits via a legally activatable guarantee to buy back the underlying asset at vault maturity at a minimum price equal to the original issuance price. This guarantee is referenced on-chain as part of the vault metadata and serves as a price floor for all vault participants.
- **Physical asset delivery**: An established supply chain is already operational to fulfill physical wine asset claims. Upon a user's claim request, the logistics pipeline handles packaging, shipping, and delivery directly to the holder's preferred address.
- **Compliance**: Handles KYC/AML requirements for off-chain asset management.
- **Audit trail**: All oracle submissions are recorded on-chain for transparency.

---

## 4. Capital Flow Diagram

```
User deposits USDC (Stellar)
        |
        v
+-------------------+
| RWA Vault Contract|
| (Soroban)         |
+--------+----------+
         |
         |  1. Mint Vault Participation Tokens to user
         |  2. Apply allocation ratio
         |  3. Capital locked until maturity
         |
    +----+----+
    |         |
    v         v
+-------+  +--------+
| RWA   |  | DeFi   |
| Alloc |  | Alloc  |
+---+---+  +----+----+
    |            |
    v            v
Off-chain    Whitelisted
wine asset   yield
appreciation strategies
    |            |
    +-----+------+
          |
    [vault maturity]
          |
          v
   Admin unwinds strategies
   + exercises RWA buyback
          |
          v
   Combined proceeds in USDC
          |
          v
   User redeems tokens
   → receives USDC proportional to NAV
   OR
   → claims physical wine asset
   → delivery via existing supply chain
```

---

## 5. Stellar Integration Details

### 5.1 Stablecoin Settlement

- All deposits and redemptions are settled in **USDC on Stellar**.
- The vault contract holds stablecoin balances directly via Soroban token interactions.
- Settlement is near-instant with Stellar's ~5-second finality.

### 5.2 Soroban Smart Contracts

- Vault logic is implemented as a **Soroban smart contract** (Rust/no_std).
- The Vault Participation Token uses the **Stellar Asset Contract (SAC)** standard for native wallet compatibility.
- Contract state stores: total deposits, allocation ratios, oracle-reported RWA values, and per-user token balances.

### 5.3 On-chain Transparency and Accounting

- Vault NAV is computable at any time: `deployed DeFi strategy values + last reported RWA value`.
- All state transitions (deposits, redemptions, rebalances, oracle updates) emit **Soroban events** for indexing and auditing.
- A public read function (`get_vault_value`) allows anyone to query the current vault state.

### 5.4 Development Tooling

- **Scaffold Stellar** ([docs](https://developers.stellar.org/docs/tools/scaffold-stellar)) is used to bootstrap the Soroban project structure, generate contract templates, and streamline local development and testing.
- **`@stellar/stellar-sdk`** (JavaScript) for frontend contract invocation and **`soroban-sdk`** (Rust) for contract development.
- **Stellar CLI** for contract deployment, invocation, and integration testing.

---

## 6. Transaction Lifecycle

### Deposit Flow

1. User connects Stellar wallet to the vault frontend.
2. User approves a stablecoin transfer to the vault contract.
3. Vault contract receives stablecoins and calculates token mint amount based on current NAV.
4. Vault Participation Tokens are minted and sent to the user's address.
5. Capital Allocation Module distributes the deposit according to the configured ratio.
6. A `deposit` event is emitted on-chain.

### Redemption Flow

Redemptions are only available at vault maturity. Before maturity, all capital is locked and actively deployed.

**Maturity unwind process (admin-initiated):**

1. Admin withdraws all deployed capital from DeFi strategies back to the vault contract.
2. RWA provider's buyback guarantee is exercised (the underlying wine assets are liquidated at no less than the original issuance price).
3. Vault contract now holds the combined proceeds (DeFi returns + RWA buyback proceeds) in USDC.

**User redemption (post-unwind):**

1. User calls `redeem` on the vault contract.
2. Vault contract verifies maturity has been reached (`env.ledger().timestamp() >= VaultMaturity`).
3. Vault contract calculates the proportional share of vault NAV based on the user's token holdings.
4. Tokens are burned.
5. Stablecoins are transferred to the user's address.
6. A `redeem` event is emitted on-chain.

### Physical Asset Claim Flow

1. At vault maturity, user calls `claim_physical` on the vault contract with their delivery details (stored as an off-chain encrypted hash).
2. Vault contract burns the user's Vault Participation Tokens.
3. A `claim_physical` event is emitted on-chain, triggering the off-chain fulfillment pipeline.
4. The existing supply chain processes the order: asset retrieval from custody, packaging, and shipment.
5. Physical wine asset is delivered directly to the user's preferred address.
6. Delivery confirmation is recorded off-chain and referenced on-chain via the delivery hash.

### Oracle Update Flow

1. Off-chain management layer computes current RWA valuation.
2. Authorized oracle address calls `report_rwa_value` on the vault contract.
3. Contract updates stored RWA value and emits an `oracle_update` event.
4. Vault NAV is recalculated for subsequent deposits and redemptions.

---

## 7. Open-Source Scope

The following components will be open-sourced under the project repository:

| Component | Status | Description |
|---|---|---|
| RWA Vault Contract | Open-source | Core Soroban smart contract with deposit, redeem, and allocation logic |
| Vault Token Logic | Open-source | SAC-based participation token mint/burn logic |
| Allocation Module | Open-source | Configurable capital split logic |
| Contract Tests | Open-source | Unit and integration tests for all contract functions |
| DeFi Deployment Module | Open-source | Modular strategy interface and accounting logic |
| Deployment Scripts | Open-source | Stellar CLI scripts for testnet and mainnet deployment |
| Off-chain Oracle | Partial | Oracle interface is open-source; custodian integrations are private |

See [`TECHNICAL.md`](TECHNICAL.md) for repository structure, dependency versions, CI/CD pipeline, and deployment scripts.

---

## 8. Development Plan

The architecture maps directly to the following deliverables, scoped for Month 1 of development:

| Deliverable | Scope | Completion Criteria |
|---|---|---|
| **D1: Core RWA Vault Contract** | Soroban contract: deposits, vault state, lifecycle management, allocation logic between RWA and on-chain deployment | Contract compiles and deploys locally. Deposit logic functional. Allocation parameters configurable. Vault state readable on-chain. |
| **D2: Vault Participation Token** | SAC-based token representing proportional vault exposure | Token issuance logic implemented. Vault distributes tokens on deposit. User balances visible on Stellar. |
| **D3: DeFi Capital Deployment Module (MVP)** | Modular on-chain capital deployment into whitelisted strategies | Deployment module implemented (mock/test strategy). Allocation logic enforced by vault. On-chain accounting of deployed funds available. |

The modular architecture enables parallel development across all three deliverables. All components use established Stellar and Soroban primitives.

---

## 9. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Oracle single point of failure | Stale or incorrect NAV if oracle goes down | Stale valuation detection on frontend; multi-sig oracle upgrade planned for mainnet |
| Single RWA provider dependency | Buyback guarantee relies on one counterparty | Guarantee is legally binding and referenced on-chain; provider diversification planned for future vaults |
| Regulatory uncertainty | Tokenized wine assets may face jurisdiction-specific restrictions | KYC/AML handled off-chain; legal framework established with RWA provider (available upon request) |
| Stellar DeFi liquidity constraints | Limited strategy options for on-chain capital deployment | MVP uses mock strategy; production strategies added incrementally as Stellar DeFi matures |
| Locked capital risk | Users cannot exit before maturity | Lock period is clearly communicated at deposit time; vault term and maturity date are stored on-chain and visible to all participants |
| Smart contract bugs | Loss of funds or incorrect accounting | Third-party contract audit planned before mainnet deployment; comprehensive test coverage (see [`TECHNICAL.md` §8](TECHNICAL.md#8-testing-strategy)) |

---

## 10. Readiness to Build

The architecture described in this document is finalized and ready for implementation.

For the full technology stack, build configuration, testing strategy, deployment pipeline, and cost estimation, see [`TECHNICAL.md`](TECHNICAL.md).

The team is prepared to begin development immediately upon grant approval.
