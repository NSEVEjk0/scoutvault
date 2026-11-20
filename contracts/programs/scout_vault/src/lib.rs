use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, TransferChecked};

// Replaced with this deployment's public addresses by scripts/create-keys.mjs.
declare_id!("Bs6t2UmHXvxE3WF1upyXTpSkehhUxin7wzZt1c2G8MNV");
const CONFIG_AUTHORITY: Pubkey = pubkey!("9YaY8NLqutg5FkBKCypWGQ3wFUhpE4F3jPqLUwBwfPxo");

const OPEN: u8 = 0;
const CLAIMED: u8 = 1;
const SUBMITTED: u8 = 2;
const DISPUTED: u8 = 3;
const MAX_LIFETIME: i64 = 7 * 24 * 60 * 60;
const MAX_AMOUNT: u64 = 1_000 * 1_000_000;

#[program]
pub mod scout_vault {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, arbiter: Pubkey) -> Result<()> {
        require!(arbiter != Pubkey::default(), VaultError::InvalidArbiter);
        require!(ctx.accounts.mint.decimals == 6, VaultError::InvalidMint);
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.mint = ctx.accounts.mint.key();
        config.arbiter = arbiter;
        config.bump = ctx.bumps.config;
        emit!(Configured { mint: config.mint, arbiter });
        Ok(())
    }

    pub fn create(
        ctx: Context<Create>,
        bounty_id: u64,
        amount: u64,
        expires_at: i64,
        listing_hash: [u8; 32],
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(amount > 0 && amount <= MAX_AMOUNT, VaultError::InvalidAmount);
        require!(expires_at > now && expires_at <= now + MAX_LIFETIME, VaultError::InvalidExpiry);
        require!(listing_hash != [0; 32], VaultError::EmptyHash);
        require!(bounty_id > ctx.accounts.buyer_record.last_id, VaultError::ReusedBountyId);
        ctx.accounts.buyer_record.buyer = ctx.accounts.buyer.key();
        ctx.accounts.buyer_record.last_id = bounty_id;
        ctx.accounts.buyer_record.bump = ctx.bumps.buyer_record;

        let escrow = &mut ctx.accounts.escrow;
        escrow.version = 1;
        escrow.bump = ctx.bumps.escrow;
        escrow.vault_bump = ctx.bumps.vault;
        escrow.status = OPEN;
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.scout = Pubkey::default();
        escrow.mint = ctx.accounts.mint.key();
        escrow.arbiter = ctx.accounts.config.arbiter;
        escrow.bounty_id = bounty_id;
        escrow.amount = amount;
        escrow.expires_at = expires_at;
        escrow.claimed_at = 0;
        escrow.submitted_at = 0;
        escrow.listing_hash = listing_hash;
        escrow.proof_hash = [0; 32];
        escrow.dispute_hash = [0; 32];

        token::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.to_account_info(), TransferChecked {
                from: ctx.accounts.buyer_tokens.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            }),
            amount,
            ctx.accounts.mint.decimals,
        )?;
        emit!(Funded {
            bounty_id, escrow: escrow.key(), buyer: escrow.buyer,
            mint: escrow.mint, amount, expires_at, listing_hash,
        });
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let now = Clock::get()?.unix_timestamp;
        require!(escrow.status == OPEN, VaultError::NotOpen);
        require!(now < escrow.expires_at, VaultError::Expired);
        require!(ctx.accounts.scout.key() != escrow.buyer, VaultError::BuyerCannotScout);
        escrow.scout = ctx.accounts.scout.key();
        escrow.status = CLAIMED;
        escrow.claimed_at = now;
        emit!(Claimed { bounty_id: escrow.bounty_id, escrow: escrow.key(), scout: escrow.scout });
        Ok(())
    }

    pub fn submit_report(ctx: Context<SubmitReport>, proof_hash: [u8; 32]) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == CLAIMED || escrow.status == SUBMITTED, VaultError::NotClaimed);
        require!(Clock::get()?.unix_timestamp < escrow.expires_at, VaultError::Expired);
        require!(proof_hash != [0; 32], VaultError::EmptyHash);
        require!(proof_hash != escrow.proof_hash, VaultError::RepeatedReport);
        escrow.proof_hash = proof_hash;
        escrow.status = SUBMITTED;
        escrow.submitted_at = Clock::get()?.unix_timestamp;
        emit!(ReportSubmitted {
            bounty_id: escrow.bounty_id, escrow: escrow.key(),
            scout: escrow.scout, proof_hash, submitted_at: escrow.submitted_at,
        });
        Ok(())
    }

    pub fn approve(ctx: Context<Approve>, expected_proof_hash: [u8; 32]) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.status == SUBMITTED, VaultError::NoReport);
        require!(escrow.proof_hash == expected_proof_hash, VaultError::WrongReport);
        require!(ctx.accounts.vault.amount >= escrow.amount, VaultError::Underfunded);
        let id = escrow.bounty_id.to_le_bytes();
        let seeds: &[&[u8]] = &[b"bounty", escrow.buyer.as_ref(), &id, &[escrow.bump]];
        // Include unsolicited token donations so they cannot prevent account closure.
        let transferred = ctx.accounts.vault.amount;
        transfer_and_close(
            &ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.mint,
            &ctx.accounts.scout_tokens, &escrow.to_account_info(),
            &ctx.accounts.buyer.to_account_info(), transferred, seeds,
        )?;
        emit!(Paid {
            bounty_id: escrow.bounty_id, escrow: escrow.key(), buyer: escrow.buyer,
            scout: escrow.scout, mint: escrow.mint, pledged_amount: escrow.amount,
            transferred_amount: transferred, proof_hash: escrow.proof_hash,
        });
        Ok(())
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        let expired = Clock::get()?.unix_timestamp >= escrow.expires_at;
        require!(escrow.status == OPEN || (escrow.status == CLAIMED && expired), VaultError::CannotRefund);
        require!(ctx.accounts.vault.amount >= escrow.amount, VaultError::Underfunded);
        let id = escrow.bounty_id.to_le_bytes();
        let seeds: &[&[u8]] = &[b"bounty", escrow.buyer.as_ref(), &id, &[escrow.bump]];
        let amount = ctx.accounts.vault.amount;
        transfer_and_close(
            &ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.mint,
            &ctx.accounts.buyer_tokens, &escrow.to_account_info(),
            &ctx.accounts.buyer.to_account_info(), amount, seeds,
        )?;
        emit!(Refunded { bounty_id: escrow.bounty_id, escrow: escrow.key(), buyer: escrow.buyer, amount });
        Ok(())
    }

    pub fn dispute(ctx: Context<Dispute>, reason_hash: [u8; 32]) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == SUBMITTED, VaultError::NoReport);
        require!(reason_hash != [0; 32], VaultError::EmptyHash);
        escrow.status = DISPUTED;
        escrow.dispute_hash = reason_hash;
        emit!(ReportDisputed {
            bounty_id: escrow.bounty_id, escrow: escrow.key(),
            buyer: escrow.buyer, reason_hash, arbiter: escrow.arbiter,
        });
        Ok(())
    }

    pub fn resolve(ctx: Context<Resolve>, pay_scout: bool) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        require!(escrow.status == DISPUTED, VaultError::NotDisputed);
        require!(ctx.accounts.vault.amount >= escrow.amount, VaultError::Underfunded);
        let id = escrow.bounty_id.to_le_bytes();
        let seeds: &[&[u8]] = &[b"bounty", escrow.buyer.as_ref(), &id, &[escrow.bump]];
        let destination = if pay_scout { &ctx.accounts.scout_tokens } else { &ctx.accounts.buyer_tokens };
        let amount = ctx.accounts.vault.amount;
        transfer_and_close(
            &ctx.accounts.token_program, &ctx.accounts.vault, &ctx.accounts.mint,
            destination, &escrow.to_account_info(), &ctx.accounts.buyer.to_account_info(), amount, seeds,
        )?;
        emit!(DisputeResolved {
            bounty_id: escrow.bounty_id, escrow: escrow.key(), arbiter: escrow.arbiter,
            buyer: escrow.buyer, scout: escrow.scout, amount, pay_scout,
        });
        Ok(())
    }
}

