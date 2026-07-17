#![no_std]

mod errors;
mod events;
mod storage;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env};

use errors::VaultError;
use storage::{ClaimData, DataKey, VaultState, TOKEN_UNIT, TTL_EXTEND, TTL_THRESHOLD};

#[contract]
pub struct TerwaVault;

fn get<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey) -> T {
    env.storage().instance().get(key).unwrap()
}

fn set<T: soroban_sdk::IntoVal<Env, soroban_sdk::Val>>(env: &Env, key: &DataKey, val: &T) {
    env.storage().instance().set(key, val);
}

fn admin(env: &Env) -> Address {
    get(env, &DataKey::Admin)
}

fn require_admin(env: &Env) {
    admin(env).require_auth();
}

fn bump(env: &Env) {
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
}

fn stored_state(env: &Env) -> VaultState {
    get(env, &DataKey::StoredState)
}

/// Maturity is a fact of time, not a transition anyone has to trigger.
fn state_now(env: &Env) -> VaultState {
    match stored_state(env) {
        VaultState::Locked => {
            let maturity: u64 = get(env, &DataKey::MaturityTs);
            if env.ledger().timestamp() >= maturity {
                VaultState::Matured
            } else {
                VaultState::Locked
            }
        }
        s => s,
    }
}

fn require_not_paused(env: &Env) -> Result<(), VaultError> {
    if get::<bool>(env, &DataKey::Paused) {
        return Err(VaultError::ContractPaused);
    }
    Ok(())
}

fn require_exit_allowed(env: &Env, user: &Address) -> Result<(), VaultError> {
    if get::<bool>(env, &DataKey::ExitCheck) {
        let ok: bool = env
            .storage()
            .persistent()
            .get(&DataKey::Allowed(user.clone()))
            .unwrap_or(false);
        if !ok {
            return Err(VaultError::NotAllowed);
        }
    }
    Ok(())
}

fn burn_lots(env: &Env, user: &Address, lots: i128) -> Result<(), VaultError> {
    let vault_token: Address = get(env, &DataKey::VaultToken);
    token::TokenClient::new(env, &vault_token).burn(user, &(lots * TOKEN_UNIT));
    let circulating: i128 = get(env, &DataKey::CirculatingLots);
    set(env, &DataKey::CirculatingLots, &(circulating - lots));
    Ok(())
}

#[contractimpl]
impl TerwaVault {
    /// Prices and supply are constructor parameters so the same code serves
    /// any cuvee. unit_price is in stablecoin stroops per lot of 3 bottles.
    pub fn __constructor(
        env: Env,
        admin: Address,
        vault_token: Address,
        stablecoin: Address,
        oracle: Address,
        maturity_ts: u64,
        unit_price: i128,
        max_supply: i128,
        bundle_lots: i128,
        attestation: BytesN<32>,
    ) {
        if unit_price <= 0 || max_supply <= 0 || bundle_lots <= 0 || max_supply % bundle_lots != 0
        {
            panic!("bad config");
        }
        set(&env, &DataKey::Admin, &admin);
        set(&env, &DataKey::VaultToken, &vault_token);
        set(&env, &DataKey::Stablecoin, &stablecoin);
        set(&env, &DataKey::Oracle, &oracle);
        set(&env, &DataKey::MaturityTs, &maturity_ts);
        set(&env, &DataKey::UnitPrice, &unit_price);
        set(&env, &DataKey::MaxSupply, &max_supply);
        set(&env, &DataKey::BundleLots, &bundle_lots);
        set(&env, &DataKey::Attestation, &attestation);
        set(&env, &DataKey::StoredState, &VaultState::Presale);
        set(&env, &DataKey::Paused, &false);
        set(&env, &DataKey::ExitCheck, &false);
        set(&env, &DataKey::SoldLots, &0i128);
        set(&env, &DataKey::CirculatingLots, &0i128);
        set(&env, &DataKey::RwaValue, &0i128);
        set(&env, &DataKey::RwaUpdatedAt, &0u64);
        bump(&env);
    }

