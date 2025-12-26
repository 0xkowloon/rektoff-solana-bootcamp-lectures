use anchor_lang::prelude::*;

declare_id!("5vLwqKbQySVMBASDCC88rgJpxPifbFatP6R7vLwAZzmi");

#[program]
pub mod account_4 {
    use super::*;

    // Account structures
    #[account]
    pub struct CollectionAuthority {
        pub authority: Pubkey,
        pub collection_id: u64,
        pub collection_name: String,
        pub can_mint: u64,
    }

    #[account]
    pub struct UserVault {
        pub vault_name: String,
        pub balance: u64,
    }

    // Context structures
    #[derive(Accounts)]
    #[instruction(collection_id: u64, collection_name: String)]
    pub struct InitializeCollectionAuthority<'info> {
        #[account(
            init,
            payer = payer,
            space = 8 + 32 + 8 + 4 + collection_name.len() + 8,
            seeds = [
                b"authority",
                collection_id.to_le_bytes().as_ref(),
                collection_name.as_bytes()
            ],
            bump
        )]
        pub collection_authority: Account<'info, CollectionAuthority>,
        #[account(mut)]
        pub payer: Signer<'info>,
        pub system_program: Program<'info, System>,
    }

    #[derive(Accounts)]
    pub struct ToggleCollectionMinting<'info> {
        #[account(
            mut,
            has_one = authority,
        )]
        pub collection_authority: Account<'info, CollectionAuthority>,
        #[account(mut)]
        pub authority: Signer<'info>,
        pub system_program: Program<'info, System>,
    }

    #[derive(Accounts)]
    #[instruction(user: Pubkey, vault_name: String)]
    pub struct InitializeUserVault<'info> {
        #[account(
            init,
            payer = payer,
            space = 8 + 4 + vault_name.len() + 8,
            seeds = [
                b"user_vault",
                user.key().as_ref(),
                vault_name.as_bytes()
            ],
            bump
        )]
        pub user_vault: Account<'info, UserVault>,
        #[account(mut)]
        pub payer: Signer<'info>,
        pub system_program: Program<'info, System>,
    }

    #[derive(Accounts)]
    #[instruction(user: Pubkey, collection_id: u64, collection_name: String)]
    pub struct MintNft<'info> {
        #[account(
            seeds = [
                b"authority",
                collection_id.to_le_bytes().as_ref(),
                collection_name.as_bytes()
            ],
            bump
        )]
        pub collection_authority: Account<'info, CollectionAuthority>,
        #[account(
            mut,
            seeds = [
                b"user_vault",
                user.key().as_ref(),
                collection_name.as_bytes()
            ],
            bump
        )]
        pub user_vault: Account<'info, UserVault>,
        #[account(mut)]
        pub payer: Signer<'info>,
    }

    #[derive(Accounts)]
    #[instruction(vault_name: String)]
    pub struct DepositToVault<'info> {
        #[account(
            mut,
            seeds = [
                b"user_vault",
                user.key().as_ref(),
                vault_name.as_bytes()
            ],
            bump
        )]
        pub user_vault: Account<'info, UserVault>,
        #[account(
            init_if_needed,
            payer = user,
            space = 8 + 4 + vault_name.len() + 8,
            seeds = [
                b"authority",
                user.key().as_ref(),
                vault_name.as_bytes()
            ],
            bump
        )]
        pub vault_authority: Account<'info, UserVault>,

        #[account(mut)]
        pub user: Signer<'info>,

        pub system_program: Program<'info, System>,
    }

    #[derive(Accounts)]
    #[instruction(vault_name: String)]
    pub struct WithdrawFromVault<'info> {
        #[account(
            mut,
            seeds = [
                b"user_vault",
                user.key().as_ref(),
                vault_name.as_bytes()
            ],
            bump
        )]
        pub user_vault: Account<'info, UserVault>,
        #[account(
            mut,
            seeds = [
                b"authority",
                user.key().as_ref(),
                vault_name.as_bytes()
            ],
            bump
        )]
        pub vault_authority: Account<'info, UserVault>,
        #[account(mut)]
        pub user: Signer<'info>,
    }

    // Program instructions
    pub fn initialize_collection_authority(
        ctx: Context<InitializeCollectionAuthority>,
        collection_id: u64,
        collection_name: String,
        authority: Pubkey,
    ) -> Result<()> {
        let collection_authority = &mut ctx.accounts.collection_authority;
        collection_authority.authority = authority;
        collection_authority.collection_id = collection_id;
        collection_authority.collection_name = collection_name;
        collection_authority.can_mint = 1;
        Ok(())
    }

    pub fn toggle_collection_minting(
        ctx: Context<ToggleCollectionMinting>,
    ) -> Result<()> {
        let authority = &mut ctx.accounts.collection_authority;
        authority.can_mint = 1 - authority.can_mint;
        Ok(())
    }

    pub fn initialize_user_vault(
        ctx: Context<InitializeUserVault>,
        user: Pubkey,
        vault_name: String,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.user_vault;
        vault.vault_name = vault_name;
        vault.balance = 0;
        Ok(())
    }

    pub fn mint_nft(
        ctx: Context<MintNft>,
        user: Pubkey,
        collection_id: u64,
        collection_name: String,
    ) -> Result<()> {
        msg!(
            "Minting NFT for collection {} with ID {}",
            collection_name,
            collection_id
        );
        require!(ctx.accounts.collection_authority.can_mint == 1, ErrorCode::NotMintable);

        let vault = &mut ctx.accounts.user_vault;
        vault.balance += 1;

        msg!(
            "Minted NFT for collection {} with ID {}",
            collection_name,
            collection_id
        );

        Ok(())
    }

    pub fn deposit_to_vault(
        ctx: Context<DepositToVault>,
        vault_name: String,
        amount: u64,
    ) -> Result<()> {
        let user_vault = &mut ctx.accounts.user_vault;
        let vault_authority = &mut ctx.accounts.vault_authority;

        user_vault.balance = user_vault.balance.checked_sub(amount).ok_or(ErrorCode::InsufficientBalance)?;
        vault_authority.balance = vault_authority.balance.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;

        msg!(
            "Deposited {} tokens to vault '{}' for user {}",
            amount,
            vault_name,
            &ctx.accounts.user.key()
        );
        Ok(())
    }

    pub fn withdraw_from_vault(
        ctx: Context<WithdrawFromVault>,
        vault_name: String,
        amount: u64,
    ) -> Result<()> {
        let user_vault = &mut ctx.accounts.user_vault;
        let vault_authority = &mut ctx.accounts.vault_authority;

        vault_authority.balance = vault_authority.balance.checked_sub(amount).ok_or(ErrorCode::InsufficientBalance)?;
        user_vault.balance = user_vault.balance.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;

        msg!(
            "Withdrew {} tokens from vault '{}' for user {}",
            amount,
            vault_name,
            &ctx.accounts.user.key()
        );
        Ok(())
    }
}

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Not mintable")]
    NotMintable,
}
