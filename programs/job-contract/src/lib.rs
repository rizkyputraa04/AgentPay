use anchor_lang::prelude::*;

declare_id!("JobPay111111111111111111111111111111111111");

#[program]
pub mod agentpay_job {
    use super::*;

    /// Orchestrator memposting job baru ke protokol.
    /// Job ini bisa di-claim oleh worker agent manapun yang memenuhi syarat.
    pub fn post_job(
        ctx: Context<PostJob>,
        job_id: String,
        title: String,
        description: String,
        required_skills: Vec<String>,
        input_schema: String,
        expected_output: String,
        priority: JobPriority,
        deadline_seconds: i64,
        max_retries: u8,
        tags: Vec<String>,
        context_cid: Option<String>, // IPFS CID untuk input data besar
    ) -> Result<()> {
        // Validasi semua input
        require!(job_id.len() <= 32, JobError::JobIdTooLong);
        require!(title.len() <= 100, JobError::TitleTooLong);
        require!(description.len() <= 500, JobError::DescriptionTooLong);
        require!(required_skills.len() <= 10, JobError::TooManySkills);
        require!(input_schema.len() <= 300, JobError::SchemaTooLong);
        require!(expected_output.len() <= 300, JobError::SchemaTooLong);
        require!(tags.len() <= 5, JobError::TooManyTags);
        require!(max_retries <= 3, JobError::TooManyRetries);
        require!(deadline_seconds > 0, JobError::InvalidDeadline);

        if let Some(ref cid) = context_cid {
            require!(cid.len() <= 100, JobError::CidTooLong);
        }

        let clock = Clock::get()?;
        let job = &mut ctx.accounts.job_account;

        job.job_id = job_id.clone();
        job.orchestrator = ctx.accounts.orchestrator.key();
        job.worker = None; // belum di-assign, menunggu worker claim
        job.escrow_address = None; // akan diisi saat escrow dibuat
        job.title = title;
        job.description = description;
        job.required_skills = required_skills;
        job.input_schema = input_schema;
        job.expected_output = expected_output;
        job.context_cid = context_cid;
        job.priority = priority;
        job.status = JobStatus::Open;
        job.result_cid = None;
        job.result_verified = false;
        job.retry_count = 0;
        job.max_retries = max_retries;
        job.tags = tags;
        job.created_at = clock.unix_timestamp;
        job.deadline = clock.unix_timestamp + deadline_seconds;
        job.execution_log = vec![];
        job.version = 1;
        job.bump = ctx.bumps.job_account;

        emit!(JobPosted {
            job_id,
            orchestrator: job.orchestrator,
            priority: job.priority.clone(),
            deadline: job.deadline,
        });

        Ok(())
    }

    /// Worker agent mengklaim job yang masih Open.
    /// Setelah ini, job di-lock untuk worker tersebut dan tidak bisa di-claim lain.
    /// Escrow harus dibuat sebelum atau bersamaan dengan claim ini.
    pub fn claim_job(
        ctx: Context<ClaimJob>,
        escrow_address: Pubkey, // alamat escrow yang sudah dibuat
    ) -> Result<()> {
        let clock = Clock::get()?;
        let job = &mut ctx.accounts.job_account;

        require!(job.status == JobStatus::Open, JobError::JobNotOpen);
        require!(
            clock.unix_timestamp < job.deadline,
            JobError::JobExpired
        );

        // Verifikasi worker punya skill yang dibutuhkan
        // Dibandingkan dengan skills yang terdaftar di Agent Registry
        let worker_skills = &ctx.accounts.worker_registry.skills;
        for required in &job.required_skills {
            require!(
                worker_skills.contains(required),
                JobError::InsufficientSkills
            );
        }

        job.worker = Some(ctx.accounts.worker.key());
        job.escrow_address = Some(escrow_address);
        job.status = JobStatus::Assigned;

        job.execution_log.push(ExecutionEvent {
            event_type: EventType::Claimed,
            actor: ctx.accounts.worker.key(),
            timestamp: clock.unix_timestamp,
            note: None,
        });

        emit!(JobClaimed {
            job_id: job.job_id.clone(),
            worker: ctx.accounts.worker.key(),
            escrow_address,
        });

        Ok(())
    }

