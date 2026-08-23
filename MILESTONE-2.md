# TERWA : Milestone 2 (Testnet) Delivery Report

Date: 23 August 2026
Network: Stellar Testnet
Live platform: https://terwa.io
Backend API: https://terwa-api.onrender.com

## Summary

Milestone 2 delivers the complete end-to-end platform on the Stellar testnet,
the target of acceptance criterion D3: a publicly accessible web platform where
the full journey (purchase, maturity, producer take-back or physical delivery)
is demonstrable and independently verifiable on-chain.

On top of the Milestone 1 contracts and website, this milestone adds the entire
backend layer (event indexer, transaction history, delivery claim service,
producer settlement and take-back queue, valuation oracle service, holder
notifications, admin operations, monitoring), SEP-10 web authentication, KYC
verification at exit, and the frontend integration of all of these into the
holder cellar. The whole purchase then maturity then redeem/claim path has been
exercised live on-chain with KYC gating enforced.

Product summary is unchanged: buyers pre-order allocations of the cuvee "Les
Demoiselles" (Chateau Coutet, Saint-Emilion Grand Cru). One allocation = 15
bottles, three per vintage across five consecutive vintages (2025-2029). Each
vintage is backed by its own vault with its own maturity (bottles of vintage N
become available by 1 June of N+2). At each maturity, holders choose physical
delivery, free resale of their certificates, or the producer take-back.

## Deliverables against acceptance criterion D3

| Criterion | Status |
|---|---|
| Platform deployed and publicly accessible on testnet | Done: https://terwa.io, backed by the API at https://terwa-api.onrender.com |
| Full purchase journey | Done. Allocation purchase across the five vintages atomically, payable in USDC or in XLM (converted client side via native path payments), with an on-chain signed buyer declaration |
| Maturity flows end to end (redeem and claim) | Done, exercised live on-chain (transaction hashes below). Producer take-back burns tokens against the settled pool; physical claim records a hashed delivery request on-chain. Both are KYC gated |
| KYC / allowlist gating at exit | Done. Identity verification via Sumsub; on success the backend adds the address to the vault's on-chain allowlist; redeem and claim_physical only succeed for an allowlisted address |
| Transaction history from an indexer | Done. Managed indexer (Mercury) with an RPC event-source fallback; the cellar shows each holder's on-chain history (purchases, certificates, take-back requests) |
| Backend services | Done. Indexer, history API, claims service, settlement and take-back queue, valuation oracle service, notifications, admin console, health monitoring (details below) |
| Public demo and testnet access for the foundation | Done. Public site plus a recorded walkthrough; all contracts and transactions are verifiable on stellar.expert |

## Backend architecture

The backend is a TypeScript/Node service (Fastify + PostgreSQL) split into a web
API and a worker, hosted on Render (Frankfurt). Responsibility and cyber-risk
are minimised by delegating sensitive functions to managed providers rather than
self-hosting them:

- Event indexing: Mercury managed indexer, with a direct RPC event-source
  fallback so history keeps flowing if the provider is unavailable.
- Identity verification: Sumsub (sandbox for testnet), webhook signature
  verified with HMAC; on approval the low-privilege allowlist-manager service
  key adds the holder to the on-chain allowlist. The admin key is never used
  for this and never leaves the operator machine.
- Delivery data: physical-claim delivery details are encrypted at rest with
  AES-256-GCM; only a hash of the delivery payload is written on-chain via
  claim_physical, and fulfilment status is tracked off-chain.
- Producer take-back: requests are queued in the backend, signed by the holder
  wallet (SEP-10), reconciled against on-chain redemptions; if the API is
  unreachable the flow degrades gracefully to an email fallback.
- Valuation oracle: a service key reports the bounded indicative valuation on
  chain; it is purely informational and never drives payouts.
- Authentication: SEP-10 web authentication (the item deferred at Milestone 1)
  is now implemented; API sessions are short-lived JWTs (HS256, issuer and
  audience scoped), signed once per session by the holder wallet.
- Notifications: holder emails via Postmark. Errors via Sentry, uptime via
  Better Stack, admin operations via a Retool console over the admin API.

Hardening applied: per-IP rate limiting, security headers (including
frame-ancestors), strict body limits, StrKey validation on every address input,
CORS restricted to the platform origins, and secret scanning in CI.

## End-to-end demonstration (matured, on-chain)

Because the production vintages (2025-2029) only mature from 2027, a parallel
demonstration cuvee with already-matured vintages (2019-2023) is deployed on
testnet to exercise the maturity flows for real, with KYC gating enforced. A
holder was verified and allowlisted, then executed both exits on-chain:

| Flow | Transaction |
|---|---|
| Producer take-back (redeem): tokens burned against the settled pool | 534fb064e1ff0c1bf6335fbf9a2573293f31fb600e67e78cb48ae25e44ae95bb |
| Physical delivery (claim_physical): hashed delivery request recorded | 18d32ace2740b75ee9e80691a7d1a5f34089b7c6fe76f1ce1ff8b0e3fb9b3445 |

