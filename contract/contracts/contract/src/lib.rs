#![allow(non_snake_case)]
#![no_std]
use soroban_sdk::{contract, contracttype, contractimpl, log, Env, Symbol, symbol_short};

// Tracks global insurance pool statistics
#[contracttype]
#[derive(Clone)]
pub struct PoolStatus {
    pub total_policies: u64,   // Total policies ever created
    pub active_policies: u64,  // Currently active (unexpired, unclaimed) policies
    pub total_claims: u64,     // Total claims submitted
    pub settled_claims: u64,   // Claims that have been settled/paid out
}

// Symbol key for the global pool status
const POOL_STATUS: Symbol = symbol_short!("POOL_STAT");

// Symbol key for tracking unique policy IDs
const COUNT_POLICY: Symbol = symbol_short!("C_POLICY");

// Maps a policy unique ID → PolicyRecord
#[contracttype]
pub enum PolicyBook {
    Policy(u64),
}

// Maps a claim unique ID → ClaimRecord
#[contracttype]
pub enum ClaimBook {
    Claim(u64),
}

// Symbol key for tracking unique claim IDs
const COUNT_CLAIM: Symbol = symbol_short!("C_CLAIM");

// Represents an insurance policy purchased by a user
#[contracttype]
#[derive(Clone)]
pub struct PolicyRecord {
    pub policy_id: u64,       // Unique identifier for this policy
    pub coverage_amount: u64, // Maximum payout amount (in base units)
    pub premium_paid: u64,    // Premium paid by the policyholder (in base units)
    pub start_time: u64,      // Ledger timestamp when policy was activated
    pub end_time: u64,        // Ledger timestamp when policy expires
    pub is_active: bool,      // True if policy is still active
    pub is_claimed: bool,     // True if a successful claim has been made
}

// Represents a claim filed against an active policy
#[contracttype]
#[derive(Clone)]
pub struct ClaimRecord {
    pub claim_id: u64,        // Unique identifier for this claim
    pub policy_id: u64,       // The policy this claim is filed against
    pub claim_amount: u64,    // Amount requested (must be <= coverage_amount)
    pub filed_time: u64,      // Ledger timestamp when claim was filed
    pub is_settled: bool,     // True once the admin has settled/paid out the claim
}

#[contract]
pub struct InsuranceContract;

#[contractimpl]
impl InsuranceContract {

    /// Creates a new insurance policy.
    /// - `coverage_amount`: maximum payout the policy covers
    /// - `premium_paid`   : premium amount the user has deposited
    /// - `duration_secs`  : how long (in seconds) the policy should remain active
    /// Returns the unique policy_id of the newly created policy.
    pub fn create_policy(
        env: Env,
        coverage_amount: u64,
        premium_paid: u64,
        duration_secs: u64,
    ) -> u64 {
        // Basic validation
        if coverage_amount == 0 || premium_paid == 0 || duration_secs == 0 {
            log!(&env, "Invalid parameters: all values must be > 0");
            panic!("Invalid parameters: coverage_amount, premium_paid, and duration_secs must all be greater than 0");
        }

        // Increment policy counter
        let mut count: u64 = env.storage().instance().get(&COUNT_POLICY).unwrap_or(0);
        count += 1;

        let now = env.ledger().timestamp();

        let policy = PolicyRecord {
            policy_id: count,
            coverage_amount,
            premium_paid,
            start_time: now,
            end_time: now + duration_secs,
            is_active: true,
            is_claimed: false,
        };

        // Update global pool stats
        let mut pool = Self::view_pool_status(env.clone());
        pool.total_policies += 1;
        pool.active_policies += 1;

        // Persist everything
        env.storage().instance().set(&PolicyBook::Policy(count), &policy);
        env.storage().instance().set(&COUNT_POLICY, &count);
        env.storage().instance().set(&POOL_STATUS, &pool);
        env.storage().instance().extend_ttl(5000, 5000);

        log!(&env, "Policy created with ID: {}", count);
        count
    }

