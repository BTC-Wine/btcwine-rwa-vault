use soroban_sdk::{contracttype, Address, BytesN};

/// One vault token has 7 decimals (Stellar standard). A whole token is one
/// lot of three 75cl bottles. The contract only deals in whole lots.
pub const TOKEN_UNIT: i128 = 10_000_000;

const DAY_LEDGERS: u32 = 17_280; // ~5s per ledger
pub const TTL_THRESHOLD: u32 = 30 * DAY_LEDGERS;
pub const TTL_EXTEND: u32 = 120 * DAY_LEDGERS;

/// A single maturity extension may not push the date more than one year out.
/// Force majeure (late harvest, weather, logistics) can require pushing
/// maturity arbitrarily far, done through repeated deliberate extensions, but
/// bounding each step keeps one mistaken call from being irreversible.
pub const MAX_MATURITY_EXTENSION: u64 = 366 * 24 * 60 * 60;

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum VaultState {
    /// Lots are on sale. Ends when the admin closes the sale.
    Presale,
    /// Sale closed, capital funds production, tokens are locked.
    Locked,
    /// Maturity reached, physical claims open. Derived, never stored.
    Matured,
    /// Producer repurchase funds deposited, USDC redemptions open.
    Settled,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    PendingAdmin,
    VaultToken,
    Stablecoin,
    Oracle,
    UnitPrice,
    MaxSupply,
    /// Purchases must be whole multiples of this many lots.
    BundleLots,
    /// When set, deposits are only accepted through this sale contract.
    Router,
    MaturityTs,
    StoredState,
    Paused,
    /// Lots minted since inception.
    SoldLots,
    /// Lots currently in circulation (sold minus burned).
    CirculatingLots,
    /// Latest appraisal, indicative only, never used for payouts.
    RwaValue,
    RwaUpdatedAt,
    /// Hash of the declarative statement buyers sign at deposit.
    Attestation,
    /// When true, redeem and physical claims require an allowlisted address.
    ExitCheck,
    /// Only address allowed to manage the allowlist. Defaults to the admin.
    /// A low-privilege role so the KYC backend never holds the admin key.
    AllowlistManager,
    /// Cumulative USDC deposited by the producer for repurchases.
    SettledPool,
    /// Circulating lots snapshotted at first settlement, payout denominator.
    RedeemableLots,
    Allowed(Address),
    Claim(Address),
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ClaimData {
    pub lots: i128,
    pub delivery_hash: BytesN<32>,
    pub timestamp: u64,
    pub fulfilled: bool,
}
