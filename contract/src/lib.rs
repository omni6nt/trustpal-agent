//! Trustpal policy contract (v0, native NEAR).
//!
//! The contract holds the funds. The owner account sets the rules. The AI agent
//! only ever holds a *function-call access key* on the owner account that is
//! limited to the single method `pay` on THIS contract. Every payment is checked
//! here, on-chain, no matter what the agent or its software believes:
//!
//!   - recipient must be on the owner's approved list
//!   - amount must be within the per-payment limit
//!   - amount must fit in what is left of today's limit (UTC day); the amount is
//!     RESERVED before the transfer, so pending payments count and two payments
//!     in the same block cannot both pass
//!   - the contract must not be paused
//!   - a payment reference can only be used once
//!
//! Amounts are in yoctoNEAR (1 NEAR = 10^24 yoctoNEAR). Admin methods are
//! owner-only and are NOT callable with the agent's restricted key.

use near_sdk::json_types::U128;
use near_sdk::store::{IterableSet, LookupMap};
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
};

const NS_PER_DAY: u64 = 86_400_000_000_000;
const CALLBACK_GAS: Gas = Gas::from_tgas(10);

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
enum StorageKey {
    Allowlist,
    Payments,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, PartialEq, Debug)]
pub enum PaymentStatus {
    Pending,
    Completed,
    Failed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Payment {
    pub recipient: AccountId,
    pub amount: U128,
    /// UTC day number (block timestamp / 1 day) the payment was reserved on.
    pub day: u64,
    pub status: PaymentStatus,
}

#[near(serializers = [json])]
pub struct PolicyView {
    pub owner_id: AccountId,
    pub max_per_payment: U128,
    pub daily_cap: U128,
    /// Amount already spent or reserved today (UTC), including pending payments.
    pub reserved_today: U128,
    pub remaining_today: U128,
    pub paused: bool,
    pub utc_day: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct PolicyContract {
    owner_id: AccountId,
    allowlist: IterableSet<AccountId>,
    max_per_payment: u128,
    daily_cap: u128,
    day: u64,
    reserved_today: u128,
    paused: bool,
    payments: LookupMap<String, Payment>,
}

#[near]
impl PolicyContract {
    #[init]
    pub fn new(owner_id: AccountId, max_per_payment: U128, daily_cap: U128) -> Self {
        require!(max_per_payment.0 > 0, "max_per_payment must be above zero");
        require!(
            daily_cap.0 >= max_per_payment.0,
            "daily_cap must be at least max_per_payment"
        );
        Self {
            owner_id,
            allowlist: IterableSet::new(StorageKey::Allowlist),
            max_per_payment: max_per_payment.0,
            daily_cap: daily_cap.0,
            day: env::block_timestamp() / NS_PER_DAY,
            reserved_today: 0,
            paused: false,
            payments: LookupMap::new(StorageKey::Payments),
        }
    }

    // ---------------------------------------------------------------- admin
    // Owner-only. The agent's function-call key is limited to `pay`, so it
    // cannot call any of these.

    pub fn add_recipient(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.allowlist.insert(account_id.clone());
        env::log_str(&event("recipient_added", &account_id.to_string()));
    }

    pub fn remove_recipient(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.allowlist.remove(&account_id);
        env::log_str(&event("recipient_removed", &account_id.to_string()));
    }

    pub fn set_limits(&mut self, max_per_payment: U128, daily_cap: U128) {
        self.assert_owner();
        require!(max_per_payment.0 > 0, "max_per_payment must be above zero");
        require!(
            daily_cap.0 >= max_per_payment.0,
            "daily_cap must be at least max_per_payment"
        );
        self.max_per_payment = max_per_payment.0;
        self.daily_cap = daily_cap.0;
        env::log_str(&event("limits_set", &format!("{}/{}", max_per_payment.0, daily_cap.0)));
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
        env::log_str(&event("paused", &paused.to_string()));
    }

    /// Owner takes funds back out of the contract.
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        self.assert_owner();
        require!(
            self.available_balance() >= amount.0,
            "Not enough free balance to withdraw"
        );
        Promise::new(self.owner_id.clone()).transfer(NearToken::from_yoctonear(amount.0))
    }

    // ------------------------------------------------------------- payments