fn transfer_and_close<'info>(
    program: &Program<'info, Token>, vault: &Account<'info, TokenAccount>, mint: &Account<'info, Mint>,
    destination: &Account<'info, TokenAccount>, authority: &AccountInfo<'info>,
    rent_recipient: &AccountInfo<'info>, amount: u64, seeds: &[&[u8]],
) -> Result<()> {
    let signer = &[seeds];
    token::transfer_checked(
        CpiContext::new_with_signer(program.to_account_info(), TransferChecked {
            from: vault.to_account_info(), mint: mint.to_account_info(),
            to: destination.to_account_info(), authority: authority.clone(),
        }, signer), amount, mint.decimals,
    )?;
    token::close_account(CpiContext::new_with_signer(program.to_account_info(), CloseAccount {
        account: vault.to_account_info(), destination: rent_recipient.clone(), authority: authority.clone(),
    }, signer))?;
    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut, address = CONFIG_AUTHORITY)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    pub mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bounty_id: u64)]
pub struct Create<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = mint)]
    pub config: Account<'info, Config>,
    #[account(init_if_needed, payer = buyer, space = 8 + BuyerRecord::INIT_SPACE,
        seeds = [b"buyer", buyer.key().as_ref()], bump)]
    pub buyer_record: Account<'info, BuyerRecord>,
    pub mint: Account<'info, Mint>,
    #[account(init, payer = buyer, space = 8 + Escrow::INIT_SPACE,
        seeds = [b"bounty", buyer.key().as_ref(), &bounty_id.to_le_bytes()], bump)]
    pub escrow: Account<'info, Escrow>,
    #[account(init, payer = buyer, seeds = [b"vault", escrow.key().as_ref()], bump,
        token::mint = mint, token::authority = escrow)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = buyer)]
    pub buyer_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    pub scout: Signer<'info>,
    #[account(mut, seeds = [b"bounty", escrow.buyer.as_ref(), &escrow.bounty_id.to_le_bytes()], bump = escrow.bump)]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct SubmitReport<'info> {
    pub scout: Signer<'info>,
    #[account(mut, seeds = [b"bounty", escrow.buyer.as_ref(), &escrow.bounty_id.to_le_bytes()],
        bump = escrow.bump, has_one = scout)]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct Approve<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut, close = buyer, seeds = [b"bounty", escrow.buyer.as_ref(), &escrow.bounty_id.to_le_bytes()],
        bump = escrow.bump, has_one = buyer, has_one = scout, has_one = mint)]
    pub escrow: Account<'info, Escrow>,
    /// CHECK: Public recipient is constrained to the assigned scout; no identity claim is made.
    pub scout: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault", escrow.key().as_ref()], bump = escrow.vault_bump,
        token::mint = mint, token::authority = escrow)]
    pub vault: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = buyer, associated_token::mint = mint, associated_token::authority = scout)]
    pub scout_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut, close = buyer, seeds = [b"bounty", escrow.buyer.as_ref(), &escrow.bounty_id.to_le_bytes()],
        bump = escrow.bump, has_one = buyer, has_one = mint)]
    pub escrow: Account<'info, Escrow>,
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault", escrow.key().as_ref()], bump = escrow.vault_bump,
        token::mint = mint, token::authority = escrow)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = buyer)]
    pub buyer_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Dispute<'info> {
    pub buyer: Signer<'info>,
    #[account(mut, seeds = [b"bounty", escrow.buyer.as_ref(), &escrow.bounty_id.to_le_bytes()],
        bump = escrow.bump, has_one = buyer)]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct Resolve<'info> {
    #[account(mut)]
    pub arbiter: Signer<'info>,
    /// CHECK: The recorded buyer receives only their account rent and any refund.
    #[account(mut, address = escrow.buyer)]
    pub buyer: UncheckedAccount<'info>,
    /// CHECK: The recipient address is frozen when the bounty is claimed.
    #[account(address = escrow.scout)]
    pub scout: UncheckedAccount<'info>,
    #[account(mut, close = buyer, seeds = [b"bounty", escrow.buyer.as_ref(), &escrow.bounty_id.to_le_bytes()],
        bump = escrow.bump, has_one = arbiter, has_one = mint)]
    pub escrow: Account<'info, Escrow>,
    pub mint: Account<'info, Mint>,
    #[account(mut, seeds = [b"vault", escrow.key().as_ref()], bump = escrow.vault_bump,
        token::mint = mint, token::authority = escrow)]
    pub vault: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = arbiter, associated_token::mint = mint, associated_token::authority = buyer)]
    pub buyer_tokens: Account<'info, TokenAccount>,
    #[account(init_if_needed, payer = arbiter, associated_token::mint = mint, associated_token::authority = scout)]
    pub scout_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub arbiter: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub version: u8,
    pub bump: u8,
    pub vault_bump: u8,
    pub status: u8,
    pub buyer: Pubkey,
    pub scout: Pubkey,
    pub mint: Pubkey,
    pub arbiter: Pubkey,
    pub bounty_id: u64,
    pub amount: u64,
    pub expires_at: i64,
    pub claimed_at: i64,
    pub submitted_at: i64,
    pub listing_hash: [u8; 32],
    pub proof_hash: [u8; 32],
    pub dispute_hash: [u8; 32],
}

