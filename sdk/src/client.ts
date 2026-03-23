import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  AgentPayConfig,
  DEFAULT_CONFIG,
  RegisterAgentParams,
  AgentInfo,
  HireAgentParams,
  HireResult,
  JobInfo,
  JobFilter,
  AgentFilter,
  TxResult,
  PostJobParams,
  generateJobId,
  solToLamports,
} from "./types";
import { RegistryClient } from "./registry-client";
import { JobClient } from "./job-client";
import { EscrowClient } from "./escrow-client";

/**
 * AgentPayClient — entry point utama SDK AgentPay.
 *
 * Contoh penggunaan minimal:
 * ```typescript
 * const client = new AgentPayClient(wallet);
 *
 * // Hire agent dalam satu baris
 * const result = await client.hireAgent({
 *   agentAddress: new PublicKey("..."),
 *   job: {
 *     jobId: generateJobId(),
 *     title: "Analisis sentimen tweet",
 *     description: "...",
 *     requiredSkills: ["research", "analysis"],
 *     inputSchema: { tweets: "string[]" },
 *     expectedOutput: "Laporan sentimen dalam format JSON",
 *   },
 *   paymentAmount: solToLamports(0.05),
 * });
 *
 * console.log("Job dibuat:", result.jobId);
 * console.log("Escrow:", result.escrowAddress.toBase58());
 * ```
 */
export class AgentPayClient {
  private connection: Connection;
  private wallet: anchor.Wallet;
  private config: Required<AgentPayConfig>;
  private provider: anchor.AnchorProvider;

  /** Sub-client untuk operasi Agent Registry */
  public readonly registry: RegistryClient;
  /** Sub-client untuk operasi Job */
  public readonly jobs: JobClient;
  /** Sub-client untuk operasi Escrow */
  public readonly escrow: EscrowClient;

  constructor(wallet: anchor.Wallet, config: AgentPayConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.connection = new Connection(
      this.config.rpcEndpoint,
      this.config.commitment
    );
    this.wallet = wallet;
    this.provider = new anchor.AnchorProvider(this.connection, this.wallet, {
      commitment: this.config.commitment,
    });

    // Inisialisasi sub-clients
    this.registry = new RegistryClient(this.provider, this.config);
    this.jobs = new JobClient(this.provider, this.config);
    this.escrow = new EscrowClient(this.provider, this.config);
  }

  // ===========================================================================
  // HIGH-LEVEL API — inilah yang dipakai 90% developer
  // ===========================================================================

  /**
   * Hire sebuah agent untuk mengerjakan job.
   * Ini adalah metode utama AgentPay — menggabungkan post job + create escrow
   * dalam satu transaksi atomik.
   *
   * @param params - Parameter hire agent
   * @returns HireResult berisi jobAddress, escrowAddress, dan tx signature
   */
  async hireAgent(params: HireAgentParams): Promise<HireResult> {
    const { agentAddress, job, paymentAmount } = params;

    // 1. Verifikasi agent aktif dan punya skill yang dibutuhkan
    const agent = await this.registry.getAgent(agentAddress);
    if (!agent.isActive) {
      throw new Error(`Agent ${agent.name} sedang tidak aktif`);
    }

    const missingSkills = job.requiredSkills.filter(
      (s) => !agent.skills.includes(s)
    );
    if (missingSkills.length > 0) {
      throw new Error(
        `Agent tidak punya skill yang dibutuhkan: ${missingSkills.join(", ")}`
      );
    }

    // 2. Siapkan job ID jika belum ada
    const jobId = job.jobId || generateJobId();
    const jobWithId = { ...job, jobId };

    // 3. Post job on-chain
    const jobResult = await this.jobs.postJob(jobWithId);

    // 4. Buat escrow dan kunci pembayaran
    const escrowResult = await this.escrow.createEscrow({
      jobId,
      workerAddress: agentAddress,
      amount: paymentAmount,
      jobDescription: job.description,
    });

    return {
      signature: escrowResult.signature,
      explorerUrl: escrowResult.explorerUrl,
      jobAddress: jobResult.jobAddress,
      escrowAddress: escrowResult.escrowAddress,
      jobId,
    };
  }

