#![cfg(test)]

use crate::errors::VaultError;
use crate::storage::{VaultState, TOKEN_UNIT};
use crate::{TerwaVault, TerwaVaultClient};
use soroban_sdk::testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke};
use soroban_sdk::{token, Address, BytesN, Env, IntoVal};

const PRICE: i128 = 150 * 10_000_000; // 150 USDC per lot, placeholder
const MAX_SUPPLY: i128 = 1_000; // placeholder allocation
const MATURITY: u64 = 1_000_000;

struct Setup {
    env: Env,
    vault: TerwaVaultClient<'static>,
    usdc: token::TokenClient<'static>,
    usdc_admin: token::StellarAssetClient<'static>,
    terwa: token::TokenClient<'static>,
    admin: Address,
    oracle: Address,
    producer: Address,
    attestation: BytesN<32>,
}

fn setup() -> Setup {
    // bundle of 1 keeps unit tests small, the bundle rule has its own tests
    setup_with_bundle(1)
}

fn setup_with_bundle(bundle_lots: i128) -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let producer = Address::generate(&env);
    let issuer = Address::generate(&env);

    let usdc_sac = env.register_stellar_asset_contract_v2(issuer.clone());
    let terwa_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let attestation = BytesN::from_array(&env, &[7u8; 32]);

    let vault_id = env.register(
        TerwaVault,
        (
            &admin,
            &terwa_sac.address(),
            &usdc_sac.address(),
            &oracle,
            MATURITY,
            PRICE,
            MAX_SUPPLY,
            bundle_lots,
            attestation.clone(),
        ),
    );

    // the vault must be the only minter of the vault token
    token::StellarAssetClient::new(&env, &terwa_sac.address()).set_admin(&vault_id);

    Setup {
        vault: TerwaVaultClient::new(&env, &vault_id),
        usdc: token::TokenClient::new(&env, &usdc_sac.address()),
        usdc_admin: token::StellarAssetClient::new(&env, &usdc_sac.address()),
        terwa: token::TokenClient::new(&env, &terwa_sac.address()),
        admin,
        oracle,
        producer,
        attestation,
        env,
    }
}

fn fund(s: &Setup, addr: &Address, amount: i128) {
    s.usdc_admin.mint(addr, &amount);
}

fn buyer(s: &Setup, lots: i128) -> Address {
    let user = Address::generate(&s.env);
    fund(s, &user, lots * PRICE);
    s.vault.deposit(&user, &lots, &s.attestation);
    user
}

fn warp_to_maturity(s: &Setup) {
    s.env.ledger().with_mut(|l| l.timestamp = MATURITY + 1);
}

#[test]
fn deposit_mints_and_takes_payment() {
    let s = setup();
    let user = Address::generate(&s.env);
    fund(&s, &user, 10 * PRICE);

    let paid = s.vault.deposit(&user, &4, &s.attestation);

    assert_eq!(paid, 4 * PRICE);
    assert_eq!(s.terwa.balance(&user), 4 * TOKEN_UNIT);
    assert_eq!(s.usdc.balance(&user), 6 * PRICE);
    assert_eq!(s.usdc.balance(&s.vault.address), 4 * PRICE);
    assert_eq!(s.vault.get_sold_lots(), 4);
    assert_eq!(s.vault.get_circulating_lots(), 4);
}

#[test]
fn deposit_requires_whole_bundles() {
    // production config: 5 tokens per bundle, minimum one bundle
    let s = setup_with_bundle(5);
    let user = Address::generate(&s.env);
    fund(&s, &user, 20 * PRICE);

    assert_eq!(
        s.vault.try_deposit(&user, &1, &s.attestation),
        Err(Ok(VaultError::NotWholeBundle))
    );
    assert_eq!(
        s.vault.try_deposit(&user, &7, &s.attestation),
        Err(Ok(VaultError::NotWholeBundle))
    );

    s.vault.deposit(&user, &5, &s.attestation);
    s.vault.deposit(&user, &10, &s.attestation);
    assert_eq!(s.terwa.balance(&user), 15 * TOKEN_UNIT);
    assert_eq!(s.vault.get_bundle_lots(), 5);
}

