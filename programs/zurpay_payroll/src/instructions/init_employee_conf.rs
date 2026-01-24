use crate::state::{EmployeeConfAccount, Org};
use anchor_lang::prelude::*;
use inco_lightning::cpi::accounts::Operation;
use inco_lightning::cpi::as_euint128;

#[derive(Accounts)]
pub struct InitEmployeeConf<'info> {
    #[account(mut)]
    pub employee: Signer<'info>,

    #[account(
        seeds = [Org::SEED_PREFIX, org.org_id.as_ref()],
        bump = org.bump
    )]
    pub org: Account<'info, Org>,

    #[account(
        init,
        payer = employee,
        space = 8 + EmployeeConfAccount::INIT_SPACE,
        seeds = [EmployeeConfAccount::SEED_PREFIX, org.org_id.as_ref(), employee.key().as_ref()],
        bump
    )]
    pub employee_conf: Account<'info, EmployeeConfAccount>,

    /// CHECK: Validated against org.inco_program_id
    #[account(constraint = inco_program.key() == org.inco_program_id)]
    pub inco_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitEmployeeConf>) -> Result<()> {
    let employee_conf = &mut ctx.accounts.employee_conf;
    let org = &ctx.accounts.org;

    employee_conf.owner = ctx.accounts.employee.key();
    employee_conf.org_id = org.org_id;
    employee_conf.bump = ctx.bumps.employee_conf;

    let zero_balance = as_euint128(
        CpiContext::new(
            ctx.accounts.inco_program.to_account_info(),
            Operation {
                signer: ctx.accounts.employee.to_account_info(),
            },
        ),
        0u128,
    )?;

    employee_conf.balance = zero_balance.0;

    emit!(EmployeeConfInitialized {
        owner: employee_conf.owner,
        org_id: org.org_id,
        conf_account: employee_conf.key(),
    });

    Ok(())
}

#[event]
pub struct EmployeeConfInitialized {
    pub owner: Pubkey,
    pub org_id: [u8; 32],
    pub conf_account: Pubkey,
}