    /// Files a claim against an existing active policy.
    /// - `policy_id`    : the policy to claim against
    /// - `claim_amount` : the amount being claimed (must be <= coverage_amount)
    /// Returns the unique claim_id of the filed claim.
    pub fn file_claim(env: Env, policy_id: u64, claim_amount: u64) -> u64 {
        let mut policy: PolicyRecord = env
            .storage()
            .instance()
            .get(&PolicyBook::Policy(policy_id))
            .unwrap_or_else(|| {
                panic!("Policy not found");
            });

        let now = env.ledger().timestamp();

        // Policy must be active and not expired
        if !policy.is_active {
            log!(&env, "Policy {} is not active", policy_id);
            panic!("Policy is not active");
        }
        if policy.is_claimed {
            log!(&env, "Policy {} already has a settled claim", policy_id);
            panic!("A claim has already been settled for this policy");
        }
        if now > policy.end_time {
            // Auto-deactivate expired policy
            policy.is_active = false;
            env.storage().instance().set(&PolicyBook::Policy(policy_id), &policy);
            log!(&env, "Policy {} has expired", policy_id);
            panic!("Policy has expired");
        }
        if claim_amount == 0 || claim_amount > policy.coverage_amount {
            log!(&env, "Invalid claim amount: {}", claim_amount);
            panic!("Claim amount must be > 0 and <= coverage_amount");
        }

        // Increment claim counter
        let mut count: u64 = env.storage().instance().get(&COUNT_CLAIM).unwrap_or(0);
        count += 1;

        let claim = ClaimRecord {
            claim_id: count,
            policy_id,
            claim_amount,
            filed_time: now,
            is_settled: false,
        };

        // Update global pool stats
        let mut pool = Self::view_pool_status(env.clone());
        pool.total_claims += 1;

        // Persist everything
        env.storage().instance().set(&ClaimBook::Claim(count), &claim);
        env.storage().instance().set(&COUNT_CLAIM, &count);
        env.storage().instance().set(&POOL_STATUS, &pool);
        env.storage().instance().extend_ttl(5000, 5000);

        log!(&env, "Claim filed with ID: {} against Policy ID: {}", count, policy_id);
        count
    }

    /// Settles (pays out) a pending claim. Called by the admin/insurer.
    /// - `claim_id`: the claim to settle
    /// Marks the claim as settled and the underlying policy as claimed & inactive.
    pub fn settle_claim(env: Env, claim_id: u64) {
        let mut claim: ClaimRecord = env
            .storage()
            .instance()
            .get(&ClaimBook::Claim(claim_id))
            .unwrap_or_else(|| {
                panic!("Claim not found");
            });

        if claim.is_settled {
            log!(&env, "Claim {} is already settled", claim_id);
            panic!("Claim is already settled");
        }

        // Mark claim as settled
        claim.is_settled = true;
        env.storage().instance().set(&ClaimBook::Claim(claim_id), &claim);

        // Mark associated policy as claimed and inactive
        let mut policy: PolicyRecord = env
            .storage()
            .instance()
            .get(&PolicyBook::Policy(claim.policy_id))
            .unwrap_or_else(|| {
                panic!("Associated policy not found");
            });

        policy.is_claimed = true;
        policy.is_active = false;
        env.storage().instance().set(&PolicyBook::Policy(claim.policy_id), &policy);

        // Update global pool stats
        let mut pool = Self::view_pool_status(env.clone());
        pool.settled_claims += 1;
        pool.active_policies = pool.active_policies.saturating_sub(1);
        env.storage().instance().set(&POOL_STATUS, &pool);

        env.storage().instance().extend_ttl(5000, 5000);

        log!(&env, "Claim ID: {} settled. Policy ID: {} is now inactive.", claim_id, claim.policy_id);
    }

    // --- View Functions ---

    /// Returns the global insurance pool statistics.
    pub fn view_pool_status(env: Env) -> PoolStatus {
        env.storage().instance().get(&POOL_STATUS).unwrap_or(PoolStatus {
            total_policies: 0,
            active_policies: 0,
            total_claims: 0,
            settled_claims: 0,
        })
    }

    /// Returns the details of a specific policy by its ID.
    pub fn view_policy(env: Env, policy_id: u64) -> PolicyRecord {
        env.storage()
            .instance()
            .get(&PolicyBook::Policy(policy_id))
            .unwrap_or(PolicyRecord {
                policy_id: 0,
                coverage_amount: 0,
                premium_paid: 0,
                start_time: 0,
                end_time: 0,
                is_active: false,
                is_claimed: false,
            })
    }

    /// Returns the details of a specific claim by its ID.
    pub fn view_claim(env: Env, claim_id: u64) -> ClaimRecord {
        env.storage()
            .instance()
            .get(&ClaimBook::Claim(claim_id))
            .unwrap_or(ClaimRecord {
                claim_id: 0,
                policy_id: 0,
                claim_amount: 0,
                filed_time: 0,
                is_settled: false,
            })
    }
}