#[test]
fn deposit_rejects_wrong_attestation() {
    let s = setup();
    let user = Address::generate(&s.env);
    fund(&s, &user, PRICE);
    let wrong = BytesN::from_array(&s.env, &[9u8; 32]);

    let res = s.vault.try_deposit(&user, &1, &wrong);
    assert_eq!(res, Err(Ok(VaultError::AttestationMismatch)));
}

#[test]
fn deposit_rejects_zero_and_negative() {
    let s = setup();
    let user = Address::generate(&s.env);
    fund(&s, &user, PRICE);

    assert_eq!(
        s.vault.try_deposit(&user, &0, &s.attestation),
        Err(Ok(VaultError::InvalidAmount))
    );
    assert_eq!(
        s.vault.try_deposit(&user, &-3, &s.attestation),
        Err(Ok(VaultError::InvalidAmount))
    );
}

#[test]
fn deposit_enforces_max_supply() {
    let s = setup();
    let user = Address::generate(&s.env);
    fund(&s, &user, (MAX_SUPPLY + 1) * PRICE);

    s.vault.deposit(&user, &MAX_SUPPLY, &s.attestation);
    assert_eq!(
        s.vault.try_deposit(&user, &1, &s.attestation),
        Err(Ok(VaultError::SoldOut))
    );
}

#[test]
fn deposit_rejected_after_close() {
    let s = setup();
    let user = buyer(&s, 1);
    fund(&s, &user, PRICE);

    s.vault.close_presale();
    assert_eq!(s.vault.get_state(), VaultState::Locked);
    assert_eq!(
        s.vault.try_deposit(&user, &1, &s.attestation),
        Err(Ok(VaultError::WrongState))
    );
}

#[test]
fn state_derives_maturity_from_time() {
    let s = setup();
    buyer(&s, 1);
    s.vault.close_presale();
    assert_eq!(s.vault.get_state(), VaultState::Locked);
    warp_to_maturity(&s);
    assert_eq!(s.vault.get_state(), VaultState::Matured);
}

#[test]
fn withdraw_for_production_only_while_locked() {
    let s = setup();
    buyer(&s, 10);

    // not during presale
    assert_eq!(
        s.vault.try_withdraw_for_production(&s.producer, &PRICE),
        Err(Ok(VaultError::WrongState))
    );

    s.vault.close_presale();
    s.vault.withdraw_for_production(&s.producer, &(10 * PRICE));
    assert_eq!(s.usdc.balance(&s.producer), 10 * PRICE);

    // not more than the balance
    assert_eq!(
        s.vault.try_withdraw_for_production(&s.producer, &1),
        Err(Ok(VaultError::InsufficientFunds))
    );

    // not after maturity
    fund(&s, &s.vault.address, PRICE);
    warp_to_maturity(&s);
    assert_eq!(
        s.vault.try_withdraw_for_production(&s.producer, &1),
        Err(Ok(VaultError::WrongState))
    );
}

#[test]
fn settle_requires_maturity() {
    let s = setup();
    buyer(&s, 2);
    s.vault.close_presale();
    fund(&s, &s.producer, 1_000 * PRICE);

    assert_eq!(
        s.vault.try_settle(&s.producer, &(2 * PRICE)),
        Err(Ok(VaultError::WrongState))
    );

    warp_to_maturity(&s);
    s.vault.settle(&s.producer, &(2 * PRICE));
    assert_eq!(s.vault.get_state(), VaultState::Settled);
    assert_eq!(s.vault.get_settled_pool(), 2 * PRICE);
}

#[test]
fn settle_is_repeatable_and_accumulates() {
    // the producer funds repurchases on demand, so deposits arrive in
    // several instalments and the pool grows with each one
    let s = setup();
    let u1 = buyer(&s, 2);
    let u2 = buyer(&s, 2);
    s.vault.close_presale();
    warp_to_maturity(&s);
    fund(&s, &s.producer, 8 * PRICE);

    s.vault.settle(&s.producer, &(2 * PRICE));
    let p1 = s.vault.redeem(&u1, &2);
    assert_eq!(p1, 2 * PRICE * 2 / 4);

    // a later instalment raises the pool, the denominator stays frozen
    s.vault.settle(&s.producer, &(2 * PRICE));
    assert_eq!(s.vault.get_settled_pool(), 4 * PRICE);
    let p2 = s.vault.redeem(&u2, &2);
    assert_eq!(p2, 4 * PRICE * 2 / 4);
}