    /// Worker memulai eksekusi job.
    /// Berguna untuk tracking — memberi tahu orchestrator bahwa pekerjaan sedang berlangsung.
    pub fn start_execution(ctx: Context<WorkerJobAction>) -> Result<()> {
        let clock = Clock::get()?;
        let job = &mut ctx.accounts.job_account;

        require!(job.status == JobStatus::Assigned, JobError::InvalidTransition);

        job.status = JobStatus::InExecution;
        job.execution_log.push(ExecutionEvent {
            event_type: EventType::ExecutionStarted,
            actor: ctx.accounts.worker.key(),
            timestamp: clock.unix_timestamp,
            note: None,
        });

        Ok(())
    }

    /// Worker mengirimkan hasil pekerjaan via IPFS CID.
    /// result_cid adalah pointer ke output yang disimpan di IPFS.
    /// summary adalah ringkasan singkat hasil untuk validasi cepat on-chain.
    pub fn submit_result(
        ctx: Context<WorkerJobAction>,
        result_cid: String,   // IPFS CID berisi output lengkap
        summary: String,      // Ringkasan singkat, max 200 karakter
    ) -> Result<()> {
        require!(result_cid.len() <= 100, JobError::CidTooLong);
        require!(summary.len() <= 200, JobError::SummaryTooLong);

        let clock = Clock::get()?;
        let job = &mut ctx.accounts.job_account;

        require!(
            job.status == JobStatus::InExecution,
            JobError::InvalidTransition
        );
        require!(
            clock.unix_timestamp <= job.deadline,
            JobError::JobExpired
        );

        job.result_cid = Some(result_cid.clone());
        job.status = JobStatus::PendingReview;

        job.execution_log.push(ExecutionEvent {
            event_type: EventType::ResultSubmitted,
            actor: ctx.accounts.worker.key(),
            timestamp: clock.unix_timestamp,
            note: Some(summary),
        });

        emit!(JobResultSubmitted {
            job_id: job.job_id.clone(),
            worker: ctx.accounts.worker.key(),
            result_cid,
        });

        Ok(())
    }

    /// Orchestrator memverifikasi dan menerima hasil pekerjaan.
    /// Setelah ini, status menjadi Completed dan escrow bisa di-release.
    pub fn verify_and_complete(
        ctx: Context<OrchestratorJobAction>,
        feedback: Option<String>,
    ) -> Result<()> {
        if let Some(ref f) = feedback {
            require!(f.len() <= 200, JobError::SummaryTooLong);
        }

        let clock = Clock::get()?;
        let job = &mut ctx.accounts.job_account;

        require!(
            job.status == JobStatus::PendingReview,
            JobError::InvalidTransition
        );

        job.status = JobStatus::Completed;
        job.result_verified = true;

        job.execution_log.push(ExecutionEvent {
            event_type: EventType::Verified,
            actor: ctx.accounts.orchestrator.key(),
            timestamp: clock.unix_timestamp,
            note: feedback,
        });

        emit!(JobCompleted {
            job_id: job.job_id.clone(),
            orchestrator: job.orchestrator,
            worker: job.worker.unwrap(),
        });

        Ok(())
    }

    /// Orchestrator menolak hasil dan meminta retry.
    /// Worker akan mengerjakan ulang sampai max_retries tercapai.
    pub fn request_retry(
        ctx: Context<OrchestratorJobAction>,
        rejection_reason: String,
    ) -> Result<()> {
        require!(rejection_reason.len() <= 200, JobError::SummaryTooLong);

        let clock = Clock::get()?;
        let job = &mut ctx.accounts.job_account;

        require!(
            job.status == JobStatus::PendingReview,
            JobError::InvalidTransition
        );
        require!(
            job.retry_count < job.max_retries,
            JobError::MaxRetriesExceeded
        );

        job.retry_count += 1;
        job.result_cid = None; // reset result, tunggu submission baru
        job.status = JobStatus::InExecution; // kembali ke in-execution

        job.execution_log.push(ExecutionEvent {
            event_type: EventType::RetryRequested,
            actor: ctx.accounts.orchestrator.key(),
            timestamp: clock.unix_timestamp,
            note: Some(rejection_reason.clone()),
        });

        emit!(JobRetryRequested {
            job_id: job.job_id.clone(),
            retry_count: job.retry_count,
            reason: rejection_reason,
        });

        Ok(())
    }

