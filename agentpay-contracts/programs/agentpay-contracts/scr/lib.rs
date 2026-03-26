use anchor_lang::prelude::*;

declare_id!("Fpp4D9vgStYwnwoukyFG38n3ZF18pS6kfBbdUdKAxw9h");

#[program]
pub mod agentpay_contracts {
    use super::*;

    // ============================================================
    // AGENT REGISTRY
    // ============================================================

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

    // ============================================================
    // ESCROW CONTRACT
    // ============================================================

    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        job_id: String,
        amount: u64,
        job_description: String,
    ) -> Result<()> {
        require!(job_id.len() <= 32, AgentPayError::JobIdTooLong);
        require!(job_description.len() <= 200, AgentPayError::DescriptionTooLong);
        require!(amount > 0, AgentPayError::AmountMustBePositive);

        let protocol_fee = amount
            .checked_mul(100)
            .ok_or(AgentPayError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(AgentPayError::MathOverflow)?;

        let total = amount
            .checked_add(protocol_fee)
            .ok_or(AgentPayError::MathOverflow)?;

        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.orchestrator.to_account_info(),
                    to: ctx.accounts.escrow_account.to_account_info(),
                },
            ),
            total,
        )?;

        let escrow = &mut ctx.accounts.escrow_account;
        let clock = Clock::get()?;

        escrow.orchestrator = ctx.accounts.orchestrator.key();
        escrow.worker = ctx.accounts.worker.key();
        escrow.job_id = job_id;
        escrow.job_description = job_description;
        escrow.amount = amount;
        escrow.protocol_fee = protocol_fee;
        escrow.status = EscrowStatus::Funded;
        escrow.created_at = clock.unix_timestamp;
        escrow.deadline = clock.unix_timestamp + 86_400;
        escrow.bump = ctx.bumps.escrow_account;

        Ok(())
    }

    pub fn approve_and_release(ctx: Context<OrchestratorAction>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;

        require!(
            escrow.status == EscrowStatus::Funded,
            AgentPayError::InvalidStatus
        );

        let amount = escrow.amount;
        let protocol_fee = escrow.protocol_fee;

        escrow.status = EscrowStatus::Completed;

        let escrow_info = ctx.accounts.escrow_account.to_account_info();
        let worker_info = ctx.accounts.worker.to_account_info();
        let orchestrator_info = ctx.accounts.orchestrator.to_account_info();

        **escrow_info.try_borrow_mut_lamports()? -= amount + protocol_fee;
        **worker_info.try_borrow_mut_lamports()? += amount;
        **orchestrator_info.try_borrow_mut_lamports()? += protocol_fee;

        Ok(())
    }

    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;
        let clock = Clock::get()?;

        require!(
            clock.unix_timestamp > escrow.deadline,
            AgentPayError::DeadlineNotReached
        );
        require!(
            escrow.status == EscrowStatus::Funded,
            AgentPayError::InvalidStatus
        );

        let total = escrow.amount
            .checked_add(escrow.protocol_fee)
            .ok_or(AgentPayError::MathOverflow)?;

        escrow.status = EscrowStatus::Refunded;

        let escrow_info = ctx.accounts.escrow_account.to_account_info();
        let orchestrator_info = ctx.accounts.orchestrator.to_account_info();

        **escrow_info.try_borrow_mut_lamports()? -= total;
        **orchestrator_info.try_borrow_mut_lamports()? += total;

        Ok(())
    }

    // ============================================================
    // JOB CONTRACT
    // ============================================================

    pub fn post_job(
        ctx: Context<PostJob>,
        job_id: String,
        title: String,
        description: String,
        required_skills: Vec<String>,
        expected_output: String,
        deadline_seconds: i64,
    ) -> Result<()> {
        require!(job_id.len() <= 32, AgentPayError::JobIdTooLong);
        require!(title.len() <= 100, AgentPayError::TitleTooLong);
        require!(description.len() <= 500, AgentPayError::DescriptionTooLong);
        require!(required_skills.len() <= 10, AgentPayError::TooManySkills);
        require!(expected_output.len() <= 200, AgentPayError::DescriptionTooLong);
        require!(deadline_seconds > 0, AgentPayError::InvalidDeadline);

        let job = &mut ctx.accounts.job_account;
        let clock = Clock::get()?;

        job.job_id = job_id;
        job.orchestrator = ctx.accounts.orchestrator.key();
        job.worker = None;
        job.title = title;
        job.description = description;
        job.required_skills = required_skills;
        job.expected_output = expected_output;
        job.status = JobStatus::Open;
        job.result_cid = None;
        job.created_at = clock.unix_timestamp;
        job.deadline = clock.unix_timestamp + deadline_seconds;
        job.bump = ctx.bumps.job_account;

        Ok(())
    }

    pub fn claim_job(ctx: Context<ClaimJob>) -> Result<()> {
        let job = &mut ctx.accounts.job_account;
        let clock = Clock::get()?;

        require!(job.status == JobStatus::Open, AgentPayError::JobNotOpen);
        require!(
            clock.unix_timestamp < job.deadline,
            AgentPayError::JobExpired
        );

        job.worker = Some(ctx.accounts.worker.key());
        job.status = JobStatus::InProgress;

        Ok(())
    }

    pub fn submit_result(
        ctx: Context<WorkerAction>,
        result_cid: String,
    ) -> Result<()> {
        require!(result_cid.len() <= 100, AgentPayError::CidTooLong);

        let job = &mut ctx.accounts.job_account;
        let clock = Clock::get()?;

        require!(
            job.status == JobStatus::InProgress,
            AgentPayError::InvalidStatus
        );
        require!(
            clock.unix_timestamp <= job.deadline,
            AgentPayError::JobExpired
        );

        job.result_cid = Some(result_cid);
        job.status = JobStatus::PendingReview;

        Ok(())
    }

    pub fn approve_job(ctx: Context<OrchestratorJobAction>) -> Result<()> {
        let job = &mut ctx.accounts.job_account;

        require!(
            job.status == JobStatus::PendingReview,
            AgentPayError::InvalidStatus
        );

        job.status = JobStatus::Completed;

        Ok(())
    }

    pub fn cancel_job(ctx: Context<OrchestratorJobAction>) -> Result<()> {
        let job = &mut ctx.accounts.job_account;

        require!(
            job.status == JobStatus::Open,
            AgentPayError::InvalidStatus
        );

        job.status = JobStatus::Cancelled;

        Ok(())
    }
}