#[test]
fn extend_maturity_pushes_lock_back() {
    let s = setup();
    let user = buyer(&s, 1);
    s.vault.close_presale();
    warp_to_maturity(&s);
    assert_eq!(s.vault.get_state(), VaultState::Matured);

    // force majeure: the bottles are late, maturity moves back
    let new_maturity = MATURITY * 2;
    s.vault.extend_maturity(&new_maturity);
    assert_eq!(s.vault.get_maturity(), new_maturity);
    assert_eq!(s.vault.get_state(), VaultState::Locked);

    let hash = BytesN::from_array(&s.env, &[1u8; 32]);
    assert_eq!(
        s.vault.try_claim_physical(&user, &1, &hash),
        Err(Ok(VaultError::NotMature))
    );

    s.env.ledger().with_mut(|l| l.timestamp = new_maturity + 1);
    assert_eq!(s.vault.get_state(), VaultState::Matured);
    s.vault.claim_physical(&user, &1, &hash);
}

#[test]
fn extend_maturity_never_shortens_or_reopens() {
    let s = setup();
    buyer(&s, 1);
    s.vault.close_presale();

    // never earlier than announced
    assert_eq!(
        s.vault.try_extend_maturity(&MATURITY),
        Err(Ok(VaultError::InvalidAmount))
    );
    assert_eq!(
        s.vault.try_extend_maturity(&(MATURITY - 1)),
        Err(Ok(VaultError::InvalidAmount))
    );

    // never after settlement
    warp_to_maturity(&s);
    fund(&s, &s.producer, PRICE);
    s.vault.settle(&s.producer, &PRICE);
    assert_eq!(
        s.vault.try_extend_maturity(&(MATURITY * 2)),
        Err(Ok(VaultError::WrongState))
    );
}

#[test]
fn redeem_pays_prorata_of_settled_funds() {
    let s = setup();
    let u1 = buyer(&s, 2);
    let u2 = buyer(&s, 1);
    s.vault.close_presale();
    s.vault.withdraw_for_production(&s.producer, &(3 * PRICE));
    warp_to_maturity(&s);

    // producer repurchases above the issue price
    let pool = 3 * PRICE + 30_000_000;
    fund(&s, &s.producer, pool);
    s.vault.settle(&s.producer, &pool);

    let p1 = s.vault.redeem(&u1, &2);
    let p2 = s.vault.redeem(&u2, &1);

    assert_eq!(p1, pool * 2 / 3);
    assert_eq!(p2, pool / 3);
    assert_eq!(s.terwa.balance(&u1), 0);
    assert_eq!(s.usdc.balance(&u1), p1);
    // floor rounding never over-distributes
    assert!(p1 + p2 <= pool);
}

#[test]
fn redeem_locked_before_settlement() {
    let s = setup();
    let user = buyer(&s, 1);
    s.vault.close_presale();
    assert_eq!(
        s.vault.try_redeem(&user, &1),
        Err(Ok(VaultError::WrongState))
    );
    warp_to_maturity(&s);
    assert_eq!(
        s.vault.try_redeem(&user, &1),
        Err(Ok(VaultError::WrongState))
    );
}

#[test]
fn claim_opens_at_maturity_even_before_settlement() {
    let s = setup();
    let user = buyer(&s, 2);
    s.vault.close_presale();
    let hash = BytesN::from_array(&s.env, &[1u8; 32]);

    assert_eq!(
        s.vault.try_claim_physical(&user, &1, &hash),
        Err(Ok(VaultError::NotMature))
    );

    warp_to_maturity(&s);
    s.vault.claim_physical(&user, &1, &hash);
    assert_eq!(s.terwa.balance(&user), TOKEN_UNIT);
    let claim = s.vault.get_claim(&user).unwrap();
    assert_eq!(claim.lots, 1);
    assert!(!claim.fulfilled);
}

