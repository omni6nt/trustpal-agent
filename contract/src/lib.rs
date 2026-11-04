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
//!   - a newly approved recipient cannot be paid until a cooldown has passed, so an
//!     attacker who tricks the owner into approving an address cannot drain at once
//!   - the owner can approve ONE exact payment (recipient, amount, reference, expiry);
//!     the agent can then only execute exactly that, once, before it expires
//!   - revenue paid into the contract is split by fixed owner-set shares; the agent
//!     key cannot touch the split
//!   - funds tied up in pending payments cannot be withdrawn or double-spent
//!
//! Amounts are in yoctoNEAR (1 NEAR = 10^24 yoctoNEAR). Admin methods are
//! owner-only and are NOT callable with the agent's restricted key.

use near_sdk::json_types::{U128, U64};
use near_sdk::store::{IterableMap, IterableSet, LookupMap};
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
    ApprovedAt,
    Approvals,
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

/// The owner's authorisation of ONE exact payment. The agent can only execute it as written.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Approval {
    pub recipient: AccountId,
    pub amount: U128,
    /// Nanoseconds since epoch after which the approval no longer works.
    pub expires_at: U64,
}

#[near(serializers = [json])]
pub struct ApprovalView {
    pub reference: String,
    pub recipient: AccountId,
    pub amount: U128,
    pub expires_at: U64,
}

/// One line of the revenue split, in basis points (10_000 = 100%).
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct SplitShare {
    pub account_id: AccountId,
    pub bps: u16,
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
    pub cooldown_seconds: u64,
    /// Funds promised to payments that have not settled yet.
    pub pending_total: U128,
    /// Total revenue that has come in and been split.
    pub revenue_total: U128,
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
    cooldown_ns: u64,
    approved_at: LookupMap<AccountId, u64>,
    pending_total: u128,
    approvals: IterableMap<String, Approval>,
    split: Vec<SplitShare>,
    revenue_total: u128,
}

