# BTC Wine : Technical Implementation Specification

## Soroban RWA Vault : Implementation Details

> **Companion document**: For high-level architecture, capital flow diagrams, Stellar integration overview, and transaction lifecycle, see [`ARCHITECTURE.md`](ARCHITECTURE.md).
>
> This document represents preparatory design work completed ahead of development. It defines the data model, contract interface, tooling choices, and testing strategy that will serve as the foundation for implementation once the project is funded.

---

## 1. Technology Stack

| Layer | Technology | Version / Notes |
|---|---|---|
| Smart contracts | Soroban SDK (Rust) | `soroban-sdk 25.x` / `no_std` |
| Token standard | Stellar Asset Contract (SAC) | Native Soroban token interface |
| Blockchain | Stellar Mainnet / Testnet | Horizon API + Soroban RPC |
| Stablecoin | USDC (Centre) on Stellar | Stellar classic asset, wrapped via SAC for Soroban |
| Backend API | Rust (Axum) | Oracle service, event indexer |
| Frontend | Next.js 14 + TypeScript | App router, server components |
| Wallet integration | Freighter SDK / WalletConnect | `@stellar/freighter-api` |
| Stellar SDK | `@stellar/stellar-sdk` (JS) | Contract invocation from frontend |
| Dev tooling | Scaffold Stellar | Project bootstrap, local sandbox |
| Testing | `soroban-sdk::testutils` + Stellar CLI | Unit, integration, testnet e2e |
| CI/CD | GitHub Actions | Build, test, deploy pipeline |
| Indexer | Stellar Horizon + custom event listener | Soroban event subscription |
| Storage | PostgreSQL | Off-chain state: delivery records, oracle history |
| Containerization | Docker + Docker Compose | All services |

---

## 2. Repository Structure

Planned repository layout:

```
btcwine/
├── contracts/
│   ├── rwa-vault/
│   │   ├── src/
│   │   │   ├── lib.rs              # Contract entry point
│   │   │   ├── vault.rs            # Core vault logic
│   │   │   ├── allocation.rs       # Capital allocation module
│   │   │   ├── oracle.rs           # Oracle update handler
│   │   │   ├── claim.rs            # Physical asset claim logic
│   │   │   ├── storage.rs          # Storage keys + data types
│   │   │   ├── errors.rs           # Contract error codes
│   │   │   └── events.rs           # Event emission helpers
│   │   ├── Cargo.toml
│   │   └── src/test.rs             # Unit tests
│   └── vault-token/
│       ├── src/
│       │   ├── lib.rs              # SAC token wrapper
│       │   └── metadata.rs         # Token name, symbol, decimals
│       └── Cargo.toml
├── backend/
│   ├── src/
│   │   ├── main.rs                 # Axum server entry
│   │   ├── oracle.rs               # Oracle submission service
│   │   ├── indexer.rs              # Soroban event listener
│   │   └── delivery.rs            # Physical claim fulfillment
│   └── Cargo.toml
├── frontend/
│   ├── app/                        # Next.js app router
│   ├── lib/
│   │   ├── stellar.ts              # Stellar SDK wrapper
│   │   ├── contracts.ts            # Contract call helpers
│   │   └── wallet.ts               # Freighter integration
│   ├── package.json
│   └── tsconfig.json
├── scripts/
│   ├── deploy.sh                   # Stellar CLI deploy script
│   ├── initialize.sh               # Post-deploy initialization
│   └── testnet-fund.sh             # Friendbot funding
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── ARCHITECTURE.md
├── TECHNICAL.md
└── README.md
```

### 2.1 Contract Dependencies (`Cargo.toml`)

```toml
[package]
name = "rwa-vault"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = "25.1.0"
soroban-token-sdk = "25.1.0"

[dev-dependencies]
soroban-sdk = { version = "25.1.0", features = ["testutils"] }

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true
```

---

## 3. Soroban Contract : Data Model

### 3.1 Storage Keys

