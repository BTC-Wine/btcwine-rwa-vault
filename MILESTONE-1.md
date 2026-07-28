# TERWA : Milestone 1 (MVP) Delivery Report

Date: 3 July 2026
Network: Stellar Testnet
Live platform: https://terwa.netlify.app

## Summary

Milestone 1 delivers the complete tokenized wine presale MVP described in the
funded architecture: the Soroban vault contracts (D1), the TERWA tokens as
Stellar Classic Assets wrapped via SAC (D2), and the public web platform (D3).
Everything below is deployed, functional, and independently verifiable on the
Stellar testnet.

Product summary: buyers pre-order allocations of the cuvee "Les Demoiselles"
(Chateau Coutet, Saint-Emilion Grand Cru). One allocation = 15 bottles, three
per vintage across five consecutive vintages (2025-2029). Each vintage is
backed by its own vault with its own maturity (bottles of vintage N become
available by 1 June of N+2). At each maturity, holders choose physical
delivery, free resale of their certificates, or the producer repurchase.

## Deliverables against acceptance criteria

### D1 : Core Vault Contract

| Criterion | Status |
|---|---|
| Contract compiles and deploys | Done. Five vault instances (one per vintage) deployed on testnet |
| Deposit logic functional | Done. Purchases verified on-chain, in USDC and in XLM (converted client side via native path payments) |
| Vault state readable on-chain | Done. State, supply, price, maturity and valuation readable via simulation |

Implementation notes: fixed-price minting (1 token = 1 lot of 3 bottles),
whole-allocation purchases enforced atomically across the five vaults by a
dedicated sale contract, lifecycle state machine (Presale, Locked, Matured,
Settled), producer settlement and pro-rata redemptions computed on actually
deposited funds, physical claim registry, bounded valuation oracle, pause,
two-step admin transfer. 27 unit tests passing.

### D2 : TERWA Token

| Criterion | Status |
|---|---|
| Token issuance logic implemented | Done. One Classic Asset per vintage (TERWA2025..TERWA2029), wrapped via SAC |
| Vault mints tokens on deposit | Done. Each vault is the sole SAC admin of its vintage token |
| Balances visible in Stellar wallets | Done. Standard Classic Assets, visible in any wallet or explorer |

### D3 : Web Platform

| Criterion | Status |
|---|---|
| Platform deployed and accessible | Done: https://terwa.netlify.app |
| Wallet connection | Done. Stellar Wallets Kit (Freighter, xBull, Lobstr and others) |
| Token purchase | Done. Allocation purchase with on-chain signed buyer declaration, payable in USDC or XLM |
| Vault status visible | Done. Live on-chain reads: allocations sold, price, presale status |
| Maturity flows (redeem, claim) functional | Done. From the cellar page, per vintage: producer repurchase (payout previewed by simulation, tokens burned against USDC) and physical delivery request (delivery details hashed client side, hash recorded on-chain via claim_physical, claim status read from chain). Exercised live on a matured demonstration cuvee (below) |

Beyond the criteria, the platform ships: sourced and dated market price
transparency (independent distributor links), the estate page (parcels,
production history), a how-it-works page with guarantees and FAQ, the holder
cellar page (per-vintage holdings, availability dates, acquisition cost),
legal page skeletons, and six languages (EN, FR, DE, ZH, RU, JA) matching the
cuvee's reference markets. A temporary review mode ("Mode demo" button)
simulates a connected wallet holding allocations for UX evaluation without a
wallet extension.

## Deployed contracts (testnet)

| Component | Address |
|---|---|
| Allocation sale (entry point) | CCFUKYOXRVCCSX4W3NMYACQTYCOK3JW4PODIRABOGEWPI2TQHP5UK2YD |
| Vault 2025 (matures 2027-06-01) | CAVSSSO23QRLIMQYM7KMJHFZF5W4ZRHQF7DXEA4X7UVT6PPVSTDWA4XA |
| Vault 2026 (matures 2028-06-01) | CAOO4CUJQYRQ54XKT3AUIG7I2RBHUHUAVAFZTXSJZW3JVY56MGXIIOVG |
| Vault 2027 (matures 2029-06-01) | CBKDA5I3VF65P4RLNXTMA2KME72SKIUUEIIEHGP667NUDFBORZF7ZUPH |
| Vault 2028 (matures 2030-06-01) | CAJFOA2EYLKWROCCOQOSZ6W2FBPZIYXBJLFYIPPTEFDZ6XIWX6ZQFLIR |
| Vault 2029 (matures 2031-06-01) | CADTWIFPZJHR5AKUE6XNNSZPYDSQVN7Y2E5G5JZEP7HLP4QDIN4W4R7Z |
| Token 2025 (TERWA2025) | CCUNRPBG5NFVS2ZJF2ZD4TSPITODCCYJGRDTHSF7UZEBFXUYFWXRZV2T |
| Token 2026 (TERWA2026) | CBC5Y5LWTBULZLGOENF5EPN7HJJ2FIVHZEFHUWBHQOSBVCR3MHGJHZKW |
| Token 2027 (TERWA2027) | CDWEORRT6GGRSBIJMXL3CXBHZSBN6J5577TD2KMCL4TGG3WWYTQCLFC2 |
| Token 2028 (TERWA2028) | CAOGCSOZQXOYZSD57Q2CUZLBLFS5VUPU4IHEF7JUMWL5CPMFGQ3AQLWC |
| Token 2029 (TERWA2029) | CDCGMXCCOOYI3DJ4ZHYDKS7VFKH6OBQXROPGXT6W3L36IIY7MCN5BCJI |
| Test stablecoin (USDM, replaced by Circle USDC on mainnet) | CDHDWKDTF6TYQ2HLEARAZKS6W6MZ33KSXDX2EEQ25SLIG7WPZ3O36ODC |

