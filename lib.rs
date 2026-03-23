use anchor_lang::prelude::*;

declare_id!("AgntReg11111111111111111111111111111111111");

#[program]
pub mod agent_registry {
    use super::*;

    /// Mendaftarkan agent baru ke registry AgentPay.
    /// Siapapun bisa mendaftarkan agent selama mereka punya wallet Solana.
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        name: String,
        description: String,
        skills: Vec<String>,
        price_per_job: u64,
        endpoint_url: String,
    ) -> Result<()> {
        // Validasi panjang input supaya tidak overflow account storage
        require!(name.len() <= 50, AgentPayError::NameTooLong);
        require!(description.len() <= 200, AgentPayError::DescriptionTooLong);
        require!(skills.len() <= 10, AgentPayError::TooManySkills);
        require!(endpoint_url.len() <= 100, AgentPayError::UrlTooLong);
        require!(price_per_job > 0, AgentPayError::PriceMustBePositive);

        let agent = &mut ctx.accounts.agent_account;
        let clock = Clock::get()?;

        agent.owner = ctx.accounts.owner.key();
        agent.name = name;
        agent.description = description;
        agent.skills = skills;
        agent.price_per_job = price_per_job;
        agent.endpoint_url = endpoint_url;
        agent.is_active = true;
        agent.jobs_completed = 0;
        agent.created_at = clock.unix_timestamp;
        agent.updated_at = clock.unix_timestamp;
        agent.bump = ctx.bumps.agent_account;

        emit!(AgentRegistered {
            owner: agent.owner,
            name: agent.name.clone(),
            price_per_job: agent.price_per_job,
        });

        Ok(())
    }

    /// Update informasi agent yang sudah terdaftar.
    /// Hanya owner agent yang bisa memanggil instruksi ini.
    pub fn update_agent(
        ctx: Context<UpdateAgent>,
        description: Option<String>,
        skills: Option<Vec<String>>,
        price_per_job: Option<u64>,
        endpoint_url: Option<String>,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent_account;
        let clock = Clock::get()?;

        if let Some(desc) = description {
            require!(desc.len() <= 200, AgentPayError::DescriptionTooLong);
            agent.description = desc;
        }

        if let Some(s) = skills {
            require!(s.len() <= 10, AgentPayError::TooManySkills);
            agent.skills = s;
        }

        if let Some(price) = price_per_job {
            require!(price > 0, AgentPayError::PriceMustBePositive);
            agent.price_per_job = price;
        }

        if let Some(url) = endpoint_url {
            require!(url.len() <= 100, AgentPayError::UrlTooLong);
            agent.endpoint_url = url;
        }

        agent.updated_at = clock.unix_timestamp;

        Ok(())
    }

    /// Menonaktifkan agent dari registry.
    /// Agent yang nonaktif tidak bisa di-hire sampai diaktifkan kembali.
    pub fn deactivate_agent(ctx: Context<UpdateAgent>) -> Result<()> {
        let agent = &mut ctx.accounts.agent_account;
        agent.is_active = false;
        agent.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }

    /// Mengaktifkan kembali agent yang sebelumnya nonaktif.
    pub fn reactivate_agent(ctx: Context<UpdateAgent>) -> Result<()> {
        let agent = &mut ctx.accounts.agent_account;
        agent.is_active = true;
        agent.updated_at = Clock::get()?.unix_timestamp;
        Ok(())
    }
}

// =============================================================================
// ACCOUNT STRUCTS
// =============================================================================