#[account]
#[derive(InitSpace)]
pub struct BuyerRecord {
    pub buyer: Pubkey,
    pub last_id: u64,
    pub bump: u8,
}

#[event]
pub struct Configured { pub mint: Pubkey, pub arbiter: Pubkey }
#[event]
pub struct Funded {
    pub bounty_id: u64, pub escrow: Pubkey, pub buyer: Pubkey, pub mint: Pubkey,
    pub amount: u64, pub expires_at: i64, pub listing_hash: [u8; 32],
}
#[event]
pub struct Claimed { pub bounty_id: u64, pub escrow: Pubkey, pub scout: Pubkey }
#[event]
pub struct ReportSubmitted {
    pub bounty_id: u64, pub escrow: Pubkey, pub scout: Pubkey, pub proof_hash: [u8; 32], pub submitted_at: i64,
}
#[event]
pub struct Paid {
    pub bounty_id: u64, pub escrow: Pubkey, pub buyer: Pubkey, pub scout: Pubkey, pub mint: Pubkey,
    pub pledged_amount: u64, pub transferred_amount: u64, pub proof_hash: [u8; 32],
}
#[event]
pub struct Refunded { pub bounty_id: u64, pub escrow: Pubkey, pub buyer: Pubkey, pub amount: u64 }
#[event]
pub struct ReportDisputed {
    pub bounty_id: u64, pub escrow: Pubkey, pub buyer: Pubkey, pub reason_hash: [u8; 32], pub arbiter: Pubkey,
}
#[event]
pub struct DisputeResolved {
    pub bounty_id: u64, pub escrow: Pubkey, pub arbiter: Pubkey, pub buyer: Pubkey, pub scout: Pubkey,
    pub amount: u64, pub pay_scout: bool,
}