#[test]
fn claimed_lots_excluded_from_settlement_denominator() {
    let s = setup();
    let u1 = buyer(&s, 2);
    let u2 = buyer(&s, 1);
    s.vault.close_presale();
    warp_to_maturity(&s);

    // u1 takes delivery of everything before settlement
    let hash = BytesN::from_array(&s.env, &[1u8; 32]);
    s.vault.claim_physical(&u1, &2, &hash);

    fund(&s, &s.producer, PRICE);
    s.vault.settle(&s.producer, &PRICE);

    // u2 owns all remaining lots and gets the whole pool
    assert_eq!(s.vault.redeem(&u2, &1), PRICE);
}

#[test]
fn one_pending_claim_per_address() {
    let s = setup();
    let user = buyer(&s, 3);
    s.vault.close_presale();
    warp_to_maturity(&s);
    let hash = BytesN::from_array(&s.env, &[1u8; 32]);

    s.vault.claim_physical(&user, &1, &hash);
    assert_eq!(
        s.vault.try_claim_physical(&user, &1, &hash),
        Err(Ok(VaultError::ClaimPending))
    );

    // a fulfilled claim frees the slot
    s.vault.fulfill_claim(&user);
    s.vault.claim_physical(&user, &1, &hash);
}

#[test]
fn fulfill_requires_existing_claim() {
    let s = setup();
    let user = Address::generate(&s.env);
    assert_eq!(s.vault.try_fulfill_claim(&user), Err(Ok(VaultError::NoClaim)));
}

#[test]
fn oracle_value_is_bounded() {
    let s = setup();
    assert_eq!(
        s.vault.try_report_rwa_value(&0),
        Err(Ok(VaultError::ValueOutOfBounds))
    );
    s.vault.report_rwa_value(&1_000);
    assert_eq!(s.vault.get_vault_value(), 1_000);

    // more than double or less than half is rejected
    assert_eq!(
        s.vault.try_report_rwa_value(&2_001),
        Err(Ok(VaultError::ValueOutOfBounds))
    );
    assert_eq!(
        s.vault.try_report_rwa_value(&499),
        Err(Ok(VaultError::ValueOutOfBounds))
    );
    s.vault.report_rwa_value(&1_500);
    assert_eq!(s.vault.get_vault_value(), 1_500);
}

#[test]
fn exit_check_gates_redeem_and_claim() {
    let s = setup();
    let user = buyer(&s, 2);
    s.vault.close_presale();
    warp_to_maturity(&s);
    fund(&s, &s.producer, 2 * PRICE);
    s.vault.settle(&s.producer, &(2 * PRICE));

    s.vault.set_exit_check(&true);
    let hash = BytesN::from_array(&s.env, &[1u8; 32]);
    assert_eq!(s.vault.try_redeem(&user, &1), Err(Ok(VaultError::NotAllowed)));
    assert_eq!(
        s.vault.try_claim_physical(&user, &1, &hash),
        Err(Ok(VaultError::NotAllowed))
    );

    s.vault.set_allowed(&user, &true);
    s.vault.redeem(&user, &1);
    s.vault.claim_physical(&user, &1, &hash);
}

#[test]
fn allowlist_manager_defaults_to_admin_and_rotates() {
    let s = setup();
    assert_eq!(s.vault.get_allowlist_manager(), s.admin);

    let manager = Address::generate(&s.env);
    s.vault.set_allowlist_manager(&manager);
    assert_eq!(s.vault.get_allowlist_manager(), manager);
}

