use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("EscrwPay1111111111111111111111111111111111");

// Fee protokol AgentPay: 1% dari setiap transaksi
// Ini adalah revenue model utama protokol
const PROTOCOL_FEE_BPS: u64 = 100; // basis points (100 bps = 1%)
const BPS_DENOMINATOR: u64 = 10_000;

// Batas waktu default: 24 jam dalam detik
// Jika worker tidak mengirim hasil dalam waktu ini, orchestrator bisa refund
const DEFAULT_TIMEOUT_SECONDS: i64 = 86_400;

#[program]
pub mod agentpay_escrow {
    use super::*;

    /// Orchestrator membuat escrow dan mengunci SOL di dalamnya.
    /// Ini adalah langkah pertama dalam alur "agent hire agent".
    pub fn create_escrow(
        ctx: Context<CreateEscrow>,
        job_id: String,          // ID unik job, buat oleh orchestrator
        amount: u64,             // Jumlah SOL dalam lamports yang dikunci
        job_description: String, // Deskripsi task untuk worker
        timeout_seconds: Option<i64>, // Override timeout default jika perlu
    ) -> Result<()> {
        require!(job_id.len() <= 32, EscrowError::JobIdTooLong);
        require!(job_description.len() <= 300, EscrowError::DescriptionTooLong);
        require!(amount > 0, EscrowError::AmountMustBePositive);

        // Hitung fee protokol
        let protocol_fee = amount
            .checked_mul(PROTOCOL_FEE_BPS)
            .ok_or(EscrowError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(EscrowError::MathOverflow)?;

        let total_required = amount
            .checked_add(protocol_fee)
            .ok_or(EscrowError::MathOverflow)?;

        let clock = Clock::get()?;
        let timeout = timeout_seconds.unwrap_or(DEFAULT_TIMEOUT_SECONDS);

        // Transfer SOL dari orchestrator ke escrow PDA
        // Escrow PDA menjadi "brankas" yang hanya bisa dibuka oleh program
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.orchestrator.to_account_info(),
                    to: ctx.accounts.escrow_account.to_account_info(),
                },
            ),
            total_required,
        )?;

        let escrow = &mut ctx.accounts.escrow_account;
        escrow.orchestrator = ctx.accounts.orchestrator.key();
        escrow.worker = ctx.accounts.worker_agent.key();
        escrow.treasury = ctx.accounts.treasury.key();
        escrow.job_id = job_id.clone();
        escrow.job_description = job_description;
        escrow.amount = amount;
        escrow.protocol_fee = protocol_fee;
        escrow.status = EscrowStatus::Funded;
        escrow.created_at = clock.unix_timestamp;
        escrow.deadline = clock.unix_timestamp + timeout;
        escrow.bump = ctx.bumps.escrow_account;

        emit!(EscrowCreated {
            job_id,
            orchestrator: escrow.orchestrator,
            worker: escrow.worker,
            amount: escrow.amount,
            deadline: escrow.deadline,
        });

        Ok(())
    }

    /// Worker agent mengonfirmasi penerimaan job.
    /// Setelah ini, status berubah ke InProgress dan deadline mulai berjalan.
    pub fn accept_job(ctx: Context<WorkerAction>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;

        require!(
            escrow.status == EscrowStatus::Funded,
            EscrowError::InvalidStatusTransition
        );

        escrow.status = EscrowStatus::InProgress;
        escrow.accepted_at = Some(Clock::get()?.unix_timestamp);

        emit!(JobAccepted {
            job_id: escrow.job_id.clone(),
            worker: escrow.worker,
            accepted_at: escrow.accepted_at.unwrap(),
        });

        Ok(())
    }

    /// Worker mengirimkan hasil pekerjaan.
    /// Result hash adalah hash dari output (misal: IPFS CID atau SHA256 hasil kerja).
    /// Ini bukti on-chain bahwa pekerjaan telah diserahkan.
    pub fn submit_result(
        ctx: Context<WorkerAction>,
        result_hash: String, // IPFS CID atau hash output
    ) -> Result<()> {
        require!(result_hash.len() <= 100, EscrowError::HashTooLong);

        let escrow = &mut ctx.accounts.escrow_account;

        require!(
            escrow.status == EscrowStatus::InProgress,
            EscrowError::InvalidStatusTransition
        );

        // Pastikan masih dalam deadline
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp <= escrow.deadline,
            EscrowError::DeadlineExceeded
        );

        escrow.result_hash = Some(result_hash.clone());
        escrow.submitted_at = Some(clock.unix_timestamp);
        escrow.status = EscrowStatus::PendingApproval;

        emit!(ResultSubmitted {
            job_id: escrow.job_id.clone(),
            worker: escrow.worker,
            result_hash,
        });

        Ok(())
    }

    /// Orchestrator menyetujui hasil dan melepas pembayaran ke worker.
    /// SOL berpindah dari escrow PDA ke wallet worker.
    pub fn approve_and_release(ctx: Context<OrchestratorApprove>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;

        require!(
            escrow.status == EscrowStatus::PendingApproval,
            EscrowError::InvalidStatusTransition
        );

        let amount = escrow.amount;
        let protocol_fee = escrow.protocol_fee;
        let bump = escrow.bump;
        let job_id_bytes = escrow.job_id.as_bytes().to_vec();
        let orchestrator_key = escrow.orchestrator;

        // Tandai selesai SEBELUM transfer (reentrancy protection)
        escrow.status = EscrowStatus::Completed;
        escrow.completed_at = Some(Clock::get()?.unix_timestamp);

        // Seeds untuk PDA signing — escrow PDA yang menandatangani transfer keluar
        let seeds = &[
            b"escrow",
            orchestrator_key.as_ref(),
            job_id_bytes.as_ref(),
            &[bump],
        ];
        let signer_seeds = &[&seeds[..]];

        // Transfer amount ke worker
        let worker_transfer = system_program::Transfer {
            from: ctx.accounts.escrow_account.to_account_info(),
            to: ctx.accounts.worker_agent.to_account_info(),
        };
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                worker_transfer,
                signer_seeds,
            ),
            amount,
        )?;

        // Transfer protocol fee ke treasury AgentPay
        let fee_transfer = system_program::Transfer {
            from: ctx.accounts.escrow_account.to_account_info(),
            to: ctx.accounts.treasury.to_account_info(),
        };
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                fee_transfer,
                signer_seeds,
            ),
            protocol_fee,
        )?;

        emit!(PaymentReleased {
            job_id: escrow.job_id.clone(),
            worker: escrow.worker,
            amount,
            protocol_fee,
        });

        Ok(())
    }

    /// Orchestrator membuka dispute jika hasil tidak memuaskan.
    /// Untuk MVP: dispute freeze escrow. Resolusi manual oleh tim AgentPay.
    /// Fase berikutnya: governance-based dispute resolution.
    pub fn raise_dispute(
        ctx: Context<OrchestratorApprove>,
        reason: String,
    ) -> Result<()> {
        require!(reason.len() <= 200, EscrowError::DescriptionTooLong);

        let escrow = &mut ctx.accounts.escrow_account;

        require!(
            escrow.status == EscrowStatus::PendingApproval
                || escrow.status == EscrowStatus::InProgress,
            EscrowError::InvalidStatusTransition
        );

        escrow.status = EscrowStatus::Disputed;
        escrow.dispute_reason = Some(reason.clone());

        emit!(DisputeRaised {
            job_id: escrow.job_id.clone(),
            orchestrator: escrow.orchestrator,
            reason,
        });

        Ok(())
    }

    /// Admin AgentPay menyelesaikan dispute.
    /// Bisa memilih: bayar worker, refund orchestrator, atau split.
    /// Fase berikutnya: ini akan diganti dengan on-chain governance voting.
    pub fn resolve_dispute(
        ctx: Context<ResolveDispute>,
        resolution: DisputeResolution,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;

        require!(
            escrow.status == EscrowStatus::Disputed,
            EscrowError::InvalidStatusTransition
        );

        let amount = escrow.amount;
        let protocol_fee = escrow.protocol_fee;
        let bump = escrow.bump;
        let job_id_bytes = escrow.job_id.as_bytes().to_vec();
        let orchestrator_key = escrow.orchestrator;

        let seeds = &[
            b"escrow",
            orchestrator_key.as_ref(),
            job_id_bytes.as_ref(),
            &[bump],
        ];
        let signer_seeds = &[&seeds[..]];

        match resolution {
            DisputeResolution::PayWorker => {
                // Worker menang dispute
                escrow.status = EscrowStatus::Completed;
                system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.escrow_account.to_account_info(),
                            to: ctx.accounts.worker_agent.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    amount,
                )?;
                system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.escrow_account.to_account_info(),
                            to: ctx.accounts.treasury.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    protocol_fee,
                )?;
            }
            DisputeResolution::RefundOrchestrator => {
                // Orchestrator menang dispute, semua SOL kembali
                escrow.status = EscrowStatus::Refunded;
                let total = amount + protocol_fee;
                system_program::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.system_program.to_account_info(),
                        system_program::Transfer {
                            from: ctx.accounts.escrow_account.to_account_info(),
                            to: ctx.accounts.orchestrator.to_account_info(),
                        },
                        signer_seeds,
                    ),
                    total,
                )?;
            }
        }

        escrow.completed_at = Some(Clock::get()?.unix_timestamp);

        emit!(DisputeResolved {
            job_id: escrow.job_id.clone(),
            resolution,
        });

        Ok(())
    }

    /// Orchestrator mengambil kembali SOL jika worker tidak menyelesaikan
    /// sebelum deadline. Tidak perlu persetujuan siapapun.
    pub fn claim_timeout_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow_account;
        let clock = Clock::get()?;

        // Hanya bisa refund jika sudah melewati deadline
        require!(
            clock.unix_timestamp > escrow.deadline,
            EscrowError::DeadlineNotReached
        );

        // Hanya bisa refund jika job belum selesai
        require!(
            escrow.status == EscrowStatus::Funded
                || escrow.status == EscrowStatus::InProgress,
            EscrowError::InvalidStatusTransition
        );

        let total = escrow
            .amount
            .checked_add(escrow.protocol_fee)
            .ok_or(EscrowError::MathOverflow)?;

        let bump = escrow.bump;
        let job_id_bytes = escrow.job_id.as_bytes().to_vec();
        let orchestrator_key = escrow.orchestrator;

        escrow.status = EscrowStatus::Refunded;
        escrow.completed_at = Some(clock.unix_timestamp);

        let seeds = &[
            b"escrow",
            orchestrator_key.as_ref(),
            job_id_bytes.as_ref(),
            &[bump],
        ];
        let signer_seeds = &[&seeds[..]];

        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.escrow_account.to_account_info(),
                    to: ctx.accounts.orchestrator.to_account_info(),
                },
                signer_seeds,
            ),
            total,
        )?;

        emit!(TimeoutRefundClaimed {
            job_id: escrow.job_id.clone(),
            orchestrator: escrow.orchestrator,
            amount: total,
        });

        Ok(())
    }
}