#[error_code]
pub enum VaultError {
    #[msg("Choose a nonzero review wallet.")] InvalidArbiter,
    #[msg("The configured token must have six decimals.")] InvalidMint,
    #[msg("The bounty must be greater than zero and no more than 1,000 tokens.")] InvalidAmount,
    #[msg("Choose an expiry within the next seven days.")] InvalidExpiry,
    #[msg("A listing or report hash cannot be empty.")] EmptyHash,
    #[msg("Someone has already claimed this bounty.")] NotOpen,
    #[msg("This bounty has expired.")] Expired,
    #[msg("The buyer cannot claim their own bounty.")] BuyerCannotScout,
    #[msg("Only the assigned scout can submit a report.")] NotClaimed,
    #[msg("This report has already been submitted.")] RepeatedReport,
    #[msg("Submit a report before approving or disputing it.")] NoReport,
    #[msg("The token vault does not hold the pledged reward.")] Underfunded,
    #[msg("Only open or expired unfinished bounties can be refunded.")] CannotRefund,
    #[msg("Only a disputed report can be resolved.")] NotDisputed,
    #[msg("Choose a new bounty id. A completed id cannot be reused.")] ReusedBountyId,
    #[msg("The scout updated the report. Review the latest version before paying.")] WrongReport,
}
