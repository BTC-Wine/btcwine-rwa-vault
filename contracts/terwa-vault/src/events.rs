use soroban_sdk::{symbol_short, Address, BytesN, Env};

pub fn deposit(env: &Env, user: &Address, lots: i128, paid: i128, attestation: &BytesN<32>) {
    env.events().publish(
        (symbol_short!("deposit"), user.clone()),
        (lots, paid, attestation.clone()),
    );
}

pub fn presale_closed(env: &Env, sold_lots: i128) {
    env.events().publish((symbol_short!("closed"),), sold_lots);
}

pub fn withdrawal(env: &Env, to: &Address, amount: i128) {
    env.events().publish((symbol_short!("withdraw"), to.clone()), amount);
}

pub fn settled(env: &Env, amount: i128, redeemable_lots: i128) {
    env.events().publish((symbol_short!("settled"),), (amount, redeemable_lots));
}

pub fn maturity_extended(env: &Env, old_ts: u64, new_ts: u64) {
    env.events().publish((symbol_short!("extended"),), (old_ts, new_ts));
}

pub fn redeem(env: &Env, user: &Address, lots: i128, payout: i128) {
    env.events().publish((symbol_short!("redeem"), user.clone()), (lots, payout));
}

pub fn claim(env: &Env, user: &Address, lots: i128, delivery_hash: &BytesN<32>) {
    env.events().publish(
        (symbol_short!("claim"), user.clone()),
        (lots, delivery_hash.clone()),
    );
}

pub fn fulfilled(env: &Env, user: &Address) {
    env.events().publish((symbol_short!("fulfilled"), user.clone()), ());
}

pub fn valuation(env: &Env, value: i128) {
    env.events().publish((symbol_short!("valuation"),), value);
}

pub fn allowlist_manager(env: &Env, manager: &Address) {
    env.events().publish((symbol_short!("allowmgr"),), manager.clone());
}

pub fn allowed(env: &Env, addr: &Address, status: bool) {
    env.events().publish((symbol_short!("allowed"), addr.clone()), status);
}

pub fn paused(env: &Env, status: bool) {
    env.events().publish((symbol_short!("paused"),), status);
}

pub fn swept(env: &Env, to: &Address, amount: i128) {
    env.events().publish((symbol_short!("swept"), to.clone()), amount);
}