  /**
   * Cari agent yang cocok berdasarkan skill dan harga.
   * Berguna untuk orchestrator yang belum tahu ingin hire agent mana.
   *
   * @param skills - Skill yang dibutuhkan
   * @param maxBudget - Budget maksimal dalam lamports (opsional)
   * @returns List agent yang cocok, diurutkan dari rating tertinggi
   */
  async findAgents(
    skills: string[],
    maxBudget?: number
  ): Promise<AgentInfo[]> {
    const filter: AgentFilter = {
      skills,
      isActive: true,
      ...(maxBudget && { maxPrice: maxBudget }),
    };
    return this.registry.listAgents(filter);
  }

  /**
   * Ambil semua job yang masih Open dan cocok dengan skill worker.
   * Digunakan oleh worker agent untuk mencari pekerjaan.
   *
   * @param workerSkills - Skill yang dimiliki worker
   * @returns List job yang bisa dikerjakan worker ini
   */
  async getAvailableJobs(workerSkills: string[]): Promise<JobInfo[]> {
    const openJobs = await this.jobs.listJobs({ status: "open" });

    // Filter job yang semua required_skills-nya dipenuhi worker
    return openJobs.filter((job) =>
      job.requiredSkills.every((s) => workerSkills.includes(s))
    );
  }

  /**
   * Worker agent mengklaim dan mulai mengerjakan sebuah job.
   * Menggabungkan claim_job + start_execution dalam satu flow.
   *
   * @param jobAddress - Alamat job account on-chain
   * @param escrowAddress - Alamat escrow yang terkait dengan job ini
   */
  async acceptJob(
    jobAddress: PublicKey,
    escrowAddress: PublicKey
  ): Promise<TxResult> {
    // Claim job di Job Contract
    await this.jobs.claimJob(jobAddress, escrowAddress);
    // Accept di Escrow Contract
    const result = await this.escrow.acceptJob(escrowAddress);
    // Start execution
    await this.jobs.startExecution(jobAddress);
    return result;
  }

  /**
   * Worker mengirimkan hasil pekerjaan.
   * result bisa berupa teks langsung atau IPFS CID untuk output besar.
   *
   * @param jobAddress - Alamat job account
   * @param escrowAddress - Alamat escrow terkait
   * @param result - Output pekerjaan (teks langsung atau IPFS CID)
   * @param summary - Ringkasan singkat untuk validasi cepat
   */
  async submitResult(
    jobAddress: PublicKey,
    escrowAddress: PublicKey,
    result: string,
    summary: string
  ): Promise<TxResult> {
    // Submit ke Job Contract (dengan IPFS CID atau hash)
    await this.jobs.submitResult(jobAddress, result, summary);
    // Submit result hash ke Escrow Contract
    return this.escrow.submitResult(escrowAddress, result);
  }

  /**
   * Orchestrator menyetujui hasil dan melepas pembayaran ke worker.
   * Ini adalah langkah final happy path.
   *
   * @param jobAddress - Alamat job account
   * @param escrowAddress - Alamat escrow terkait
   * @param feedback - Feedback opsional untuk worker
   */
  async approveAndPay(
    jobAddress: PublicKey,
    escrowAddress: PublicKey,
    feedback?: string
  ): Promise<TxResult> {
    // Verifikasi dan complete di Job Contract
    await this.jobs.verifyAndComplete(jobAddress, feedback);
    // Release pembayaran dari Escrow
    return this.escrow.approveAndRelease(escrowAddress);
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /** Dapatkan balance SOL wallet yang aktif */
  async getBalance(): Promise<number> {
    return this.connection.getBalance(this.wallet.publicKey);
  }

  /** Dapatkan public key wallet yang sedang digunakan */
  get publicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  /** Ganti ke cluster berbeda (devnet / mainnet-beta) */
  switchCluster(rpcEndpoint: string): void {
    this.connection = new Connection(rpcEndpoint, this.config.commitment);
    this.provider = new anchor.AnchorProvider(this.connection, this.wallet, {
      commitment: this.config.commitment,
    });
  }
}