    /// Menutup job yang sudah expired atau dibatalkan.
    /// Hanya orchestrator yang bisa memanggil ini.
    pub fn cancel_job(
        ctx: Context<OrchestratorJobAction>,
        reason: String,
    ) -> Result<()> {
        require!(reason.len() <= 200, JobError::SummaryTooLong);

        let clock = Clock::get()?;
        let job = &mut ctx.accounts.job_account;

        // Hanya bisa cancel jika belum di-execute atau sudah expired
        require!(
            job.status == JobStatus::Open
                || job.status == JobStatus::Assigned
                || clock.unix_timestamp > job.deadline,
            JobError::CannotCancelActiveJob
        );

        job.status = JobStatus::Cancelled;
        job.execution_log.push(ExecutionEvent {
            event_type: EventType::Cancelled,
            actor: ctx.accounts.orchestrator.key(),
            timestamp: clock.unix_timestamp,
            note: Some(reason),
        });

        Ok(())
    }
}

// =============================================================================
// ACCOUNT STRUCTS
// =============================================================================

#[account]
pub struct JobAccount {
    // --- Identitas ---
    pub job_id: String,                  // max 32
    pub orchestrator: Pubkey,
    pub worker: Option<Pubkey>,
    pub escrow_address: Option<Pubkey>,

    // --- Spesifikasi task ---
    pub title: String,                   // max 100
    pub description: String,             // max 500
    pub required_skills: Vec<String>,    // max 10 skill, masing-masing max 20 char
    pub input_schema: String,            // JSON schema input, max 300
    pub expected_output: String,         // Deskripsi output yang diharapkan, max 300
    pub context_cid: Option<String>,     // IPFS CID untuk context tambahan, max 100

    // --- Matching & prioritas ---
    pub priority: JobPriority,
    pub tags: Vec<String>,               // max 5 tag, masing-masing max 20 char

    // --- Status & hasil ---
    pub status: JobStatus,
    pub result_cid: Option<String>,      // IPFS CID output, max 100
    pub result_verified: bool,

    // --- Retry logic ---
    pub retry_count: u8,
    pub max_retries: u8,

    // --- Timeline ---
    pub created_at: i64,
    pub deadline: i64,

    // --- Execution log ---
    pub execution_log: Vec<ExecutionEvent>, // max 10 events

    // --- Metadata ---
    pub version: u8,
    pub bump: u8,
}

impl JobAccount {
    pub const MAX_SIZE: usize =
        8                           // discriminator
        + 4 + 32                    // job_id
        + 32                        // orchestrator
        + 1 + 32                    // worker Option<Pubkey>
        + 1 + 32                    // escrow_address Option<Pubkey>
        + 4 + 100                   // title
        + 4 + 500                   // description
        + 4 + (10 * (4 + 20))       // required_skills Vec
        + 4 + 300                   // input_schema
        + 4 + 300                   // expected_output
        + 1 + (4 + 100)             // context_cid Option<String>
        + 1                         // priority enum
        + 4 + (5 * (4 + 20))        // tags Vec
        + 1                         // status enum
        + 1 + (4 + 100)             // result_cid Option<String>
        + 1                         // result_verified
        + 1                         // retry_count
        + 1                         // max_retries
        + 8                         // created_at
        + 8                         // deadline
        + 4 + (10 * ExecutionEvent::SIZE) // execution_log Vec max 10
        + 1                         // version
        + 1;                        // bump
}

/// Satu entry dalam execution log job.
/// Mencatat setiap kejadian penting selama lifecycle job.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ExecutionEvent {
    pub event_type: EventType,
    pub actor: Pubkey,
    pub timestamp: i64,
    pub note: Option<String>, // max 200 char
}

