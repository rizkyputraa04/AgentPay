use anchor_lang::prelude::*;

declare_id!("Fpp4D9vgStYwnwoukyFG38n3ZF18pS6kfBbdUdKAxw9h");

#[program]
pub mod agentpay_contracts {
    use super::*;

    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        name: String,
        description: String,
        skills: Vec<String>,
        price_per_job: u64,
        endpoint_url: String,
    ) -> Result<()> {
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
        agent.bump = ctx.bumps.agent_account;

        Ok(())
    }

    pub fn update_agent(
        ctx: Context<UpdateAgent>,
        description: Option<String>,
        skills: Option<Vec<String>>,
        price_per_job: Option<u64>,
        endpoint_url: Option<String>,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent_account;

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

        Ok(())
    }

    pub fn deactivate_agent(ctx: Context<UpdateAgent>) -> Result<()> {
        ctx.accounts.agent_account.is_active = false;
        Ok(())
    }

    pub fn reactivate_agent(ctx: Context<UpdateAgent>) -> Result<()> {
        ctx.accounts.agent_account.is_active = true;
        Ok(())
    }
}

#[account]
pub struct AgentAccount {
    pub owner: Pubkey,
    pub name: String,
    pub description: String,
    pub skills: Vec<String>,
    pub price_per_job: u64,
    pub endpoint_url: String,
    pub is_active: bool,
    pub jobs_completed: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl AgentAccount {
    pub const MAX_SIZE: usize =
        8
        + 32
        + 4 + 50
        + 4 + 200
        + 4 + (10 * (4 + 20))
        + 8
        + 4 + 100
        + 1
        + 8
        + 8
        + 1;
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = owner,
        space = AgentAccount::MAX_SIZE,
        seeds = [b"agent", owner.key().as_ref(), name.as_bytes()],
        bump
    )]
    pub agent_account: Account<'info, AgentAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAgent<'info> {
    #[account(
        mut,
        has_one = owner,
        seeds = [b"agent", owner.key().as_ref(), agent_account.name.as_bytes()],
        bump = agent_account.bump
    )]
    pub agent_account: Account<'info, AgentAccount>,

    pub owner: Signer<'info>,
}

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