// =============================================================================
// ACCOUNT STRUCTS
// =============================================================================

#[account]
pub struct EscrowAccount {
    pub orchestrator: Pubkey,         // Siapa yang hire
    pub worker: Pubkey,               // Siapa yang di-hire
    pub treasury: Pubkey,             // Wallet treasury AgentPay untuk fee
    pub job_id: String,               // ID unik job (max 32)
    pub job_description: String,      // Deskripsi task (max 300)
    pub amount: u64,                  // SOL yang akan dibayar ke worker
    pub protocol_fee: u64,            // Fee 1% untuk AgentPay
    pub status: EscrowStatus,         // Status saat ini
    pub result_hash: Option<String>,  // Hash output dari worker (max 100)
    pub dispute_reason: Option<String>, // Alasan dispute jika ada (max 200)
    pub created_at: i64,
    pub accepted_at: Option<i64>,
    pub submitted_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub deadline: i64,
    pub bump: u8,
}

impl EscrowAccount {
    pub const MAX_SIZE: usize =
        8            // discriminator
        + 32         // orchestrator
        + 32         // worker
        + 32         // treasury
        + 4 + 32     // job_id
        + 4 + 300    // job_description
        + 8          // amount
        + 8          // protocol_fee
        + 1          // status enum
        + 1 + (4 + 100) // result_hash Option<String>
        + 1 + (4 + 200) // dispute_reason Option<String>
        + 8          // created_at
        + 1 + 8      // accepted_at Option<i64>
        + 1 + 8      // submitted_at Option<i64>
        + 1 + 8      // completed_at Option<i64>
        + 8          // deadline
        + 1;         // bump
}