```rust
use soroban_sdk::{contracttype, Address, BytesN};

#[contracttype]
pub enum DataKey {
    Admin,                          // Address -> contract admin
    VaultToken,                     // Address -> SAC token contract id
    Stablecoin,                     // Address -> USDC contract id
    TotalDeposits,                  // i128 -> total stablecoin deposited
    RwaValue,                       // i128 -> last oracle-reported RWA valuation
    AllocRwa,                       // u32 -> RWA allocation percentage (basis points)
    AllocOnchain,                   // u32 -> on-chain allocation percentage (basis points)
    OracleAddr,                     // Address -> authorized oracle
    BuybackPrice,                   // i128 -> minimum buyback price per token (issuance price)
    VaultMaturity,                  // u64 -> ledger timestamp of vault maturity
    UserBalance(Address),           // i128 -> per-user token balance (redundant w/ SAC, used for claim tracking)
    ClaimRequest(Address),          // ClaimData -> pending physical asset claims
    StrategyWhitelist,              // Vec<Address> -> approved DeFi strategy contract addresses
    DeployedAmount(Address),        // i128 -> amount deployed to a specific strategy
}

#[contracttype]
pub struct ClaimData {
    pub amount: i128,
    pub delivery_hash: BytesN<32>,  // SHA-256 of encrypted delivery details
    pub timestamp: u64,
    pub fulfilled: bool,
}
```

### 3.2 Error Codes

```rust
use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VaultError {
    NotAuthorized = 1,
    InsufficientBalance = 2,
    VaultNotMature = 3,
    VaultAlreadyMature = 4,
    InvalidAllocation = 5,      // rwa + onchain != 10000 bps
    ZeroAmount = 6,
    OracleNotAuthorized = 7,
    ClaimAlreadyPending = 8,
    VaultLocked = 9,                // attempted redemption before maturity
    InvalidDeliveryHash = 10,
    StrategyNotWhitelisted = 11,
}
```

### 3.3 Contract Interface

The vault contract exposes the following public interface. All functions use Soroban's `require_auth()` model for caller verification.

```rust
#![no_std]
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env};

#[contract]
pub struct RwaVault;

pub trait RwaVaultTrait {
    /// One-time setup: stores admin, token addresses, oracle, allocation split,
    /// maturity timestamp, and buyback floor price. Validates that allocation
    /// percentages sum to 10000 basis points.
    fn initialize(
        env: Env, admin: Address, vault_token: Address, stablecoin: Address,
        oracle: Address, alloc_rwa_bps: u32, alloc_onchain_bps: u32,
        maturity_timestamp: u64, buyback_price: i128,
    ) -> Result<(), VaultError>;

    /// Transfers USDC from user to vault, calculates mint amount based on
    /// current NAV and total token supply, mints BTWINE tokens to user.
    /// First deposit uses 1:1 ratio. Subsequent deposits: (amount * supply) / NAV.
    /// Reverts with VaultAlreadyMature if called after vault maturity.
    fn deposit(env: Env, user: Address, amount: i128) -> Result<i128, VaultError>;

    /// Available at vault maturity only. Burns user's vault tokens, calculates
    /// pro-rata share of NAV, transfers USDC back. Reverts with VaultLocked
    /// if called before maturity. Requires admin to unwind DeFi strategies
    /// and exercise RWA buyback before users can redeem.
    fn redeem(env: Env, user: Address, token_amount: i128) -> Result<i128, VaultError>;

    /// Available at vault maturity only. Burns tokens and stores a ClaimData
    /// record with the delivery hash. Triggers off-chain fulfillment pipeline.
    fn claim_physical(
        env: Env, user: Address, token_amount: i128, delivery_hash: BytesN<32>,
    ) -> Result<(), VaultError>;

    /// Restricted to authorized oracle address. Updates the stored RWA
    /// valuation used in NAV calculation.
    fn report_rwa_value(env: Env, oracle: Address, value: i128) -> Result<(), VaultError>;

    /// Returns deployed strategy values + oracle-reported RWA value.
    fn get_vault_value(env: Env) -> i128;

    /// Admin-only. Updates RWA/on-chain split. Must sum to 10000 bps.
    fn set_allocation_ratio(
        env: Env, admin: Address, rwa_bps: u32, onchain_bps: u32,
    ) -> Result<(), VaultError>;

    fn get_allocation_ratio(env: Env) -> (u32, u32);

    /// Admin-only. Adds a strategy contract to the whitelist.
    fn add_strategy(env: Env, admin: Address, strategy: Address) -> Result<(), VaultError>;

    /// Admin-only. Deploys the DeFi allocation into a whitelisted strategy.
    fn deploy_to_strategy(
        env: Env, admin: Address, strategy: Address, amount: i128,
    ) -> Result<i128, VaultError>;

    /// Admin-only. Withdraws USDC from a deployed strategy back to the vault contract.
    fn withdraw_from_strategy(
        env: Env, admin: Address, strategy: Address, amount: i128,
    ) -> Result<i128, VaultError>;
}
```