    /// The only method the agent's key may call.
    /// Every check below runs on-chain; a failed check reverts the whole call.
    pub fn pay(&mut self, recipient: AccountId, amount: U128, reference: String) -> Promise {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the owner account (or its restricted agent key) can request payments"
        );
        require!(!self.paused, "BLOCKED: payments are paused");
        require!(
            !reference.is_empty() && reference.len() <= 64,
            "Reference must be 1 to 64 characters"
        );
        require!(
            self.payments.get(&reference).is_none(),
            "BLOCKED: this payment reference was already used"
        );
        require!(
            self.allowlist.contains(&recipient),
            "BLOCKED: recipient is not on the approved list"
        );
        let amount = amount.0;
        require!(amount > 0, "Amount must be above zero");
        require!(
            amount <= self.max_per_payment,
            "BLOCKED: amount is over the per-payment limit"
        );
        self.roll_day();
        require!(
            self.reserved_today + amount <= self.daily_cap,
            "BLOCKED: amount is over the remaining daily limit"
        );
        require!(
            self.available_balance() >= amount,
            "Contract does not hold enough funds for this payment"
        );

        // Reserve BEFORE the transfer so pending payments count against the limit.
        self.reserved_today += amount;
        self.payments.insert(
            reference.clone(),
            Payment {
                recipient: recipient.clone(),
                amount: U128(amount),
                day: self.day,
                status: PaymentStatus::Pending,
            },
        );
        env::log_str(&event(
            "payment_reserved",
            &format!("{}|{}|{}", reference, recipient, amount),
        ));

        Promise::new(recipient)
            .transfer(NearToken::from_yoctonear(amount))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_paid(reference),
            )
    }

    /// Runs after the transfer. Success marks it completed. Failure releases the
    /// reservation, so a failed transfer does not eat the daily limit.
    #[private]
    pub fn on_paid(&mut self, reference: String) {
        let succeeded = env::promise_result_checked(0, 0).is_ok();
        let today = self.day;
        let mut released: u128 = 0;
        if let Some(p) = self.payments.get_mut(&reference) {
            if p.status == PaymentStatus::Pending {
                if succeeded {
                    p.status = PaymentStatus::Completed;
                } else {
                    p.status = PaymentStatus::Failed;
                    if p.day == today {
                        released = p.amount.0;
                    }
                }
            }
        }
        self.reserved_today = self.reserved_today.saturating_sub(released);
        let name = if succeeded { "payment_completed" } else { "payment_failed" };
        env::log_str(&event(name, &reference));
    }

    // ----------------------------------------------------------------- views

    pub fn get_policy(&self) -> PolicyView {
        let today = env::block_timestamp() / NS_PER_DAY;
        let reserved = if today == self.day { self.reserved_today } else { 0 };
        PolicyView {
            owner_id: self.owner_id.clone(),
            max_per_payment: U128(self.max_per_payment),
            daily_cap: U128(self.daily_cap),
            reserved_today: U128(reserved),
            remaining_today: U128(self.daily_cap.saturating_sub(reserved)),
            paused: self.paused,
            utc_day: today,
        }
    }

    pub fn is_allowed(&self, account_id: AccountId) -> bool {
        self.allowlist.contains(&account_id)
    }

    pub fn get_recipients(&self) -> Vec<AccountId> {
        self.allowlist.iter().cloned().collect()
    }

    pub fn get_payment(&self, reference: String) -> Option<Payment> {
        self.payments.get(&reference).cloned()
    }

    // -------------------------------------------------------------- internal

    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner_id,
            "Only the owner can do this"
        );
    }

    fn roll_day(&mut self) {
        let today = env::block_timestamp() / NS_PER_DAY;
        if today != self.day {
            self.day = today;
            self.reserved_today = 0;
        }
    }

    fn available_balance(&self) -> u128 {
        let storage = (env::storage_usage() as u128) * env::storage_byte_cost().as_yoctonear();
        env::account_balance().as_yoctonear().saturating_sub(storage)
    }
}