// ============================================================
// AGENT REGISTRY — ACCOUNTS & STRUCTS
// ============================================================

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
        8 + 32 + (4 + 50) + (4 + 200) + (4 + (10 * (4 + 20))) + 8 + (4 + 100) + 1 + 8 + 8 + 1;
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

// ============================================================
// ESCROW — ACCOUNTS & STRUCTS
// ============================================================

#[account]
pub struct EscrowAccount {
    pub orchestrator: Pubkey,
    pub worker: Pubkey,
    pub job_id: String,
    pub job_description: String,
    pub amount: u64,
    pub protocol_fee: u64,
    pub status: EscrowStatus,
    pub created_at: i64,
    pub deadline: i64,
    pub bump: u8,
}

impl EscrowAccount {
    pub const MAX_SIZE: usize =
        8 + 32 + 32 + (4 + 32) + (4 + 200) + 8 + 8 + 1 + 8 + 8 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    Funded,
    Completed,
    Refunded,
}

#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct CreateEscrow<'info> {
    #[account(
        init,
        payer = orchestrator,
        space = EscrowAccount::MAX_SIZE,
        seeds = [b"escrow", orchestrator.key().as_ref(), job_id.as_bytes()],
        bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub orchestrator: Signer<'info>,
    /// CHECK: worker wallet address
    pub worker: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OrchestratorAction<'info> {
    #[account(
        mut,
        has_one = orchestrator,
        seeds = [b"escrow", orchestrator.key().as_ref(), escrow_account.job_id.as_bytes()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    /// CHECK: worker wallet
    #[account(mut, address = escrow_account.worker)]
    pub worker: AccountInfo<'info>,
    #[account(mut)]
    pub orchestrator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(
        mut,
        has_one = orchestrator,
        seeds = [b"escrow", orchestrator.key().as_ref(), escrow_account.job_id.as_bytes()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
    #[account(mut)]
    pub orchestrator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ============================================================
// JOB CONTRACT — ACCOUNTS & STRUCTS
// ============================================================

#[account]
pub struct JobAccount {
    pub job_id: String,
    pub orchestrator: Pubkey,
    pub worker: Option<Pubkey>,
    pub title: String,
    pub description: String,
    pub required_skills: Vec<String>,
    pub expected_output: String,
    pub status: JobStatus,
    pub result_cid: Option<String>,
    pub created_at: i64,
    pub deadline: i64,
    pub bump: u8,
}

impl JobAccount {
    pub const MAX_SIZE: usize =
        8
        + (4 + 32)
        + 32
        + (1 + 32)
        + (4 + 100)
        + (4 + 500)
        + (4 + (10 * (4 + 20)))
        + (4 + 200)
        + 1
        + (1 + (4 + 100))
        + 8
        + 8
        + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum JobStatus {
    Open,
    InProgress,
    PendingReview,
    Completed,
    Cancelled,
}

#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct PostJob<'info> {
    #[account(
        init,
        payer = orchestrator,
        space = JobAccount::MAX_SIZE,
        seeds = [b"job", orchestrator.key().as_ref(), job_id.as_bytes()],
        bump
    )]
    pub job_account: Account<'info, JobAccount>,
    #[account(mut)]
    pub orchestrator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimJob<'info> {
    #[account(
        mut,
        seeds = [b"job", job_account.orchestrator.as_ref(), job_account.job_id.as_bytes()],
        bump = job_account.bump
    )]
    pub job_account: Account<'info, JobAccount>,
    pub worker: Signer<'info>,
}

