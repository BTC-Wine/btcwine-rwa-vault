#![cfg(test)]

extern crate std;

use crate::{AllocationSale, AllocationSaleClient, SaleError};
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{token, vec, Address, BytesN, Env, Vec};
use terwa_vault::TerwaVault;

const PRICE: i128 = 2_060_000_000; // 206 USDC per token
const MAX_SUPPLY: i128 = 1_660; // tokens per vintage
const VINTAGES: usize = 5;
const TOKEN_UNIT: i128 = 10_000_000;

struct Setup {
    env: Env,
    sale: AllocationSaleClient<'static>,
    usdc_admin: token::StellarAssetClient<'static>,
    vintage_tokens: std::vec::Vec<token::TokenClient<'static>>,
    vaults: std::vec::Vec<Address>,
    attestation: BytesN<32>,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let oracle = Address::generate(&env);
    let issuer = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract_v2(issuer);
    let attestation = BytesN::from_array(&env, &[7u8; 32]);

    let mut vaults = std::vec::Vec::new();
    let mut vintage_tokens = std::vec::Vec::new();
    for i in 0..VINTAGES {
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        // each vintage matures on its own date
        let maturity = 1_000_000u64 + i as u64 * 31_536_000;
        let vault = env.register(
            TerwaVault,
            (
                &admin,
                &sac.address(),
                &usdc.address(),
                &oracle,
                maturity,
                PRICE,
                MAX_SUPPLY,
                1i128,
                attestation.clone(),
            ),
        );
        token::StellarAssetClient::new(&env, &sac.address()).set_admin(&vault);
        vintage_tokens.push(token::TokenClient::new(&env, &sac.address()));
        vaults.push(vault);
    }

    let mut vault_vec: Vec<Address> = Vec::new(&env);
    for v in &vaults {
        vault_vec.push_back(v.clone());
    }
    let sale_id = env.register(AllocationSale, (&admin, vault_vec));
    let sale = AllocationSaleClient::new(&env, &sale_id);

    // deposits only through the sale contract
    for vault in &vaults {
        terwa_vault::TerwaVaultClient::new(&env, vault).set_router(&sale_id);
    }

    Setup {
        sale,
        usdc_admin: token::StellarAssetClient::new(&env, &usdc.address()),
        vintage_tokens,
        vaults,
        attestation,
        env,
    }
}

#[test]
fn buy_takes_one_token_in_every_vintage() {
    let s = setup();
    let user = Address::generate(&s.env);
    s.usdc_admin.mint(&user, &(2 * 5 * PRICE));

    let total = s.sale.buy(&user, &2, &s.attestation);

    assert_eq!(total, 2 * 5 * PRICE);
    for t in &s.vintage_tokens {
        assert_eq!(t.balance(&user), 2 * TOKEN_UNIT);
    }
    for v in &s.vaults {
        assert_eq!(
            terwa_vault::TerwaVaultClient::new(&s.env, v).get_sold_lots(),
            2
        );
    }
}

#[test]
fn buy_rejects_zero() {
    let s = setup();
    let user = Address::generate(&s.env);
    assert_eq!(
        s.sale.try_buy(&user, &0, &s.attestation),
        Err(Ok(SaleError::InvalidAmount))
    );
}

#[test]
fn buy_propagates_vault_refusal() {
    let s = setup();
    let user = Address::generate(&s.env);
    s.usdc_admin.mint(&user, &(5 * PRICE));
    let wrong = BytesN::from_array(&s.env, &[9u8; 32]);

    // the vaults check the attestation, the whole purchase reverts
    assert!(s.sale.try_buy(&user, &1, &wrong).is_err());
    for t in &s.vintage_tokens {
        assert_eq!(t.balance(&user), 0);
    }
}

#[test]
fn vaults_can_be_replaced_by_admin() {
    let s = setup();
    let subset: Vec<Address> = vec![&s.env, s.vaults[0].clone(), s.vaults[1].clone()];
    s.sale.set_vaults(&subset);
    assert_eq!(s.sale.get_vaults().len(), 2);
}