Both succeeded on 23 August 2026 and are viewable on stellar.expert (testnet).
The same address had first been added to the vault allowlist by the KYC backend;
attempting either exit from a non-allowlisted address fails at the contract
level.

## Deployed contracts (testnet)

Production cuvee (five real vintages, live on the platform):

| Component | Address |
|---|---|
| Allocation sale (entry point) | CBW5UGCDPJ7IVGQUQ2HTVZITPQKRPLAX65CQBY6JPRJFKDGSDIUPWFRE |
| Vault 2025 (matures 2027-06-01) | CB6YERRM2RMF6KUENF367N4G7H7HWQMQTJJ2PHVMGCGJMIX7IOSAF33T |
| Vault 2026 (matures 2028-06-01) | CDA6QWHMVMJA3ORYRRVDUP5UNSCNX4DJRH3IEHVDVOOKSUBR6VPNKNV6 |
| Vault 2027 (matures 2029-06-01) | CATNBGCLT45HQYQURLHNF4MOUYQE3E6OUWCWEEZHZGBXCIC7QL2HI4S2 |
| Vault 2028 (matures 2030-06-01) | CDBBPWMS7KOJHXCYRD66SD4NCLR4ZH7BKJPRVIYALB63Z7524QKYYLWU |
| Vault 2029 (matures 2031-06-01) | CCHG4ELGHBHGVEIFQNSFG6X6LF2XWGVDAX2DNQREA2QNIHS4EZBTRTJO |
| Test stablecoin (USDM, replaced by Circle USDC on mainnet) | CAFVPZ6NQXY6WSZDZUWNUYLDJS3QJ3GALNVBIDHCPVGCFFV3U4M2GKOB |

The five vintage tokens (TERWA2025 to TERWA2029) are Classic Assets wrapped via
SAC; issuer GARGCQTKQZUQIMYJWJ7DPCKZKHFHUTSNE6T3TJZUHHARKGHTW4PKHNHJ.

Demonstration cuvee (matured vintages 2019-2023, for the flows above):

| Component | Address |
|---|---|
| Allocation sale | CCHJFJVAXFKFIQFKKJ3RBCNPN5B346PQBQW7JIPOU3V6LTXAPG4QEWTC |

The scripts scripts/deploy-testnet.sh and scripts/testnet-demo-vault.sh recreate
both environments on demand. Economic parameters (allocation price, supply of
1,660 allocations, vintages, maturities) are constructor parameters, redeployable
without code changes when the final producer figures are contracted.

## Test coverage

Contracts, measured with cargo-llvm-cov on the workspace, all unit tests
passing (38 tests):

| Scope | Line coverage | Region coverage |
|---|---|---|
| Contract code (test harness excluded) | 92.2% | 93.5% |
| Vault contract (terwa-vault/src/lib.rs) | 92.0% | 92.9% |

Both above the 85% threshold referenced in the tranche 1 review. Reproduce with:

```bash
cd contracts && cargo llvm-cov --workspace --summary-only --ignore-filename-regex 'test'
```

The backend ships its own test suite (44 cases) covering SEP-10 challenge
validation, JWT scoping, AES-256-GCM delivery encryption, the KYC webhook HMAC
signature, event decoding, take-back reconciliation, and the admin API.

## Addendum commitments (from tranche 1) held

1. Compliance model. Unchanged and enforced. The five vintage assets are
   standard Classic Assets with no authorization flags: on issuer
   GARGCQTKQZUQIMYJWJ7DPCKZKHFHUTSNE6T3TJZUHHARKGHTW4PKHNHJ, auth_required,
   auth_revocable, auth_immutable and auth_clawback_enabled are all unset
   (verifiable via Horizon). Certificates stay freely transferable and
   resellable. Compliance is enforced at the vault level: signed buyer
   declaration at purchase, and an on-chain allowlist for both exits (KYC at
   exit only).
2. SEP-10 authentication. Delivered in this milestone, as committed for
   tranche 2. It authenticates every holder-scoped backend call.
3. Test coverage. Above 85%, measured (figures above).
4. License. Apache License 2.0 at the repository root, unchanged.

## How to verify

1. Open https://terwa.io, browse the cuvee, prices and estate pages.
2. With a testnet wallet (e.g. Freighter): connect, accept the buyer
   declaration, purchase an allocation in USDC or XLM; the five vintage tokens
   appear in the wallet immediately, and the cellar shows the holdings and the
   on-chain history.
3. In the cellar, open "My tracking", sign the SEP-10 proof, and start identity
   verification (Sumsub sandbox).
4. On-chain, inspect the two demonstration transactions above and any vault,
   e.g.
   `stellar contract invoke --id CB6YERRM2RMF6KUENF367N4G7H7HWQMQTJJ2PHVMGCGJMIX7IOSAF33T --network testnet -- get_state`
5. Source code: contracts, backend and deployment scripts in the project
   repository (contracts/, backend/, scripts/); website in the website
   repository.

## Scope of the next milestone (Mainnet)

External security audit and fixes, multi-signature key ceremony, integrated
legal terms (CGV), mainnet deployment, a capped pilot, conformant open-sourcing,
and operational runbooks.