/// One JSON log line per event, easy for the audit log and explorers to read.
fn event(name: &str, data: &str) -> String {
    format!(
        "EVENT_JSON:{}",
        near_sdk::serde_json::json!({ "standard": "trustpal", "event": name, "data": data })
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const NEAR: u128 = 1_000_000_000_000_000_000_000_000;

    fn owner() -> AccountId {
        accounts(0)
    }
    fn alex() -> AccountId {
        accounts(1)
    }
    fn attacker() -> AccountId {
        accounts(2)
    }
    fn contract_id() -> AccountId {
        accounts(3)
    }

    fn ctx(predecessor: AccountId, timestamp_ns: u64) {
        let ctx = VMContextBuilder::new()
            .current_account_id(contract_id())
            .predecessor_account_id(predecessor)
            .account_balance(NearToken::from_near(100))
            .block_timestamp(timestamp_ns)
            .build();
        testing_env!(ctx);
    }

    /// Owner funded contract: max 5 NEAR per payment, 8 NEAR per day, alex approved.
    fn setup() -> PolicyContract {
        ctx(owner(), NS_PER_DAY * 10);
        let mut c = PolicyContract::new(owner(), U128(5 * NEAR), U128(8 * NEAR));
        c.add_recipient(alex());
        c
    }

    #[test]
    fn pays_an_approved_recipient_within_limits() {
        let mut c = setup();
        let _ = c.pay(alex(), U128(2 * NEAR), "inv-1".to_string());
        let p = c.get_payment("inv-1".to_string()).unwrap();
        assert_eq!(p.status, PaymentStatus::Pending);
        assert_eq!(c.get_policy().reserved_today.0, 2 * NEAR);
    }

    #[test]
    #[should_panic(expected = "recipient is not on the approved list")]
    fn blocks_an_unapproved_recipient() {
        let mut c = setup();
        let _ = c.pay(attacker(), U128(NEAR), "inv-evil".to_string());
    }

    #[test]
    #[should_panic(expected = "over the per-payment limit")]
    fn blocks_over_the_per_payment_limit() {
        let mut c = setup();
        let _ = c.pay(alex(), U128(6 * NEAR), "inv-big".to_string());
    }

    #[test]
    #[should_panic(expected = "over the remaining daily limit")]
    fn blocks_over_the_daily_limit_counting_pending() {
        let mut c = setup();
        let _ = c.pay(alex(), U128(5 * NEAR), "a".to_string()); // still pending
        let _ = c.pay(alex(), U128(4 * NEAR), "b".to_string()); // 5 + 4 > 8
    }

    #[test]
    #[should_panic(expected = "already used")]
    fn blocks_a_reused_reference() {
        let mut c = setup();
        let _ = c.pay(alex(), U128(NEAR), "dup".to_string());
        let _ = c.pay(alex(), U128(NEAR), "dup".to_string());
    }

    #[test]
    #[should_panic(expected = "paused")]
    fn blocks_everything_when_paused() {
        let mut c = setup();
        c.set_paused(true);
        let _ = c.pay(alex(), U128(NEAR), "p1".to_string());
    }

    #[test]
    #[should_panic(expected = "Only the owner account")]
    fn only_the_owner_account_can_request_payments() {
        let mut c = setup();
        ctx(attacker(), NS_PER_DAY * 10);
        let _ = c.pay(alex(), U128(NEAR), "x".to_string());
    }

    #[test]
    #[should_panic(expected = "Only the owner can do this")]
    fn only_the_owner_can_change_the_approved_list() {
        let mut c = setup();
        ctx(attacker(), NS_PER_DAY * 10);
        c.add_recipient(attacker());
    }

    #[test]
    fn daily_limit_resets_on_a_new_utc_day() {
        let mut c = setup();
        let _ = c.pay(alex(), U128(5 * NEAR), "d1".to_string());
        ctx(owner(), NS_PER_DAY * 11 + 1);
        let _ = c.pay(alex(), U128(5 * NEAR), "d2".to_string());
        assert_eq!(c.get_policy().reserved_today.0, 5 * NEAR);
    }

    #[test]
    #[should_panic(expected = "does not hold enough funds")]
    fn refuses_when_the_contract_is_underfunded() {
        ctx(owner(), NS_PER_DAY * 10);
        let ctx = VMContextBuilder::new()
            .current_account_id(contract_id())
            .predecessor_account_id(owner())
            .account_balance(NearToken::from_millinear(1))
            .block_timestamp(NS_PER_DAY * 10)
            .build();
        let mut c = PolicyContract::new(owner(), U128(5 * NEAR), U128(8 * NEAR));
        c.add_recipient(alex());
        testing_env!(ctx);
        let _ = c.pay(alex(), U128(NEAR), "poor".to_string());
    }
}