Economic parameters (allocation price, supply of 1,660 allocations, vintages)
are constructor parameters, redeployable without code changes when the final
producer figures are contracted.

## Demonstration cuvee (matured, for maturity-flow verification)

Because the production vintages (2025-2029) only mature from 2027, a parallel
demonstration cuvee with already-matured vintages (2019-2023) is deployed on
testnet to exercise the maturity flows for real. Vault 2019 is settled with a
producer repurchase pool; a live redemption has been executed on-chain
(1 token burned against 190 USDM). Sale contract:
CDOKCWYLCSFVCBF2UZTW3T3YE3ZDMYZIEH3ST33WLSMB7EHGAL54V3PP.
The script scripts/testnet-demo-vault.sh recreates this environment on demand.

## How to verify

1. Open https://terwa.netlify.app, browse the cuvee, prices and estate pages.
2. Click "Mode demo" (bottom right) to preview the connected experience: the
   cellar page shows real testnet holdings of the test account.
3. With a testnet wallet (e.g. Freighter): connect, accept the buyer
   declaration, purchase an allocation in USDC or XLM; the five vintage
   tokens appear in the wallet immediately.
4. On-chain: query any vault, e.g.
   `stellar contract invoke --id CAVSSSO23QRLIMQYM7KMJHFZF5W4ZRHQF7DXEA4X7UVT6PPVSTDWA4XA --network testnet -- get_sold_lots`
5. Source code: contracts, tests and deployment scripts in the project
   repository (contracts/, scripts/), website in the website repository.

## Scope of the next milestone (Testnet)

Event indexer and transaction history, delivery claim service (encrypted
delivery data, on-chain claim, fulfilment tracking), producer settlement and
repurchase flow, annual valuation oracle service, holder notifications,
admin operations console, maturity extension function (force majeure clause),
and a full end-to-end dry run on a short-maturity test vault.

## Addendum (28 July 2026)

Addendum following the review feedback received for the validation of
tranche 1. For clarity: the
report above measures delivery against the acceptance criteria of the funded
architecture, D1 to D3 (ARCHITECTURE.md, section 8, "Development Plan"),
which are the criteria of the approved submission. The confirmations
requested are recorded below.

### 1. Token transferability and compliance model

Confirmed. The five vintage assets (TERWA2025 to TERWA2029) are standard
Stellar Classic Assets issued with no authorization flags: AUTH_REQUIRED,
AUTH_REVOCABLE and AUTH_CLAWBACK_ENABLED are all unset on the issuer
account (testnet issuer
GDNW7VWWCTBU3N3X6GKK3LOKTBTS34CHWLONYQH2D57RVXQJCSYW6DMA, flags verifiable
via Horizon). Certificates are therefore freely transferable and resellable
on Stellar, and are presented as such on the platform.

Compliance controls are enforced at the vault contract level, not at the
asset level: purchase requires an on-chain signed buyer declaration, and
both exit paths (redeem, claim_physical) require the holder to be on the
vault's on-chain allowlist (KYC at exit only). The tranche 2 and 3
whitelisting criteria should therefore be read against this contract-level
allowlist model rather than asset-level authorization flags.

This choice is settled for mainnet: the mainnet issuer account will be
created without these flags before any trustline is opened, in full
knowledge that clawback cannot be enabled retroactively on existing
trustlines.

### 2. SEP-10 authentication

SEP-10 web authentication (described in TECHNICAL.md) belongs to the
backend layer, which is out of scope for milestone 1. It is deferred to
tranche 2 together with the backend services (indexer, claims service,
notifications). In milestone 1, wallet ownership is proven by transaction
signature at purchase, which covers all delivered flows.

### 3. Test coverage

Measured with cargo-llvm-cov on the contracts workspace, all unit tests
passing:

| Scope | Line coverage | Region coverage |
|---|---|---|
| Contract code (test harness excluded) | 89.7% | 91.9% |
| Whole workspace (test code included) | 94.3% | 96.0% |

Both figures are above the 85% threshold referenced in the review.
Reproduce with:

```bash
cd contracts && cargo llvm-cov --workspace --summary-only --ignore-filename-regex 'test\.rs'
```

### 4. License

The repository is now licensed under the Apache License 2.0 (see the
LICENSE file at the repository root).
