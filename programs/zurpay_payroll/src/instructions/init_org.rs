use anchor_lang::prelude::*;
use crate::state::Org;
use crate::error::ZurpayError;
use crate::registry::{is_approved_verifier, is_approved_inco};

#[derive(Accounts)]
#[instruction(org_id: [u8; 32])]
pub struct InitOrg<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    
    #[account(
        init,
        payer = admin,
        space = 8 + Org::INIT_SPACE,
        seeds = [Org::SEED_PREFIX, org_id.as_ref()],
        bump
    )]
    pub org: Account<'info, Org>,
    
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitOrg>,
    org_id: [u8; 32],
    treasury_conf_account: Pubkey,
    zk_verifier_program_id: Pubkey,
    inco_program_id: Pubkey,
) -> Result<()> {
    require!(
        is_approved_verifier(&zk_verifier_program_id),
        ZurpayError::VerifierNotInRegistry
    );
    
    require!(
        is_approved_inco(&inco_program_id),
        ZurpayError::IncoNotInRegistry
    );

    let org = &mut ctx.accounts.org;
    let clock = Clock::get()?;
    
    org.org_id = org_id;
    org.admin = ctx.accounts.admin.key();
    org.treasury_conf_account = treasury_conf_account;
    org.zk_verifier_program_id = zk_verifier_program_id;
    org.inco_program_id = inco_program_id;
    org.payrun_counter = 0;
    org.created_at = clock.unix_timestamp;
    org.bump = ctx.bumps.org;
    
    emit!(OrgInitialized {
        org_id,
        admin: org.admin,
        treasury_conf_account,
        zk_verifier_program_id,
        inco_program_id,
    });
    
    Ok(())
}

#[event]
pub struct OrgInitialized {
    pub org_id: [u8; 32],
    pub admin: Pubkey,
    pub treasury_conf_account: Pubkey,
    pub zk_verifier_program_id: Pubkey,
    pub inco_program_id: Pubkey,
}