#[near]
impl PolicyContract {
    #[init]
    pub fn new(
        owner_id: AccountId,
        max_per_payment: U128,
        daily_cap: U128,
        cooldown_seconds: u64,
    ) -> Self {
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
            cooldown_ns: cooldown_seconds.saturating_mul(1_000_000_000),
            approved_at: LookupMap::new(StorageKey::ApprovedAt),
            pending_total: 0,
            approvals: IterableMap::new(StorageKey::Approvals),
            split: Vec::new(),
            revenue_total: 0,
        }
    }

    // ---------------------------------------------------------------- admin
    // Owner-only. The agent's function-call key is limited to `pay`, so it
    // cannot call any of these.

    pub fn add_recipient(&mut self, account_id: AccountId) {
        self.assert_owner();
        // Re-adding an address must not restart (or skip) its cooldown.
        if self.allowlist.insert(account_id.clone()) {
            self.approved_at.insert(account_id.clone(), env::block_timestamp());
        }
        env::log_str(&event("recipient_added", &account_id.to_string()));
    }

    pub fn remove_recipient(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.allowlist.remove(&account_id);
        self.approved_at.remove(&account_id);
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

    /// The human authorises one exact payment. The agent cannot create or change these.
    pub fn approve_payment(
        &mut self,
        reference: String,
        recipient: AccountId,
        amount: U128,
        valid_for_seconds: u64,
    ) {
        self.assert_owner();
        require!(
            !reference.is_empty() && reference.len() <= 64,
            "Reference must be 1 to 64 characters"
        );
        require!(amount.0 > 0, "Amount must be above zero");
        require!(
            valid_for_seconds > 0 && valid_for_seconds <= 30 * 86_400,
            "valid_for_seconds must be between 1 and 30 days"
        );
        require!(
            self.payments.get(&reference).is_none(),
            "This payment reference was already used"
        );
        require!(
            self.approvals.get(&reference).is_none(),
            "An approval with this reference already exists"
        );
        let expires = env::block_timestamp().saturating_add(valid_for_seconds * 1_000_000_000);
        self.approvals.insert(
            reference.clone(),
            Approval { recipient: recipient.clone(), amount, expires_at: U64(expires) },
        );
        env::log_str(&event(
            "payment_approved",
            &format!("{}|{}|{}|{}", reference, recipient, amount.0, expires),
        ));
    }

    pub fn cancel_approval(&mut self, reference: String) {
        self.assert_owner();
        self.approvals.remove(&reference);
        env::log_str(&event("approval_cancelled", &reference));
    }

    /// Fixed revenue split. Shares may add up to at most 10_000 basis points (100%). Whatever is
    /// not paid out (the treasury's own share, plus any rounding dust) stays in the contract.
    pub fn set_split(&mut self, shares: Vec<SplitShare>) {
        self.assert_owner();
        require!(!shares.is_empty() && shares.len() <= 10, "Between 1 and 10 shares");
        let mut total: u32 = 0;
        for (i, s) in shares.iter().enumerate() {
            require!(s.bps > 0, "Every share must be above zero");
            require!(
                !shares[..i].iter().any(|o| o.account_id == s.account_id),
                "Duplicate account in the split"
            );
            total += s.bps as u32;
        }
        require!(total <= 10_000, "Shares cannot add up to more than 10000 basis points");
        self.split = shares;
        env::log_str(&event("split_set", &self.split.len().to_string()));
    }

    /// Anyone (a client) can pay the business. The money is divided at once by the fixed split.
    /// If a share cannot be delivered (for example the account does not exist), NEAR refunds
    /// that share to this contract, so it stays in the treasury and is not lost.
    #[payable]
    pub fn receive_revenue(&mut self, memo: String) {
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit > 0, "Attach a payment");
        require!(!self.split.is_empty(), "No revenue split has been configured");
        require!(memo.len() <= 64, "Memo must be at most 64 characters");
        let mut paid: u128 = 0;
        for share in self.split.clone().iter() {
            let amount = deposit * (share.bps as u128) / 10_000;
            paid += amount;
            if amount > 0 {
                let _ = Promise::new(share.account_id.clone())
                    .transfer(NearToken::from_yoctonear(amount));
            }
            env::log_str(&event(
                "revenue_share",
                &format!("{}|{}|{}", memo, share.account_id, amount),
            ));
        }
        env::log_str(&event("revenue_retained", &format!("{}|{}", memo, deposit - paid)));
        self.revenue_total += deposit;
    }

    pub fn set_cooldown(&mut self, cooldown_seconds: u64) {
        self.assert_owner();
        self.cooldown_ns = cooldown_seconds.saturating_mul(1_000_000_000);
        env::log_str(&event("cooldown_set", &cooldown_seconds.to_string()));
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
        let amount = amount.0;
        require!(amount > 0, "Amount must be above zero");
        // Lane 1: the owner approved this exact payment. It must match to the letter.
        let approval = self.approvals.get(&reference).cloned();
        if let Some(a) = &approval {
            require!(
                a.recipient == recipient && a.amount.0 == amount,
                "BLOCKED: this payment does not match what the owner approved for this reference"
            );
            require!(
                env::block_timestamp() <= a.expires_at.0,
                "BLOCKED: the owner's approval for this reference has expired"
            );
        } else {
            // Lane 2: no approval, so the standing rules apply.
            require!(
                self.allowlist.contains(&recipient),
                "BLOCKED: recipient is not on the approved list"
            );
            require!(
                env::block_timestamp() >= self.payable_after_ns(&recipient),
                "BLOCKED: recipient was approved too recently (cooldown not finished)"
            );
            require!(
                amount <= self.max_per_payment,
                "BLOCKED: amount is over the per-payment limit"
            );
        }
        self.roll_day();
        require!(
            self.reserved_today + amount <= self.daily_cap,
            "BLOCKED: amount is over the remaining daily limit"
        );
        require!(
            self.available_balance() >= amount,
            "Contract does not hold enough funds for this payment"
        );

        if approval.is_some() {
            self.approvals.remove(&reference); // an approval works exactly once
        }
        // Reserve BEFORE the transfer so pending payments count against the limit.
        self.reserved_today += amount;
        self.pending_total += amount;
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
        let mut settled: u128 = 0;
        if let Some(p) = self.payments.get_mut(&reference) {
            if p.status == PaymentStatus::Pending {
                settled = p.amount.0;
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
        self.pending_total = self.pending_total.saturating_sub(settled);
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
            cooldown_seconds: self.cooldown_ns / 1_000_000_000,
            pending_total: U128(self.pending_total),
            revenue_total: U128(self.revenue_total),
        }
    }

    pub fn is_allowed(&self, account_id: AccountId) -> bool {
        self.allowlist.contains(&account_id)
    }

    pub fn get_approval(&self, reference: String) -> Option<ApprovalView> {
        self.approvals.get(&reference).map(|a| ApprovalView {
            reference: reference.clone(),
            recipient: a.recipient.clone(),
            amount: a.amount,
            expires_at: a.expires_at,
        })
    }

    pub fn list_approvals(&self) -> Vec<ApprovalView> {
        self.approvals
            .iter()
            .map(|(r, a)| ApprovalView {
                reference: r.clone(),
                recipient: a.recipient.clone(),
                amount: a.amount,
                expires_at: a.expires_at,
            })
            .collect()
    }

    pub fn get_split(&self) -> Vec<SplitShare> {
        self.split.clone()
    }

    /// Share of every incoming payment that stays in the treasury, in basis points.
    pub fn treasury_bps(&self) -> u16 {
        10_000 - self.split.iter().map(|s| s.bps).sum::<u16>()
    }

    /// Earliest time (ns since epoch) this recipient can be paid; None if not approved.
    pub fn payable_after(&self, account_id: AccountId) -> Option<U64> {
        if self.allowlist.contains(&account_id) {
            Some(U64(self.payable_after_ns(&account_id)))
        } else {
            None
        }
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

    fn payable_after_ns(&self, account_id: &AccountId) -> u64 {
        self.approved_at
            .get(account_id)
            .copied()
            .unwrap_or(0)
            .saturating_add(self.cooldown_ns)
    }

    /// Balance that is neither needed for storage nor promised to a pending payment.
    fn available_balance(&self) -> u128 {
        let storage = (env::storage_usage() as u128) * env::storage_byte_cost().as_yoctonear();
        env::account_balance()
            .as_yoctonear()
            .saturating_sub(storage)
            .saturating_sub(self.pending_total)
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
        let mut c = PolicyContract::new(owner(), U128(5 * NEAR), U128(8 * NEAR), 0);
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
        let mut c = PolicyContract::new(owner(), U128(5 * NEAR), U128(8 * NEAR), 0);
        c.add_recipient(alex());
        testing_env!(ctx);
        let _ = c.pay(alex(), U128(NEAR), "poor".to_string());
    }

    #[test]
    #[should_panic(expected = "approved too recently")]
    fn cooldown_blocks_a_freshly_approved_recipient() {
        ctx(owner(), NS_PER_DAY * 10);
        let mut c = PolicyContract::new(owner(), U128(5 * NEAR), U128(8 * NEAR), 600);
        c.add_recipient(alex());
        ctx(owner(), NS_PER_DAY * 10 + 599 * 1_000_000_000);
        c.pay(alex(), U128(NEAR), "r1".to_string());
    }

    #[test]
    fn cooldown_allows_payment_once_it_has_passed() {
        ctx(owner(), NS_PER_DAY * 10);
        let mut c = PolicyContract::new(owner(), U128(5 * NEAR), U128(8 * NEAR), 600);
        c.add_recipient(alex());
        ctx(owner(), NS_PER_DAY * 10 + 600 * 1_000_000_000);
        c.pay(alex(), U128(NEAR), "r1".to_string());
        assert_eq!(c.get_policy().pending_total.0, NEAR);
    }

    #[test]
    fn re_adding_a_recipient_does_not_restart_the_cooldown() {
        ctx(owner(), NS_PER_DAY * 10);
        let mut c = PolicyContract::new(owner(), U128(5 * NEAR), U128(8 * NEAR), 600);
        c.add_recipient(alex());
        ctx(owner(), NS_PER_DAY * 10 + 500 * 1_000_000_000);
        c.add_recipient(alex());
        assert_eq!(c.payable_after(alex()).unwrap().0, NS_PER_DAY * 10 + 600 * 1_000_000_000);
        assert!(c.payable_after(attacker()).is_none());
    }

    #[test]
    #[should_panic(expected = "Not enough free balance")]
    fn pending_payments_cannot_be_withdrawn() {
        let mut c = setup();
        c.pay(alex(), U128(5 * NEAR), "r1".to_string());
        // balance in the test env is 100 NEAR; 5 is promised, so 100 is not free
        c.withdraw(U128(100 * NEAR));
    }

    fn bob() -> AccountId {
        "bob.testnet".parse().unwrap()
    }
    fn carol() -> AccountId {
        "carol.testnet".parse().unwrap()
    }

    #[test]
    fn an_approved_payment_works_even_for_a_recipient_not_on_the_list() {
        let mut c = setup();
        c.approve_payment("inv-1".to_string(), attacker(), U128(NEAR), 3600);
        c.pay(attacker(), U128(NEAR), "inv-1".to_string());
        assert_eq!(c.get_payment("inv-1".to_string()).unwrap().recipient, attacker());
        assert!(c.get_approval("inv-1".to_string()).is_none(), "approval is consumed");
    }

    #[test]
    #[should_panic(expected = "does not match what the owner approved")]
    fn an_approval_cannot_be_redirected_to_another_recipient() {
        let mut c = setup();
        c.approve_payment("inv-1".to_string(), alex(), U128(NEAR), 3600);
        c.pay(attacker(), U128(NEAR), "inv-1".to_string());
    }

    #[test]
    #[should_panic(expected = "does not match what the owner approved")]
    fn an_approval_cannot_be_used_for_a_different_amount() {
        let mut c = setup();
        c.approve_payment("inv-1".to_string(), alex(), U128(NEAR), 3600);
        c.pay(alex(), U128(2 * NEAR), "inv-1".to_string());
    }

    #[test]
    #[should_panic(expected = "has expired")]
    fn an_expired_approval_does_not_work() {
        let mut c = setup();
        c.approve_payment("inv-1".to_string(), alex(), U128(NEAR), 60);
        ctx(owner(), NS_PER_DAY * 10 + 61 * 1_000_000_000);
        c.pay(alex(), U128(NEAR), "inv-1".to_string());
    }

    #[test]
    #[should_panic(expected = "already used")]
    fn an_approval_works_exactly_once() {
        let mut c = setup();
        c.approve_payment("inv-1".to_string(), alex(), U128(NEAR), 3600);
        c.pay(alex(), U128(NEAR), "inv-1".to_string());
        c.pay(alex(), U128(NEAR), "inv-1".to_string());
    }

    #[test]
    #[should_panic(expected = "recipient is not on the approved list")]
    fn a_cancelled_approval_falls_back_to_the_standing_rules() {
        let mut c = setup();
        c.approve_payment("inv-1".to_string(), attacker(), U128(NEAR), 3600);
        c.cancel_approval("inv-1".to_string());
        c.pay(attacker(), U128(NEAR), "inv-1".to_string());
    }

    #[test]
    #[should_panic(expected = "over the remaining daily limit")]
    fn an_approved_payment_still_counts_against_the_daily_cap() {
        let mut c = setup();
        c.approve_payment("inv-1".to_string(), attacker(), U128(9 * NEAR), 3600);
        c.pay(attacker(), U128(9 * NEAR), "inv-1".to_string());
    }

    #[test]
    #[should_panic(expected = "Only the owner can do this")]
    fn only_the_owner_can_approve_payments() {
        let mut c = setup();
        ctx(attacker(), NS_PER_DAY * 10);
        c.approve_payment("inv-1".to_string(), attacker(), U128(NEAR), 3600);
    }

    #[test]
    fn revenue_is_split_by_the_fixed_shares_and_rounding_dust_stays_in_the_treasury() {
        let mut c = setup();
        c.set_split(vec![
            SplitShare { account_id: alex(), bps: 7000 },
            SplitShare { account_id: bob(), bps: 2000 },
            SplitShare { account_id: carol(), bps: 1000 },
        ]);
        let ctx_b = VMContextBuilder::new()
            .current_account_id(contract_id())
            .predecessor_account_id(attacker())
            .attached_deposit(NearToken::from_yoctonear(10 * NEAR + 1))
            .account_balance(NearToken::from_near(100))
            .block_timestamp(NS_PER_DAY * 10)
            .build();
        testing_env!(ctx_b);
        c.receive_revenue("job-7".to_string());
        let logs = near_sdk::test_utils::get_logs().join("\n");
        assert!(logs.contains(&format!("job-7|{}|{}", alex(), 7 * NEAR)), "{logs}");
        assert!(logs.contains(&format!("job-7|{}|{}", bob(), 2 * NEAR)), "{logs}");
        assert!(logs.contains(&format!("job-7|{}|{}", carol(), NEAR)), "{logs}");
        assert!(logs.contains("job-7|1\""), "dust must be retained: {logs}");
        assert_eq!(c.get_policy().revenue_total.0, 10 * NEAR + 1);
    }

    #[test]
    #[should_panic(expected = "more than 10000")]
    fn a_split_cannot_add_up_to_more_than_100_percent() {
        let mut c = setup();
        c.set_split(vec![
            SplitShare { account_id: alex(), bps: 9000 },
            SplitShare { account_id: bob(), bps: 2000 },
        ]);
    }

    #[test]
    fn the_treasury_keeps_whatever_is_not_paid_out() {
        let mut c = setup();
        c.set_split(vec![
            SplitShare { account_id: alex(), bps: 5000 },
            SplitShare { account_id: owner(), bps: 2000 },
        ]);
        assert_eq!(c.treasury_bps(), 3000);
    }

    #[test]
    #[should_panic(expected = "Duplicate account")]
    fn a_split_cannot_list_the_same_account_twice() {
        let mut c = setup();
        c.set_split(vec![
            SplitShare { account_id: alex(), bps: 5000 },
            SplitShare { account_id: alex(), bps: 5000 },
        ]);
    }

    #[test]
    #[should_panic(expected = "Only the owner can do this")]
    fn only_the_owner_can_change_the_split() {
        let mut c = setup();
        ctx(attacker(), NS_PER_DAY * 10);
        c.set_split(vec![SplitShare { account_id: attacker(), bps: 10_000 }]);
    }

    #[test]
    #[should_panic(expected = "No revenue split")]
    fn revenue_is_refused_until_a_split_exists() {
        let mut c = setup();
        let ctx_b = VMContextBuilder::new()
            .current_account_id(contract_id())
            .predecessor_account_id(attacker())
            .attached_deposit(NearToken::from_near(1))
            .block_timestamp(NS_PER_DAY * 10)
            .build();
        testing_env!(ctx_b);
        c.receive_revenue("x".to_string());
    }
}