#[test]
fn set_allowed_accepts_the_manager_key_only() {
    let s = setup();
    let manager = Address::generate(&s.env);
    s.vault.set_allowlist_manager(&manager);
    let user = Address::generate(&s.env);

    // the manager signature alone is enough
    s.env.mock_auths(&[MockAuth {
        address: &manager,
        invoke: &MockAuthInvoke {
            contract: &s.vault.address,
            fn_name: "set_allowed",
            args: (user.clone(), true).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    s.vault.set_allowed(&user, &true);
    assert!(s.vault.is_allowed(&user));

    // the admin signature alone no longer is, once a manager is appointed
    s.env.mock_auths(&[MockAuth {
        address: &s.admin,
        invoke: &MockAuthInvoke {
            contract: &s.vault.address,
            fn_name: "set_allowed",
            args: (user.clone(), false).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    assert!(s.vault.try_set_allowed(&user, &false).is_err());
}

#[test]
fn pause_blocks_user_entrypoints() {
    let s = setup();
    let user = buyer(&s, 1);
    fund(&s, &user, PRICE);
    s.vault.set_paused(&true);

    assert_eq!(
        s.vault.try_deposit(&user, &1, &s.attestation),
        Err(Ok(VaultError::ContractPaused))
    );
    s.vault.set_paused(&false);
    s.vault.deposit(&user, &1, &s.attestation);
}

#[test]
fn attestation_can_rotate() {
    let s = setup();
    let user = Address::generate(&s.env);
    fund(&s, &user, 2 * PRICE);
    let v2 = BytesN::from_array(&s.env, &[8u8; 32]);

    s.vault.set_attestation(&v2);
    assert_eq!(
        s.vault.try_deposit(&user, &1, &s.attestation),
        Err(Ok(VaultError::AttestationMismatch))
    );
    s.vault.deposit(&user, &1, &v2);
}

#[test]
fn admin_handover_is_two_step() {
    let s = setup();
    let next = Address::generate(&s.env);
    s.vault.transfer_admin(&next);
    assert_eq!(s.vault.get_admin(), s.admin);
    s.vault.accept_admin();
    assert_eq!(s.vault.get_admin(), next);
}

#[test]
fn sweep_only_after_settlement() {
    let s = setup();
    buyer(&s, 1);
    assert_eq!(
        s.vault.try_sweep(&s.admin, &1),
        Err(Ok(VaultError::WrongState))
    );

    s.vault.close_presale();
    // presale proceeds leave for production, only the repurchase pool remains
    s.vault.withdraw_for_production(&s.producer, &PRICE);
    warp_to_maturity(&s);
    fund(&s, &s.producer, PRICE);
    s.vault.settle(&s.producer, &PRICE);

    // one lot is still circulating and owed the whole pool, nothing is surplus
    assert_eq!(
        s.vault.try_sweep(&s.admin, &PRICE),
        Err(Ok(VaultError::InsufficientFunds))
    );
}

#[test]
fn sweep_leaves_the_repurchase_owed_to_holders() {
    // the core protection: settle funds are reserved for redeemers, only the
    // share of lots that left through delivery is sweepable
    let s = setup();
    let u1 = buyer(&s, 1);
    let u2 = buyer(&s, 1);
    s.vault.close_presale();
    s.vault.withdraw_for_production(&s.producer, &(2 * PRICE));
    warp_to_maturity(&s);
    let pool = 2 * PRICE;
    fund(&s, &s.producer, pool);
    s.vault.settle(&s.producer, &pool); // redeemable frozen at 2 lots

    // both lots still circulating: the whole pool is owed, sweep of any of it fails
    assert_eq!(
        s.vault.try_sweep(&s.admin, &PRICE),
        Err(Ok(VaultError::InsufficientFunds))
    );

    // u2 takes physical delivery: its lot no longer redeems, its share is surplus
    let hash = BytesN::from_array(&s.env, &[9u8; 32]);
    s.vault.claim_physical(&u2, &1, &hash);
    assert_eq!(
        s.vault.try_sweep(&s.admin, &(PRICE + 1)),
        Err(Ok(VaultError::InsufficientFunds))
    );
    s.vault.sweep(&s.admin, &PRICE);
    assert_eq!(s.usdc.balance(&s.admin), PRICE);

    // u1 can still redeem its full pro-rata, the vault stays solvent
    let p1 = s.vault.redeem(&u1, &1);
    assert_eq!(p1, pool / 2);
    assert_eq!(s.usdc.balance(&u1), p1);
}

#[test]
fn sweep_blocked_while_paused() {
    let s = setup();
    buyer(&s, 1);
    s.vault.close_presale();
    s.vault.withdraw_for_production(&s.producer, &PRICE);
    warp_to_maturity(&s);
    fund(&s, &s.producer, PRICE);
    s.vault.settle(&s.producer, &PRICE);
    s.vault.set_paused(&true);
    assert_eq!(
        s.vault.try_sweep(&s.admin, &1),
        Err(Ok(VaultError::ContractPaused))
    );
}

#[test]
fn extend_maturity_is_capped_to_one_year() {
    let s = setup();
    buyer(&s, 1);
    s.vault.close_presale();
    // more than a year past the current maturity is rejected
    let too_far = MATURITY + 366 * 24 * 60 * 60 + 1;
    assert_eq!(
        s.vault.try_extend_maturity(&too_far),
        Err(Ok(VaultError::InvalidAmount))
    );
    // exactly one year is allowed
    let ok = MATURITY + 366 * 24 * 60 * 60;
    s.vault.extend_maturity(&ok);
    assert_eq!(s.vault.get_maturity(), ok);
}

#[test]
fn extend_maturity_can_repeat_beyond_a_single_step() {
    // no absolute ceiling: a real force majeure can push maturity as far as
    // needed, through repeated deliberate one-year steps
    let s = setup();
    buyer(&s, 1);
    s.vault.close_presale();
    let year = 366 * 24 * 60 * 60;
    s.vault.extend_maturity(&(MATURITY + year));
    s.vault.extend_maturity(&(MATURITY + 2 * year));
    s.vault.extend_maturity(&(MATURITY + 3 * year));
    s.vault.extend_maturity(&(MATURITY + 4 * year));
    assert_eq!(s.vault.get_maturity(), MATURITY + 4 * year);
    // but still not more than a year in one step
    assert_eq!(
        s.vault.try_extend_maturity(&(MATURITY + 5 * year + 1)),
        Err(Ok(VaultError::InvalidAmount))
    );
}

#[test]
fn redeem_rejects_when_no_lot_is_redeemable() {
    // every sold lot leaves through delivery before settlement, so the redeem
    // denominator is zero: the call must reject cleanly, never trap
    let s = setup();
    let u1 = buyer(&s, 1);
    s.vault.close_presale();
    warp_to_maturity(&s);
    let hash = BytesN::from_array(&s.env, &[3u8; 32]);
    s.vault.claim_physical(&u1, &1, &hash); // circulating drops to 0
    fund(&s, &s.producer, PRICE);
    s.vault.settle(&s.producer, &PRICE); // redeemable frozen at 0
    let outsider = Address::generate(&s.env);
    assert_eq!(
        s.vault.try_redeem(&outsider, &1),
        Err(Ok(VaultError::WrongState))
    );
}

#[test]
fn token_admin_can_migrate() {
    let s = setup();
    let sac = token::StellarAssetClient::new(&s.env, &s.terwa.address);
    assert_eq!(sac.admin(), s.vault.address);

    s.vault.transfer_token_admin(&s.admin);
    assert_eq!(sac.admin(), s.admin);
}

#[test]
fn token_admin_cannot_migrate_after_settlement() {
    // once the repurchase pool is in place, the mint authority is frozen so it
    // cannot be used to mint against the funds owed to redeemers
    let s = setup();
    buyer(&s, 1);
    s.vault.close_presale();
    warp_to_maturity(&s);
    fund(&s, &s.producer, PRICE);
    s.vault.settle(&s.producer, &PRICE);
    assert_eq!(
        s.vault.try_transfer_token_admin(&s.admin),
        Err(Ok(VaultError::WrongState))
    );
}

#[test]
fn unauthorized_calls_fail_without_mocked_auth() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let issuer = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract_v2(issuer);
    let terwa = env.register_stellar_asset_contract_v2(admin.clone());
    let attestation = BytesN::from_array(&env, &[7u8; 32]);
    let vault_id = env.register(
        TerwaVault,
        (
            &admin,
            &terwa.address(),
            &usdc.address(),
            &oracle,
            MATURITY,
            PRICE,
            MAX_SUPPLY,
            1i128,
            attestation,
        ),
    );
    let vault = TerwaVaultClient::new(&env, &vault_id);

    // no auth mocked, so admin and oracle calls must be rejected by the host
    assert!(vault.try_close_presale().is_err());
    assert!(vault.try_report_rwa_value(&1_000).is_err());
    assert!(vault.try_set_paused(&true).is_err());
    assert!(vault.try_extend_maturity(&(MATURITY * 2)).is_err());
    assert!(vault.try_set_allowed(&admin, &true).is_err());
    assert!(vault.try_set_allowlist_manager(&admin).is_err());
}