Each DeFi strategy contract implements the `DeploymentStrategy` trait (see [`ARCHITECTURE.md` §3.4](ARCHITECTURE.md#34-defi-capital-deployment-module) for the interface and design principles).

**Key implementation decisions:**

- **NAV calculation**: `get_vault_value` sums `DeployedAmount` for each active strategy and adds the oracle-reported RWA value from storage. During the vault term, all capital is deployed.
- **Token minting**: Uses `token::StellarAssetClient::mint()` and requires the vault contract to be set as the SAC token admin during deployment.
- **Lock period**: Both `redeem` and `claim_physical` check `env.ledger().timestamp()` against the stored `VaultMaturity` value. `redeem` reverts with `VaultLocked` and `claim_physical` reverts with `VaultNotMature` if called before maturity.
- **Maturity unwind**: Before users can redeem, the admin must withdraw all deployed capital from DeFi strategies and the RWA buyback must be exercised, returning USDC to the vault contract.

---

## 4. Soroban Event Definitions

All state mutations emit structured events via `env.events().publish()` for indexing and auditing. Events use `symbol_short!()` topics (max 9 characters) per Soroban constraints.

| Event | Topic | Payload |
|---|---|---|
| Deposit | `"deposit"` + user address | `(amount, tokens_minted)` |
| Redeem | `"redeem"` + user address | `(tokens_burned, payout)` |
| Physical claim | `"claim"` + user address | `(amount, delivery_hash)` |
| Oracle update | `"oracle"` + oracle address | `value` |
| Strategy deploy | `"deploy"` + strategy address | `amount` |
| Strategy withdraw | `"withdraw"` + strategy address | `amount` |

---

## 5. Vault Token : SAC Configuration

The Vault Participation Token is a Stellar Asset Contract (SAC) wrapped for Soroban.

```bash
# Deploy SAC for the vault token
stellar contract asset deploy \
  --asset BTWINE:GADMIN...  \
  --network testnet \
  --source admin-key

# The returned contract ID is stored in the vault as DataKey::VaultToken
```

**Token metadata:**

| Field | Value |
|---|---|
| Name | `BTC Wine Vault Token` |
| Symbol | `BTWINE` |
| Decimals | `7` (Stellar standard) |
| Issuer | Vault admin address |
| Mint authority | Vault contract (set via `set_admin`) |

The vault contract is set as the token's admin so it can mint on deposit and burn on redeem. No other address can mint.

---

## 6. Frontend : Wallet Integration

The frontend is a Next.js 14 application using `@stellar/stellar-sdk` for contract invocation and `@stellar/freighter-api` for wallet connection.

**Planned integration pattern:**

- **Wallet connection**: Freighter SDK detects wallet availability, retrieves user address and network.
- **Contract calls (write)**: Build transaction → simulate via Soroban RPC (`prepareTransaction`) → sign with Freighter → submit via `sendTransaction`. This is the standard Soroban contract invocation flow.
- **Contract calls (read-only)**: Use `simulateTransaction` for functions like `get_vault_value` and `get_allocation_ratio` (no signing required or fees incurred).
- **Parameter encoding**: User addresses and amounts are encoded as `ScVal` types using the Stellar SDK's built-in conversion utilities.

---

## 7. Oracle Service : Backend

The oracle is a backend service (Rust/Axum) responsible for bridging off-chain RWA valuations to the vault contract.

**Architecture:**

- Runs as a scheduled job (cron-based, configurable interval, default daily)
- Fetches current wine asset valuation from an internal custody/management API
- Builds a Soroban transaction invoking `report_rwa_value` on the vault contract
- Signs with the authorized oracle keypair and submits via Soroban RPC
- Logs all submissions to PostgreSQL for audit trail

**Transaction submission uses the Stellar CLI under the hood:**

```bash
# Oracle submits updated RWA valuation
stellar contract invoke \
  --id $VAULT_CONTRACT_ID \
  --network testnet \
  --source oracle-key \
  -- report_rwa_value \
  --oracle $ORACLE_ADDR \
  --value 5000000000000
```

**Failure handling:**

- Retries with exponential backoff on RPC errors
- Alerts on consecutive failures (webhook-based)
- Stale valuation detection: frontend displays last oracle update timestamp

The frontend and backend are independent services. The frontend reads vault state directly from the contract via Soroban RPC simulation. The backend's only on-chain role is oracle submission and event indexing.

---

## 8. Testing Strategy

### 8.1 Unit Tests (Soroban)

All contract functions are tested using `soroban-sdk::testutils` with `Env::default()` and `mock_all_auths()`. Tests are organized by function:

| Test Case | What It Validates |
|---|---|
| `test_deposit_first_user` | First deposit mints 1:1, vault value equals deposit amount |
| `test_deposit_proportional` | Subsequent deposits mint tokens proportional to current NAV |
| `test_redeem_full` | Full redemption at maturity returns exact deposited amount (single user) |
| `test_redeem_partial` | Partial redemption at maturity returns correct pro-rata share |
| `test_redeem_before_maturity` | Reverts with `VaultLocked` when called before maturity timestamp |
| `test_claim_before_maturity` | Reverts with `VaultNotMature` when called before maturity timestamp |
| `test_claim_after_maturity` | Succeeds after advancing ledger timestamp past maturity |
| `test_oracle_authorized` | Authorized oracle can update RWA value |
| `test_oracle_unauthorized` | Unauthorized address is rejected with `OracleNotAuthorized` |
| `test_allocation_valid` | Accepts ratio that sums to 10000 bps |
| `test_allocation_invalid` | Rejects ratio that doesn't sum to 10000 bps |
| `test_admin_only_functions` | Non-admin cannot call `set_allocation_ratio` |
| `test_deploy_to_strategy` | Deploys DeFi allocation to a whitelisted mock strategy; updates deployed accounting |
| `test_deploy_non_whitelisted` | Rejects deployment to a non-whitelisted strategy address |
| `test_withdraw_from_strategy` | Withdraws from strategy at maturity unwind; deployed amount decreases, USDC returned to vault |
| `test_nav_includes_deployed` | `get_vault_value` returns deployed strategy values + RWA value correctly |

Tests use `env.ledger().with_mut()` to manipulate timestamps for maturity testing, and `Address::generate()` for isolated test accounts.

```bash
# Run all contract unit tests
cd contracts/rwa-vault
cargo test
```

### 8.2 Integration Tests (Stellar CLI)

```bash
# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/rwa_vault.wasm \
  --network testnet \
  --source admin-key

# Initialize vault
stellar contract invoke \
  --id $VAULT_CONTRACT_ID \
  --network testnet \
  --source admin-key \
  -- initialize \
  --admin $ADMIN_ADDR \
  --vault_token $TOKEN_CONTRACT_ID \
  --stablecoin $USDC_CONTRACT_ID \
  --oracle $ORACLE_ADDR \
  --alloc_rwa_bps 5000 \
  --alloc_onchain_bps 5000 \
  --maturity_timestamp 1750000000 \
  --buyback_price 10000000

# Test deposit
stellar contract invoke \
  --id $VAULT_CONTRACT_ID \
  --network testnet \
  --source user-key \
  -- deposit \
  --user $USER_ADDR \
  --amount 1000000000

# Query vault value
stellar contract invoke \
  --id $VAULT_CONTRACT_ID \
  --network testnet \
  -- get_vault_value
```

---

## 9. Deployment Pipeline

### 9.1 Build

```bash
# Compile Soroban contract to WASM
cd contracts/rwa-vault
cargo build --target wasm32-unknown-unknown --release

# Optimize WASM binary
stellar contract optimize \
  --wasm target/wasm32-unknown-unknown/release/rwa_vault.wasm
```

### 9.2 Deploy Sequence

```
1. Deploy BTWINE SAC token
   └─> get TOKEN_CONTRACT_ID

2. Deploy RWA Vault contract
   └─> get VAULT_CONTRACT_ID

3. Call vault.initialize(
     admin, TOKEN_CONTRACT_ID, USDC_CONTRACT_ID,
     oracle_addr, 5000, 5000, maturity_ts, buyback_price
   )

4. Set vault contract as token admin
   └─> stellar contract invoke --id TOKEN_CONTRACT_ID -- set_admin --new_admin VAULT_CONTRACT_ID

5. Verify: call get_vault_value, get_allocation_ratio
```

### 9.3 CI/CD (GitHub Actions)

Planned pipeline triggered on push and pull request:

- **Install Rust** with `wasm32-unknown-unknown` target
- **Cache** Cargo registry and Stellar CLI binary to avoid rebuilds
- **Install Stellar CLI** via `cargo install --locked stellar-cli --features opt` (conditional, skipped if cached)
- **Build contracts** to WASM (`cargo build --target wasm32-unknown-unknown --release`)
- **Run unit tests** (`cargo test`)
- **Deploy to testnet** (main branch only, using stored secret key)

---

## 10. Security Considerations

| Concern | Mitigation |
|---|---|
| Unauthorized minting | Only vault contract is SAC admin (no external mint possible) |
| Oracle manipulation | Single authorized oracle address; multi-sig upgrade planned for mainnet |
| Reentrancy | Soroban execution model is non-reentrant by design |
| Storage exhaustion | Use `persistent` storage for user data with TTL; `instance` for global config |
| Admin key compromise | Multi-sig admin via Stellar multi-sig accounts; timelocked admin changes planned |
| Stablecoin depegging | Vault denominated in USDC units; NAV calculation is stablecoin-native |
| Physical claim fraud | Delivery hash links on-chain claim to off-chain fulfillment record; dispute resolution handled off-chain |
| DeFi strategy risk | Whitelisted strategies only; admin-controlled deployment; capital locked for full term |
| Locked capital risk | Lock period clearly communicated at deposit; vault term and maturity date stored on-chain and visible to all participants |

A third-party smart contract audit is planned before mainnet deployment.

---

## 11. Soroban-Specific Implementation Notes

- **Storage types**: `instance()` for global vault config (extends with contract TTL), `persistent()` for per-user data (requires explicit TTL extension).
- **Auth model**: `require_auth()` on every user-facing function. Admin functions check stored admin address.
- **Token interaction**: All token ops go through `token::Client` (transfers) and `token::StellarAssetClient` (mint/burn). USDC is a classic Stellar asset accessed via its SAC wrapper.
- **Gas optimization**: Minimize storage reads by batching related reads. Use `unwrap_or` defaults to avoid unnecessary storage lookups.
- **WASM size**: Target < 64KB optimized. Use `soroban contract optimize` post-build. Avoid heavy dependencies.
- **Upgradability**: Contract supports `update_wasm` via admin for post-deploy patches. Upgrade path: deploy new WASM → admin calls update → state preserved.

### 11.1 Storage TTL Management

Soroban storage entries have a time-to-live (TTL) measured in ledgers. Entries that are not extended before expiry are archived and become inaccessible.

| Storage Type | Used For | TTL Strategy |
|---|---|---|
| `instance()` | Vault config (admin, token addresses, allocation ratios, maturity) | Extended on every contract invocation via `env.storage().instance().extend_ttl()`. Lifetime tied to contract activity. |
| `persistent()` | Per-user data (`UserBalance`, `ClaimRequest`, `DeployedAmount`) | Extended on each user interaction (deposit, redeem, claim). Minimum TTL set to 120 days (~2,073,600 ledgers at 5s/ledger). |
| `temporary()` | Not used | N/A |

The `deposit` and `redeem` functions call `extend_ttl()` on both the instance storage and the caller's persistent entries as part of the transaction. This ensures active users never have their data archived. Dormant entries (users who deposited but haven't interacted) are extended by a background maintenance job that bumps TTLs for all known persistent keys on a weekly schedule.

---

## 12. Cost Estimation

Approximate transaction costs on Stellar (as of current fee model):

| Operation | Estimated Cost | Notes |
|---|---|---|
| Contract deployment | ~10-20 XLM | One-time WASM upload + install |
| `initialize` | ~0.01 XLM | Single invocation, writes 10 instance keys |
| `deposit` | ~0.01-0.02 XLM | Token transfer + mint + storage writes |
| `redeem` | ~0.01-0.02 XLM | Token burn + transfer + storage reads |
| `claim_physical` | ~0.01 XLM | Token burn + persistent storage write |
| `report_rwa_value` | ~0.005 XLM | Single storage write |
| Storage rent (per user entry) | ~0.004 XLM/year | Per persistent key, based on entry size (~100 bytes) |

Stellar base fees are low (~100 stroops per operation). The majority of cost comes from Soroban resource fees (CPU, memory, storage reads/writes). All estimates assume current testnet pricing and may vary on mainnet.

For a vault with 1,000 active users and daily oracle updates, estimated annual on-chain operating cost is < 50 XLM.