#[derive(Accounts)]
pub struct WorkerAction<'info> {
    #[account(
        mut,
        constraint = job_account.worker == Some(worker.key()) @ AgentPayError::NotAssignedWorker,
        seeds = [b"job", job_account.orchestrator.as_ref(), job_account.job_id.as_bytes()],
        bump = job_account.bump
    )]
    pub job_account: Account<'info, JobAccount>,
    pub worker: Signer<'info>,
}

#[derive(Accounts)]
pub struct OrchestratorJobAction<'info> {
    #[account(
        mut,
        has_one = orchestrator,
        seeds = [b"job", job_account.orchestrator.as_ref(), job_account.job_id.as_bytes()],
        bump = job_account.bump
    )]
    pub job_account: Account<'info, JobAccount>,
    pub orchestrator: Signer<'info>,
}

// ============================================================
// ERROR CODES
// ============================================================

#[error_code]
pub enum AgentPayError {
    #[msg("Nama agent tidak boleh lebih dari 50 karakter")]
    NameTooLong,
    #[msg("Deskripsi tidak boleh lebih dari 200 karakter atau 500 karakter")]
    DescriptionTooLong,
    #[msg("Maksimal 10 skill")]
    TooManySkills,
    #[msg("URL tidak boleh lebih dari 100 karakter")]
    UrlTooLong,
    #[msg("Harga harus lebih dari 0")]
    PriceMustBePositive,
    #[msg("Job ID tidak boleh lebih dari 32 karakter")]
    JobIdTooLong,
    #[msg("Judul tidak boleh lebih dari 100 karakter")]
    TitleTooLong,
    #[msg("Jumlah harus lebih dari 0")]
    AmountMustBePositive,
    #[msg("Status tidak valid untuk operasi ini")]
    InvalidStatus,
    #[msg("Deadline belum tercapai")]
    DeadlineNotReached,
    #[msg("Deadline harus lebih dari 0")]
    InvalidDeadline,
    #[msg("Job sudah tidak Open")]
    JobNotOpen,
    #[msg("Job sudah expired")]
    JobExpired,
    #[msg("CID tidak boleh lebih dari 100 karakter")]
    CidTooLong,
    #[msg("Bukan worker yang di-assign")]
    NotAssignedWorker,
    #[msg("Kalkulasi overflow")]
    MathOverflow,
}
