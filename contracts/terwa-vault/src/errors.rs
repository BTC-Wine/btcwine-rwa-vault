use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum VaultError {
    NotAuthorized = 1,
    InvalidAmount = 2,
    WrongState = 3,
    ContractPaused = 4,
    SoldOut = 5,
    AttestationMismatch = 6,
    NotMature = 7,
    NotAllowed = 8,
    ClaimPending = 9,
    NoClaim = 10,
    ValueOutOfBounds = 11,
    InsufficientFunds = 12,
    NotWholeBundle = 13,
}