/// Data yang disimpan on-chain untuk setiap agent terdaftar.
/// Ukuran dihitung manual di bawah untuk space allocation.
#[account]
pub struct AgentAccount {
    /// Wallet address pemilik agent (32 bytes)
    pub owner: Pubkey,
    /// Nama agent, max 50 karakter
    pub name: String,
    /// Deskripsi kemampuan agent, max 200 karakter
    pub description: String,
    /// List skill tags, max 10 item (misal: ["code", "research", "analysis"])
    pub skills: Vec<String>,
    /// Harga per job dalam lamports (1 SOL = 1_000_000_000 lamports)
    pub price_per_job: u64,
    /// URL endpoint agent untuk menerima job request
    pub endpoint_url: String,
    /// Status ketersediaan agent
    pub is_active: bool,
    /// Counter total job yang sudah diselesaikan
    pub jobs_completed: u64,
    /// Unix timestamp saat agent pertama didaftarkan
    pub created_at: i64,
    /// Unix timestamp update terakhir
    pub updated_at: i64,
    /// PDA bump seed
    pub bump: u8,
}

impl AgentAccount {
    /// Kalkulasi space yang dibutuhkan untuk account ini.
    /// Anchor butuh ini supaya tahu berapa SOL yang perlu di-lock sebagai rent.
    ///
    /// Formula: 8 (discriminator) + size setiap field
    pub const MAX_SIZE: usize =
        8          // discriminator Anchor
        + 32       // owner: Pubkey
        + 4 + 50   // name: String prefix (4) + max chars (50)
        + 4 + 200  // description: String prefix (4) + max chars (200)
        + 4 + (10 * (4 + 20)) // skills: Vec prefix + 10 strings masing-masing max 20 char
        + 8        // price_per_job: u64
        + 4 + 100  // endpoint_url: String prefix (4) + max chars (100)
        + 1        // is_active: bool
        + 8        // jobs_completed: u64
        + 8        // created_at: i64
        + 8        // updated_at: i64
        + 1;       // bump: u8
}

// =============================================================================
// CONTEXT STRUCTS (instruksi apa yang butuh account apa)
// =============================================================================

#[derive(Accounts)]
#[instruction(name: String)]
pub struct RegisterAgent<'info> {
    /// Account baru yang akan menyimpan data agent.
    /// PDA di-derive dari ["agent", owner pubkey, nama agent].
    /// Ini memastikan satu owner bisa punya banyak agent dengan nama berbeda.
    #[account(
        init,
        payer = owner,
        space = AgentAccount::MAX_SIZE,
        seeds = [b"agent", owner.key().as_ref(), name.as_bytes()],
        bump
    )]
    pub agent_account: Account<'info, AgentAccount>,

    /// Wallet yang mendaftarkan dan membiayai pembuatan account.
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Selalu dibutuhkan saat membuat account baru.
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAgent<'info> {
    /// Account agent yang ingin diupdate.
    /// Constraint has_one memastikan hanya owner yang bisa update.
    #[account(
        mut,
        has_one = owner,
        seeds = [b"agent", owner.key().as_ref(), agent_account.name.as_bytes()],
        bump = agent_account.bump
    )]
    pub agent_account: Account<'info, AgentAccount>,

    /// Harus menandatangani transaksi — bukti bahwa memang owner yang update.
    pub owner: Signer<'info>,
}

// =============================================================================
// EVENTS (untuk indexing dan off-chain listeners)
// =============================================================================

/// Event yang di-emit setiap kali agent baru mendaftar.
/// Off-chain indexer bisa listen event ini untuk update UI secara realtime.
#[event]
pub struct AgentRegistered {
    pub owner: Pubkey,
    pub name: String,
    pub price_per_job: u64,
}

// =============================================================================
// ERROR CODES
// =============================================================================

#[error_code]
pub enum AgentPayError {
    #[msg("Nama agent tidak boleh lebih dari 50 karakter")]
    NameTooLong,
    #[msg("Deskripsi tidak boleh lebih dari 200 karakter")]
    DescriptionTooLong,
    #[msg("Maksimal 10 skill per agent")]
    TooManySkills,
    #[msg("URL endpoint tidak boleh lebih dari 100 karakter")]
    UrlTooLong,
    #[msg("Harga harus lebih dari 0 lamports")]
    PriceMustBePositive,
}