    /// Buys `lots` at the fixed presale price. The attestation hash binds the
    /// signed transaction to the current declarative statement, so the wallet
    /// signature is also a signature over the declaration.
    pub fn deposit(
        env: Env,
        user: Address,
        lots: i128,
        attestation: BytesN<32>,
    ) -> Result<i128, VaultError> {
        user.require_auth();
        if let Some(router) = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::Router)
        {
            // a contract passes this check only as the direct caller
            router.require_auth();
        }
        require_not_paused(&env)?;
        if state_now(&env) != VaultState::Presale {
            return Err(VaultError::WrongState);
        }
        if lots <= 0 {
            return Err(VaultError::InvalidAmount);
        }
        let bundle: i128 = get(&env, &DataKey::BundleLots);
        if lots % bundle != 0 {
            return Err(VaultError::NotWholeBundle);
        }
        let expected: BytesN<32> = get(&env, &DataKey::Attestation);
        if attestation != expected {
            return Err(VaultError::AttestationMismatch);
        }
        let sold: i128 = get(&env, &DataKey::SoldLots);
        let max: i128 = get(&env, &DataKey::MaxSupply);
        if sold + lots > max {
            return Err(VaultError::SoldOut);
        }
        let unit_price: i128 = get(&env, &DataKey::UnitPrice);
        let paid = lots.checked_mul(unit_price).ok_or(VaultError::InvalidAmount)?;

        let stablecoin: Address = get(&env, &DataKey::Stablecoin);
        token::TokenClient::new(&env, &stablecoin).transfer(
            &user,
            &env.current_contract_address(),
            &paid,
        );
        let vault_token: Address = get(&env, &DataKey::VaultToken);
        token::StellarAssetClient::new(&env, &vault_token).mint(&user, &(lots * TOKEN_UNIT));