// =============================================================================
// ENUMS
// =============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    Funded,           // SOL terkunci, menunggu worker accept
    InProgress,       // Worker sedang mengerjakan
    PendingApproval,  // Worker submit result, menunggu konfirmasi orchestrator
    Completed,        // Selesai, SOL sudah release ke worker
    Disputed,         // Ada dispute, SOL di-freeze
    Refunded,         // SOL dikembalikan ke orchestrator
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum DisputeResolution {
    PayWorker,           // Worker menang, bayar worker
    RefundOrchestrator,  // Orchestrator menang, kembalikan SOL
}

// =============================================================================
// CONTEXT STRUCTS
// =============================================================================

#[derive(Accounts)]
#[instruction(job_id: String)]
pub struct CreateEscrow<'info> {
    /// Escrow PDA, di-derive dari orchestrator pubkey + job_id
    #[account(
        init,
        payer = orchestrator,
        space = EscrowAccount::MAX_SIZE,
        seeds = [b"escrow", orchestrator.key().as_ref(), job_id.as_bytes()],
        bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    /// Wallet orchestrator — menandatangani dan membiayai escrow
    #[account(mut)]
    pub orchestrator: Signer<'info>,

    /// CHECK: Wallet worker agent — hanya disimpan sebagai referensi penerima
    pub worker_agent: AccountInfo<'info>,

    /// CHECK: Treasury AgentPay untuk menerima protocol fee
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WorkerAction<'info> {
    #[account(
        mut,
        has_one = worker,
        seeds = [b"escrow", escrow_account.orchestrator.as_ref(), escrow_account.job_id.as_bytes()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    /// Worker harus menandatangani — membuktikan identitas
    #[account(address = escrow_account.worker)]
    pub worker: Signer<'info>,
}

