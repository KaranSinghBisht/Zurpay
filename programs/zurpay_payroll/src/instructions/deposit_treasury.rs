use crate::error::ZurpayError;
use crate::state::{Org, TreasuryAccount};
use anchor_lang::prelude::*;
use inco_lightning::cpi::accounts::Operation;
use inco_lightning::cpi::{e_add, new_euint128};
use inco_lightning::types::Euint128;

#[derive(Accounts)]
pub struct DepositTreasury<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [Org::SEED_PREFIX, org.org_id.as_ref()],
        bump = org.bump,
        constraint = org.admin == admin.key() @ ZurpayError::UnauthorizedAdmin
    )]
    pub org: Account<'info, Org>,

    #[account(
        mut,
        seeds = [TreasuryAccount::SEED_PREFIX, org.org_id.as_ref()],
        bump = treasury.bump,
        constraint = treasury.org_id == org.org_id @ ZurpayError::TreasuryOrgMismatch,
        constraint = treasury.admin == admin.key() @ ZurpayError::UnauthorizedAdmin
    )]
    pub treasury: Account<'info, TreasuryAccount>,

    /// CHECK: Inco Lightning program - validated against org.inco_program_id
    #[account(constraint = inco_program.key() == org.inco_program_id @ ZurpayError::InvalidIncoProgram)]
    pub inco_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Deposit encrypted funds into the organization's treasury.
///
/// The `encrypted_amount` is a ciphertext generated client-side using the
/// Inco SDK's encryption functions. This instruction:
/// 1. Creates an encrypted handle from the ciphertext via `new_euint128`
/// 2. Adds the amount to the treasury's encrypted balance via `e_add`
///
/// The admin must encrypt the deposit amount client-side before calling this.
pub fn handler(ctx: Context<DepositTreasury>, encrypted_amount: Vec<u8>) -> Result<()> {
    let treasury = &mut ctx.accounts.treasury;
    let clock = Clock::get()?;

    // Create encrypted handle from the client-provided ciphertext
    let cpi_ctx = CpiContext::new(
        ctx.accounts.inco_program.to_account_info(),
        Operation {
            signer: ctx.accounts.admin.to_account_info(),
        },
    );

    // The 0 is the scalar_byte (input type for euint128)
    let amount_handle = new_euint128(cpi_ctx, encrypted_amount.clone(), 0)?;

    // Get current balance as Euint128
    let current_balance = Euint128(treasury.balance);

    // Add amount to treasury balance
    let cpi_ctx_add = CpiContext::new(
        ctx.accounts.inco_program.to_account_info(),
        Operation {
            signer: ctx.accounts.admin.to_account_info(),
        },
    );

    // e_add returns a new handle for the sum
    let new_balance = e_add(cpi_ctx_add, current_balance, amount_handle, 0)?;

    // Store the new balance handle
    treasury.balance = new_balance.0;

    emit!(TreasuryDeposited {
        org_id: treasury.org_id,
        treasury: treasury.key(),
        deposited_by: ctx.accounts.admin.key(),
        deposited_at: clock.unix_timestamp,
        // Note: We don't emit the amount since it's encrypted
    });

    Ok(())
}

#[event]
pub struct TreasuryDeposited {
    pub org_id: [u8; 32],
    pub treasury: Pubkey,
    pub deposited_by: Pubkey,
    pub deposited_at: i64,
}
