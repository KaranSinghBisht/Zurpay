use anchor_lang::prelude::*;

pub mod error;
pub mod instructions;
pub mod registry;
pub mod state;

use instructions::*;

declare_id!("Cf9tReQuvS6cb4awYPCVozQnCWYdqia62yRShJs2URy9");

#[program]
pub mod zurpay_payroll {
    use super::*;

    pub fn init_org(
        ctx: Context<InitOrg>,
        org_id: [u8; 32],
        treasury_conf_account: Pubkey,
        zk_verifier_program_id: Pubkey,
        inco_program_id: Pubkey,
    ) -> Result<()> {
        instructions::init_org::handler(
            ctx,
            org_id,
            treasury_conf_account,
            zk_verifier_program_id,
            inco_program_id,
        )
    }

    pub fn set_payrun(
        ctx: Context<SetPayrun>,
        payrun_id: [u8; 32],
        merkle_root: [u8; 32],
        total_employees: u32,
        claim_deadline: i64,
    ) -> Result<()> {
        instructions::set_payrun::handler(
            ctx,
            payrun_id,
            merkle_root,
            total_employees,
            claim_deadline,
        )
    }

    pub fn claim<'info>(
        ctx: Context<'_, '_, '_, 'info, Claim<'info>>,
        nullifier_hash: [u8; 32],
        payout_pubkey_hash: [u8; 32],
        salary_commitment: [u8; 32],
        ciphertext_hash: [u8; 32],
        proof_bytes: Vec<u8>,
        public_inputs: Vec<u8>,
        encrypted_amount: Vec<u8>,
    ) -> Result<()> {
        instructions::claim::handler(
            ctx,
            nullifier_hash,
            payout_pubkey_hash,
            salary_commitment,
            ciphertext_hash,
            proof_bytes,
            public_inputs,
            encrypted_amount,
        )
    }

    pub fn close_payrun(ctx: Context<ClosePayrun>) -> Result<()> {
        instructions::close_payrun::handler(ctx)
    }

    pub fn cancel_payrun(ctx: Context<CancelPayrun>) -> Result<()> {
        instructions::cancel_payrun::handler(ctx)
    }

    pub fn init_treasury(ctx: Context<InitTreasury>) -> Result<()> {
        instructions::init_treasury::handler(ctx)
    }

    pub fn deposit_treasury(
        ctx: Context<DepositTreasury>,
        encrypted_amount: Vec<u8>,
    ) -> Result<()> {
        instructions::deposit_treasury::handler(ctx, encrypted_amount)
    }

    pub fn init_employee_conf(ctx: Context<InitEmployeeConf>) -> Result<()> {
        instructions::init_employee_conf::handler(ctx)
    }
}
