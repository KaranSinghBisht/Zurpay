use crate::error::ZurpayError;
use crate::state::{Org, TreasuryAccount};
use anchor_lang::prelude::*;
use inco_lightning::cpi::accounts::Operation;
use inco_lightning::cpi::as_euint128;

#[derive(Accounts)]
pub struct InitTreasury<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [Org::SEED_PREFIX, org.org_id.as_ref()],
        bump = org.bump,
        constraint = org.admin == admin.key() @ ZurpayError::UnauthorizedAdmin
    )]
    pub org: Account<'info, Org>,

    #[account(
        init,
        payer = admin,
        space = 8 + TreasuryAccount::INIT_SPACE,
        seeds = [TreasuryAccount::SEED_PREFIX, org.org_id.as_ref()],
        bump
    )]
    pub treasury: Account<'info, TreasuryAccount>,

    /// CHECK: Inco Lightning program - validated against org.inco_program_id
    #[account(constraint = inco_program.key() == org.inco_program_id @ ZurpayError::InvalidIncoProgram)]
    pub inco_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Initialize a treasury account for an organization.
///
/// The treasury stores an encrypted balance (Euint128 handle) that represents
/// the organization's funds available for payroll claims. The balance is
/// initialized to encrypted zero using Inco's trivial encryption.
pub fn handler(ctx: Context<InitTreasury>) -> Result<()> {
    let org = &ctx.accounts.org;
    let treasury = &mut ctx.accounts.treasury;
    let clock = Clock::get()?;

    // Create encrypted zero using trivial encryption
    let cpi_ctx = CpiContext::new(
        ctx.accounts.inco_program.to_account_info(),
        Operation {
            signer: ctx.accounts.admin.to_account_info(),
        },
    );
    let encrypted_zero = as_euint128(cpi_ctx, 0)?;

    treasury.org_id = org.org_id;
    treasury.admin = ctx.accounts.admin.key();
    treasury.balance = encrypted_zero.0; // Store the handle as u128
    treasury.bump = ctx.bumps.treasury;

    emit!(TreasuryInitialized {
        org_id: org.org_id,
        treasury: treasury.key(),
        admin: treasury.admin,
        initialized_at: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct TreasuryInitialized {
    pub org_id: [u8; 32],
    pub treasury: Pubkey,
    pub admin: Pubkey,
    pub initialized_at: i64,
}