        set(&env, &DataKey::SoldLots, &(sold + lots));
        let circulating: i128 = get(&env, &DataKey::CirculatingLots);
        set(&env, &DataKey::CirculatingLots, &(circulating + lots));
        bump(&env);
        events::deposit(&env, &user, lots, paid, &attestation);
        Ok(paid)
    }

    /// Ends the sale. There is no automatic end date, the admin closes when
    /// the allocation is sold or the sale window is over.
    pub fn close_presale(env: Env) -> Result<(), VaultError> {
        require_admin(&env);
        if stored_state(&env) != VaultState::Presale {
            return Err(VaultError::WrongState);
        }
        set(&env, &DataKey::StoredState, &VaultState::Locked);
        bump(&env);
        events::presale_closed(&env, get(&env, &DataKey::SoldLots));
        Ok(())
    }

    /// Moves sale proceeds to the producer to fund production. Only possible
    /// while locked and before maturity, and always leaves a public trace.
    pub fn withdraw_for_production(env: Env, to: Address, amount: i128) -> Result<(), VaultError> {
        require_admin(&env);
        if state_now(&env) != VaultState::Locked {
            return Err(VaultError::WrongState);
        }
        if amount <= 0 {
            return Err(VaultError::InvalidAmount);
        }
        let stablecoin: Address = get(&env, &DataKey::Stablecoin);
        let client = token::TokenClient::new(&env, &stablecoin);
        if client.balance(&env.current_contract_address()) < amount {
            return Err(VaultError::InsufficientFunds);
        }
        client.transfer(&env.current_contract_address(), &to, &amount);
        bump(&env);
        events::withdrawal(&env, &to, amount);
        Ok(())
    }

    /// The producer honours its repurchase commitment: `from` deposits the
    /// repurchase funds and USDC redemptions open. One shot by design.
    pub fn settle(env: Env, from: Address, amount: i128) -> Result<(), VaultError> {
        require_admin(&env);
        from.require_auth();
        if state_now(&env) != VaultState::Matured {
            return Err(VaultError::WrongState);
        }
        if amount <= 0 {
            return Err(VaultError::InvalidAmount);
        }
        let stablecoin: Address = get(&env, &DataKey::Stablecoin);
        token::TokenClient::new(&env, &stablecoin).transfer(
            &from,
            &env.current_contract_address(),
            &amount,
        );
        let redeemable: i128 = get(&env, &DataKey::CirculatingLots);
        set(&env, &DataKey::SettledPool, &amount);
        set(&env, &DataKey::RedeemableLots, &redeemable);
        set(&env, &DataKey::StoredState, &VaultState::Settled);
        bump(&env);
        events::settled(&env, amount, redeemable);
        Ok(())
    }

    /// Sells lots back to the producer. Burns the tokens and pays the user
    /// their share of the actually deposited repurchase funds.
    pub fn redeem(env: Env, user: Address, lots: i128) -> Result<i128, VaultError> {
        user.require_auth();
        require_not_paused(&env)?;
        if state_now(&env) != VaultState::Settled {
            return Err(VaultError::WrongState);
        }
        if lots <= 0 {
            return Err(VaultError::InvalidAmount);
        }
        require_exit_allowed(&env, &user)?;

        let pool: i128 = get(&env, &DataKey::SettledPool);
        let redeemable: i128 = get(&env, &DataKey::RedeemableLots);
        let payout = pool
            .checked_mul(lots)
            .ok_or(VaultError::InvalidAmount)?
            / redeemable;

        burn_lots(&env, &user, lots)?;
        let stablecoin: Address = get(&env, &DataKey::Stablecoin);
        token::TokenClient::new(&env, &stablecoin).transfer(
            &env.current_contract_address(),
            &user,
            &payout,
        );
        bump(&env);
        events::redeem(&env, &user, lots, payout);
        Ok(payout)
    }

    /// Requests physical delivery. Available from maturity, one pending
    /// request per address, whole lots only (a lot is three bottles).
    pub fn claim_physical(
        env: Env,
        user: Address,
        lots: i128,
        delivery_hash: BytesN<32>,
    ) -> Result<(), VaultError> {
        user.require_auth();
        require_not_paused(&env)?;
        let state = state_now(&env);
        if state != VaultState::Matured && state != VaultState::Settled {
            return Err(VaultError::NotMature);
        }
        if lots <= 0 {
            return Err(VaultError::InvalidAmount);
        }
        require_exit_allowed(&env, &user)?;
        let key = DataKey::Claim(user.clone());
        if let Some(existing) = env.storage().persistent().get::<_, ClaimData>(&key) {
            if !existing.fulfilled {
                return Err(VaultError::ClaimPending);
            }
        }
        burn_lots(&env, &user, lots)?;
        let data = ClaimData {
            lots,
            delivery_hash: delivery_hash.clone(),
            timestamp: env.ledger().timestamp(),
            fulfilled: false,
        };
        env.storage().persistent().set(&key, &data);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        bump(&env);
        events::claim(&env, &user, lots, &delivery_hash);
        Ok(())
    }

    /// Marks a delivery as done once the logistics loop is closed.
    pub fn fulfill_claim(env: Env, user: Address) -> Result<(), VaultError> {
        require_admin(&env);
        let key = DataKey::Claim(user.clone());
        let mut data: ClaimData = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(VaultError::NoClaim)?;
        if data.fulfilled {
            return Err(VaultError::NoClaim);
        }
        data.fulfilled = true;
        env.storage().persistent().set(&key, &data);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        events::fulfilled(&env, &user);
        Ok(())
    }

    /// Annual appraisal, indicative only. Bounded to half/double the previous
    /// value so a compromised key cannot post absurd numbers.
    pub fn report_rwa_value(env: Env, value: i128) -> Result<(), VaultError> {
        let oracle: Address = get(&env, &DataKey::Oracle);
        oracle.require_auth();
        if value <= 0 {
            return Err(VaultError::ValueOutOfBounds);
        }
        let previous: i128 = get(&env, &DataKey::RwaValue);
        if previous > 0 && (value < previous / 2 || value > previous * 2) {
            return Err(VaultError::ValueOutOfBounds);
        }
        set(&env, &DataKey::RwaValue, &value);
        set(&env, &DataKey::RwaUpdatedAt, &env.ledger().timestamp());
        bump(&env);
        events::valuation(&env, value);
        Ok(())
    }

    /// Recovers leftover funds after redemptions, e.g. the share of holders
    /// who took delivery instead of the repurchase.
    pub fn sweep(env: Env, to: Address, amount: i128) -> Result<(), VaultError> {
        require_admin(&env);
        if state_now(&env) != VaultState::Settled {
            return Err(VaultError::WrongState);
        }
        let stablecoin: Address = get(&env, &DataKey::Stablecoin);
        let client = token::TokenClient::new(&env, &stablecoin);
        if amount <= 0 || client.balance(&env.current_contract_address()) < amount {
            return Err(VaultError::InsufficientFunds);
        }
        client.transfer(&env.current_contract_address(), &to, &amount);
        events::swept(&env, &to, amount);
        Ok(())
    }

    /// Hands the token admin role to another address. Escape hatch for
    /// contract migrations, without it the token is bound to this instance
    /// forever.
    pub fn transfer_token_admin(env: Env, new_admin: Address) -> Result<(), VaultError> {
        require_admin(&env);
        let vault_token: Address = get(&env, &DataKey::VaultToken);
        token::StellarAssetClient::new(&env, &vault_token).set_admin(&new_admin);
        Ok(())
    }

    // admin and config

    pub fn set_allowed(env: Env, addr: Address, status: bool) -> Result<(), VaultError> {
        require_admin(&env);
        let key = DataKey::Allowed(addr.clone());
        env.storage().persistent().set(&key, &status);
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        events::allowed(&env, &addr, status);
        Ok(())
    }

    pub fn set_exit_check(env: Env, required: bool) -> Result<(), VaultError> {
        require_admin(&env);
        set(&env, &DataKey::ExitCheck, &required);
        Ok(())
    }

    pub fn set_attestation(env: Env, attestation: BytesN<32>) -> Result<(), VaultError> {
        require_admin(&env);
        set(&env, &DataKey::Attestation, &attestation);
        Ok(())
    }

    pub fn set_oracle(env: Env, oracle: Address) -> Result<(), VaultError> {
        require_admin(&env);
        set(&env, &DataKey::Oracle, &oracle);
        Ok(())
    }

    pub fn set_router(env: Env, router: Address) -> Result<(), VaultError> {
        require_admin(&env);
        set(&env, &DataKey::Router, &router);
        Ok(())
    }

    pub fn clear_router(env: Env) -> Result<(), VaultError> {
        require_admin(&env);
        env.storage().instance().remove(&DataKey::Router);
        Ok(())
    }

    pub fn set_paused(env: Env, paused: bool) -> Result<(), VaultError> {
        require_admin(&env);
        set(&env, &DataKey::Paused, &paused);
        events::paused(&env, paused);
        Ok(())
    }

    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), VaultError> {
        require_admin(&env);
        set(&env, &DataKey::PendingAdmin, &new_admin);
        Ok(())
    }

    pub fn accept_admin(env: Env) -> Result<(), VaultError> {
        let pending: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingAdmin)
            .ok_or(VaultError::NotAuthorized)?;
        pending.require_auth();
        set(&env, &DataKey::Admin, &pending);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        Ok(())
    }

    // read only

    pub fn get_state(env: Env) -> VaultState {
        state_now(&env)
    }

    pub fn get_vault_value(env: Env) -> i128 {
        get(&env, &DataKey::RwaValue)
    }

    pub fn get_valuation_ts(env: Env) -> u64 {
        get(&env, &DataKey::RwaUpdatedAt)
    }

    pub fn get_unit_price(env: Env) -> i128 {
        get(&env, &DataKey::UnitPrice)
    }

    pub fn get_max_supply(env: Env) -> i128 {
        get(&env, &DataKey::MaxSupply)
    }

    pub fn get_bundle_lots(env: Env) -> i128 {
        get(&env, &DataKey::BundleLots)
    }

    pub fn get_sold_lots(env: Env) -> i128 {
        get(&env, &DataKey::SoldLots)
    }

    pub fn get_circulating_lots(env: Env) -> i128 {
        get(&env, &DataKey::CirculatingLots)
    }

    pub fn get_maturity(env: Env) -> u64 {
        get(&env, &DataKey::MaturityTs)
    }

    pub fn get_settled_pool(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::SettledPool)
            .unwrap_or(0)
    }

    pub fn get_attestation(env: Env) -> BytesN<32> {
        get(&env, &DataKey::Attestation)
    }

    pub fn get_exit_check(env: Env) -> bool {
        get(&env, &DataKey::ExitCheck)
    }

    pub fn is_allowed(env: Env, addr: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Allowed(addr))
            .unwrap_or(false)
    }

    pub fn get_claim(env: Env, user: Address) -> Option<ClaimData> {
        env.storage().persistent().get(&DataKey::Claim(user))
    }

    pub fn get_admin(env: Env) -> Address {
        admin(&env)
    }
}