impl ExecutionEvent {
    pub const SIZE: usize =
        1           // event_type enum
        + 32        // actor Pubkey
        + 8         // timestamp
        + 1 + (4 + 200); // note Option<String>
}

// =============================================================================
// ENUMS
// =============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum JobStatus {
    Open,           // Menunggu worker claim
    Assigned,       // Worker sudah claim, belum mulai
    InExecution,    // Worker sedang mengerjakan
    PendingReview,  // Result submitted, menunggu verifikasi orchestrator
    Completed,      // Selesai dan verified
    Cancelled,      // Dibatalkan
    Expired,        // Deadline terlewat tanpa completion
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum JobPriority {
    Low,
    Normal,
    High,
    Urgent,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EventType {
    Claimed,
    ExecutionStarted,
    ResultSubmitted,
    RetryRequested,
    Verified,
    Cancelled,
}

// =============================================================================
// CONTEXT STRUCTS
// =============================================================================

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

    /// Registry account milik worker — untuk verifikasi skills
    /// CHECK: PDA dari Agent Registry program, diverifikasi manual via seeds
    pub worker_registry: Account<'info, WorkerRegistryRef>,

    #[account(mut)]
    pub worker: Signer<'info>,
}

#[derive(Accounts)]
pub struct WorkerJobAction<'info> {
    #[account(
        mut,
        constraint = job_account.worker == Some(worker.key()) @ JobError::NotAssignedWorker,
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

/// Stub account untuk referensi ke Agent Registry.
/// Dalam implementasi penuh, ini akan di-CPI ke Agent Registry program.
#[account]
pub struct WorkerRegistryRef {
    pub owner: Pubkey,
    pub skills: Vec<String>,
    pub is_active: bool,
}

// =============================================================================
// EVENTS
// =============================================================================

#[event]
pub struct JobPosted {
    pub job_id: String,
    pub orchestrator: Pubkey,
    pub priority: JobPriority,
    pub deadline: i64,
}

#[event]
pub struct JobClaimed {
    pub job_id: String,
    pub worker: Pubkey,
    pub escrow_address: Pubkey,
}

#[event]
pub struct JobResultSubmitted {
    pub job_id: String,
    pub worker: Pubkey,
    pub result_cid: String,
}

#[event]
pub struct JobCompleted {
    pub job_id: String,
    pub orchestrator: Pubkey,
    pub worker: Pubkey,
}

#[event]
pub struct JobRetryRequested {
    pub job_id: String,
    pub retry_count: u8,
    pub reason: String,
}

// =============================================================================
// ERROR CODES
// =============================================================================

#[error_code]
pub enum JobError {
    #[msg("Job ID tidak boleh lebih dari 32 karakter")]
    JobIdTooLong,
    #[msg("Judul tidak boleh lebih dari 100 karakter")]
    TitleTooLong,
    #[msg("Deskripsi tidak boleh lebih dari 500 karakter")]
    DescriptionTooLong,
    #[msg("Schema tidak boleh lebih dari 300 karakter")]
    SchemaTooLong,
    #[msg("Ringkasan tidak boleh lebih dari 200 karakter")]
    SummaryTooLong,
    #[msg("CID tidak boleh lebih dari 100 karakter")]
    CidTooLong,
    #[msg("Maksimal 10 skill yang dibutuhkan")]
    TooManySkills,
    #[msg("Maksimal 5 tag per job")]
    TooManyTags,
    #[msg("Maksimal 3 kali retry")]
    TooManyRetries,
    #[msg("Deadline harus lebih dari 0 detik")]
    InvalidDeadline,
    #[msg("Job sudah tidak Open, tidak bisa di-claim")]
    JobNotOpen,
    #[msg("Job sudah expired")]
    JobExpired,
    #[msg("Worker tidak memiliki skill yang dibutuhkan")]
    InsufficientSkills,
    #[msg("Transisi status tidak valid")]
    InvalidTransition,
    #[msg("Bukan worker yang di-assign untuk job ini")]
    NotAssignedWorker,
    #[msg("Sudah mencapai batas maksimal retry")]
    MaxRetriesExceeded,
    #[msg("Job aktif tidak bisa dibatalkan")]
    CannotCancelActiveJob,
}