#[derive(Accounts)]
pub struct OrchestratorApprove<'info> {
    #[account(
        mut,
        has_one = orchestrator,
        seeds = [b"escrow", escrow_account.orchestrator.as_ref(), escrow_account.job_id.as_bytes()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    /// CHECK: Worker wallet untuk menerima pembayaran
    #[account(mut, address = escrow_account.worker)]
    pub worker_agent: AccountInfo<'info>,

    /// CHECK: Treasury untuk menerima fee
    #[account(mut, address = escrow_account.treasury)]
    pub treasury: AccountInfo<'info>,

    #[account(mut)]
    pub orchestrator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow_account.orchestrator.as_ref(), escrow_account.job_id.as_bytes()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    /// CHECK: Worker wallet
    #[account(mut, address = escrow_account.worker)]
    pub worker_agent: AccountInfo<'info>,

    /// CHECK: Orchestrator wallet untuk refund
    #[account(mut, address = escrow_account.orchestrator)]
    pub orchestrator: AccountInfo<'info>,

    /// CHECK: Treasury wallet
    #[account(mut, address = escrow_account.treasury)]
    pub treasury: AccountInfo<'info>,

    /// Admin AgentPay — satu-satunya yang bisa resolve dispute untuk MVP
    /// Fase berikutnya: diganti dengan governance multisig
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(
        mut,
        has_one = orchestrator,
        seeds = [b"escrow", escrow_account.orchestrator.as_ref(), escrow_account.job_id.as_bytes()],
        bump = escrow_account.bump
    )]
    pub escrow_account: Account<'info, EscrowAccount>,

    #[account(mut)]
    pub orchestrator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

// =============================================================================
// EVENTS
// =============================================================================

#[event]
pub struct EscrowCreated {
    pub job_id: String,
    pub orchestrator: Pubkey,
    pub worker: Pubkey,
    pub amount: u64,
    pub deadline: i64,
}

#[event]
pub struct JobAccepted {
    pub job_id: String,
    pub worker: Pubkey,
    pub accepted_at: i64,
}

#[event]
pub struct ResultSubmitted {
    pub job_id: String,
    pub worker: Pubkey,
    pub result_hash: String,
}

#[event]
pub struct PaymentReleased {
    pub job_id: String,
    pub worker: Pubkey,
    pub amount: u64,
    pub protocol_fee: u64,
}

#[event]
pub struct DisputeRaised {
    pub job_id: String,
    pub orchestrator: Pubkey,
    pub reason: String,
}

#[event]
pub struct DisputeResolved {
    pub job_id: String,
    pub resolution: DisputeResolution,
}

#[event]
pub struct TimeoutRefundClaimed {
    pub job_id: String,
    pub orchestrator: Pubkey,
    pub amount: u64,
}

// =============================================================================
// ERROR CODES
// =============================================================================

#[error_code]
pub enum EscrowError {
    #[msg("Job ID tidak boleh lebih dari 32 karakter")]
    JobIdTooLong,
    #[msg("Deskripsi tidak boleh lebih dari 300 karakter")]
    DescriptionTooLong,
    #[msg("Hash tidak boleh lebih dari 100 karakter")]
    HashTooLong,
    #[msg("Jumlah SOL harus lebih dari 0")]
    AmountMustBePositive,
    #[msg("Transisi status tidak valid untuk state saat ini")]
    InvalidStatusTransition,
    #[msg("Deadline belum tercapai untuk klaim refund")]
    DeadlineNotReached,
    #[msg("Job sudah melewati deadline")]
    DeadlineExceeded,
    #[msg("Kalkulasi matematika overflow")]
    MathOverflow,
}
