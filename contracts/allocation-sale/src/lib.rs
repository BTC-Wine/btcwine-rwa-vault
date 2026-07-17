#![no_std]

//! Sale entry point. One allocation is one token in each vintage vault, so a
//! buyer always gets the whole series or nothing. Holds no funds itself, each
//! vault pulls its own payment from the buyer inside the same transaction.

#[cfg(test)]
mod test;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, vec, Address, BytesN, Env,
    IntoVal, Val, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum SaleError {
    InvalidAmount = 1,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Vaults,
}

#[contract]
pub struct AllocationSale;

#[contractimpl]
impl AllocationSale {
    pub fn __constructor(env: Env, admin: Address, vaults: Vec<Address>) {
        if vaults.is_empty() {
            panic!("bad config");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Vaults, &vaults);
    }

    /// Buys whole allocations: `allocations` tokens in every vintage vault.
    /// Reverts entirely if any single vault refuses.
    pub fn buy(
        env: Env,
        user: Address,
        allocations: i128,
        attestation: BytesN<32>,
    ) -> Result<i128, SaleError> {
        user.require_auth();
        if allocations <= 0 {
            return Err(SaleError::InvalidAmount);
        }
        let vaults: Vec<Address> = env.storage().instance().get(&DataKey::Vaults).unwrap();
        let mut total: i128 = 0;
        for vault in vaults.iter() {
            let args: Vec<Val> = vec![
                &env,
                user.into_val(&env),
                allocations.into_val(&env),
                attestation.into_val(&env),
            ];
            let paid: i128 = env.invoke_contract(&vault, &symbol_short!("deposit"), args);
            total += paid;
        }
        env.events()
            .publish((symbol_short!("buy"), user), (allocations, total));
        Ok(total)
    }

    pub fn set_vaults(env: Env, vaults: Vec<Address>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        if vaults.is_empty() {
            panic!("bad config");
        }
        env.storage().instance().set(&DataKey::Vaults, &vaults);
    }

    pub fn get_vaults(env: Env) -> Vec<Address> {
        env.storage().instance().get(&DataKey::Vaults).unwrap()
    }
}
