import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  AgentPayConfig,
  RegisterAgentParams,
  AgentInfo,
  AgentFilter,
  PostJobParams,
  JobInfo,
  JobFilter,
  JobStatus,
  JobPriority,
  EscrowInfo,
  TxResult,
  HireResult,
  lamportsToSol,
} from "./types";

// Helper: bangun Explorer URL dari signature
const explorerUrl = (sig: string, cluster = "devnet") =>
  `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;

// Helper: konversi priority string ke format Anchor enum
const priorityToAnchor = (p: JobPriority) => ({ [p]: {} });

// Helper: konversi Anchor enum status ke string
const statusFromAnchor = (s: any): JobStatus => {
  if (s.open !== undefined) return "open";
  if (s.assigned !== undefined) return "assigned";
  if (s.inExecution !== undefined) return "inExecution";
  if (s.pendingReview !== undefined) return "pendingReview";
  if (s.completed !== undefined) return "completed";
  if (s.cancelled !== undefined) return "cancelled";
  return "expired";
};

// =============================================================================
// REGISTRY CLIENT
// =============================================================================

export class RegistryClient {
  constructor(
    private provider: anchor.AnchorProvider,
    private config: Required<AgentPayConfig>
  ) {}

  private get programId() {
    return new PublicKey(this.config.programIds.registry);
  }

  /** Derive PDA untuk agent account */
  getAgentPDA(ownerKey: PublicKey, agentName: string): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), ownerKey.toBuffer(), Buffer.from(agentName)],
      this.programId
    );
    return pda;
  }

  /** Daftarkan agent baru ke registry */
  async registerAgent(params: RegisterAgentParams): Promise<TxResult> {
    const program = await this.getProgram();
    const agentPDA = this.getAgentPDA(
      this.provider.wallet.publicKey,
      params.name
    );

    const sig = await program.methods
      .registerAgent(
        params.name,
        params.description,
        params.skills,
        new anchor.BN(params.pricePerJob),
        params.endpointUrl
      )
      .accounts({
        agentAccount: agentPDA,
        owner: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { signature: sig, explorerUrl: explorerUrl(sig) };
  }

  /** Ambil data satu agent berdasarkan alamat PDA-nya */
  async getAgent(agentAddress: PublicKey): Promise<AgentInfo> {
    const program = await this.getProgram();
    const data = await program.account.agentAccount.fetch(agentAddress);

    return {
      address: agentAddress,
      owner: data.owner,
      name: data.name,
      description: data.description,
      skills: data.skills,
      pricePerJob: data.pricePerJob.toNumber(),
      endpointUrl: data.endpointUrl,
      isActive: data.isActive,
      jobsCompleted: data.jobsCompleted.toNumber(),
      createdAt: new Date(data.createdAt.toNumber() * 1000),
      updatedAt: new Date(data.updatedAt.toNumber() * 1000),
    };
  }

  /** List semua agent dengan filter opsional */
  async listAgents(filter?: AgentFilter): Promise<AgentInfo[]> {
    const program = await this.getProgram();
    const all = await program.account.agentAccount.all();

    let agents: AgentInfo[] = all.map((a) => ({
      address: a.publicKey,
      owner: a.account.owner,
      name: a.account.name,
      description: a.account.description,
      skills: a.account.skills,
      pricePerJob: a.account.pricePerJob.toNumber(),
      endpointUrl: a.account.endpointUrl,
      isActive: a.account.isActive,
      jobsCompleted: a.account.jobsCompleted.toNumber(),
      createdAt: new Date(a.account.createdAt.toNumber() * 1000),
      updatedAt: new Date(a.account.updatedAt.toNumber() * 1000),
    }));

    if (filter?.isActive !== undefined) {
      agents = agents.filter((a) => a.isActive === filter.isActive);
    }
    if (filter?.maxPrice !== undefined) {
      agents = agents.filter((a) => a.pricePerJob <= filter.maxPrice!);
    }
    if (filter?.skills && filter.skills.length > 0) {
      agents = agents.filter((a) =>
        filter.skills!.every((s) => a.skills.includes(s))
      );
    }

    // Urutkan berdasarkan jobs_completed (proxy untuk reputation)
    return agents.sort((a, b) => b.jobsCompleted - a.jobsCompleted);
  }

  /** Update informasi agent */
  async updateAgent(
    agentName: string,
    updates: Partial<Omit<RegisterAgentParams, "name">>
  ): Promise<TxResult> {
    const program = await this.getProgram();
    const agentPDA = this.getAgentPDA(
      this.provider.wallet.publicKey,
      agentName
    );

    const sig = await program.methods
      .updateAgent(
        updates.description ?? null,
        updates.skills ?? null,
        updates.pricePerJob ? new anchor.BN(updates.pricePerJob) : null,
        updates.endpointUrl ?? null
      )
      .accounts({ agentAccount: agentPDA, owner: this.provider.wallet.publicKey })
      .rpc();

    return { signature: sig, explorerUrl: explorerUrl(sig) };
  }

  private async getProgram() {
    // Load IDL dari file — di production ini di-bundle dalam npm package
    const idl = await anchor.Program.fetchIdl(this.programId, this.provider);
    return new anchor.Program(idl!, this.programId, this.provider);
  }
}

// =============================================================================
// JOB CLIENT
// =============================================================================

export class JobClient {
  constructor(
    private provider: anchor.AnchorProvider,
    private config: Required<AgentPayConfig>
  ) {}

  private get programId() {
    return new PublicKey(this.config.programIds.job);
  }

  getJobPDA(orchestratorKey: PublicKey, jobId: string): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("job"), orchestratorKey.toBuffer(), Buffer.from(jobId)],
      this.programId
    );
    return pda;
  }

  /** Post job baru on-chain */
  async postJob(params: PostJobParams): Promise<{ signature: string; jobAddress: PublicKey }> {
    const program = await this.getProgram();
    const jobPDA = this.getJobPDA(this.provider.wallet.publicKey, params.jobId);

    const sig = await program.methods
      .postJob(
        params.jobId,
        params.title,
        params.description,
        params.requiredSkills,
        JSON.stringify(params.inputSchema),
        params.expectedOutput,
        priorityToAnchor(params.priority ?? "normal"),
        new anchor.BN(params.deadlineSeconds ?? 86_400),
        params.maxRetries ?? 1,
        params.tags ?? [],
        params.contextCid ?? null
      )
      .accounts({
        jobAccount: jobPDA,
        orchestrator: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { signature: sig, jobAddress: jobPDA };
  }

  /** Claim job oleh worker */
  async claimJob(
    jobAddress: PublicKey,
    escrowAddress: PublicKey
  ): Promise<TxResult> {
    const program = await this.getProgram();
    const job = await program.account.jobAccount.fetch(jobAddress);

    const sig = await program.methods
      .claimJob(escrowAddress)
      .accounts({
        jobAccount: jobAddress,
        worker: this.provider.wallet.publicKey,
        // workerRegistry: akan di-derive dari Agent Registry
      })
      .rpc();

    return { signature: sig, explorerUrl: explorerUrl(sig) };
  }

  /** Worker mulai eksekusi */
  async startExecution(jobAddress: PublicKey): Promise<TxResult> {
    const program = await this.getProgram();

    const sig = await program.methods
      .startExecution()
      .accounts({
        jobAccount: jobAddress,
        worker: this.provider.wallet.publicKey,
      })
      .rpc();

    return { signature: sig, explorerUrl: explorerUrl(sig) };
  }

  /** Worker submit hasil */
  async submitResult(
    jobAddress: PublicKey,
    resultCid: string,
    summary: string
  ): Promise<TxResult> {
    const program = await this.getProgram();

    const sig = await program.methods
      .submitResult(resultCid, summary)
      .accounts({
        jobAccount: jobAddress,
        worker: this.provider.wallet.publicKey,
      })
      .rpc();

    return { signature: sig, explorerUrl: explorerUrl(sig) };
  }

  /** Orchestrator verifikasi dan complete job */
  async verifyAndComplete(
    jobAddress: PublicKey,
    feedback?: string
  ): Promise<TxResult> {
    const program = await this.getProgram();

    const sig = await program.methods
      .verifyAndComplete(feedback ?? null)
      .accounts({
        jobAccount: jobAddress,
        orchestrator: this.provider.wallet.publicKey,
      })
      .rpc();

    return { signature: sig, explorerUrl: explorerUrl(sig) };
  }

  /** List semua job dengan filter */
  async listJobs(filter?: JobFilter): Promise<JobInfo[]> {
    const program = await this.getProgram();
    const all = await program.account.jobAccount.all();

    let jobs: JobInfo[] = all.map((j) => ({
      address: j.publicKey,
      jobId: j.account.jobId,
      orchestrator: j.account.orchestrator,
      worker: j.account.worker ?? null,
      escrowAddress: j.account.escrowAddress ?? null,
      title: j.account.title,
      description: j.account.description,
      requiredSkills: j.account.requiredSkills,
      inputSchema: j.account.inputSchema,
      expectedOutput: j.account.expectedOutput,
      contextCid: j.account.contextCid ?? null,
      priority: Object.keys(j.account.priority)[0] as JobPriority,
      status: statusFromAnchor(j.account.status),
      resultCid: j.account.resultCid ?? null,
      resultVerified: j.account.resultVerified,
      retryCount: j.account.retryCount,
      maxRetries: j.account.maxRetries,
      tags: j.account.tags,
      createdAt: new Date(j.account.createdAt.toNumber() * 1000),
      deadline: new Date(j.account.deadline.toNumber() * 1000),
      executionLog: j.account.executionLog.map((e: any) => ({
        eventType: Object.keys(e.eventType)[0],
        actor: e.actor,
        timestamp: new Date(e.timestamp.toNumber() * 1000),
        note: e.note ?? null,
      })),
    }));

    if (filter?.status) jobs = jobs.filter((j) => j.status === filter.status);
    if (filter?.skills) jobs = jobs.filter((j) =>
      filter.skills!.every((s) => j.requiredSkills.includes(s))
    );
    if (filter?.orchestrator) jobs = jobs.filter((j) =>
      j.orchestrator.equals(filter.orchestrator!)
    );
    if (filter?.worker) jobs = jobs.filter((j) =>
      j.worker?.equals(filter.worker!) ?? false
    );

    return jobs;
  }

  private async getProgram() {
    const idl = await anchor.Program.fetchIdl(this.programId, this.provider);
    return new anchor.Program(idl!, this.programId, this.provider);
  }
}

// =============================================================================
// ESCROW CLIENT
// =============================================================================

export class EscrowClient {
  constructor(
    private provider: anchor.AnchorProvider,
    private config: Required<AgentPayConfig>
  ) {}

  private get programId() {
    return new PublicKey(this.config.programIds.escrow);
  }

  getEscrowPDA(orchestratorKey: PublicKey, jobId: string): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), orchestratorKey.toBuffer(), Buffer.from(jobId)],
      this.programId
    );
    return pda;
  }

  /** Buat escrow dan kunci pembayaran */
  async createEscrow(params: {
    jobId: string;
    workerAddress: PublicKey;
    amount: number;
    jobDescription: string;
    timeoutSeconds?: number;
  }): Promise<{ signature: string; explorerUrl: string; escrowAddress: PublicKey }> {
    const program = await this.getProgram();
    const escrowPDA = this.getEscrowPDA(
      this.provider.wallet.publicKey,
      params.jobId
    );

    const sig = await program.methods
      .createEscrow(
        params.jobId,
        new anchor.BN(params.amount),
        params.jobDescription,
        params.timeoutSeconds ? new anchor.BN(params.timeoutSeconds) : null
      )
      .accounts({
        escrowAccount: escrowPDA,
        orchestrator: this.provider.wallet.publicKey,
        workerAgent: params.workerAddress,
        treasury: new PublicKey(this.config.treasuryAddress),
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return {
      signature: sig,
      explorerUrl: explorerUrl(sig),
      escrowAddress: escrowPDA,
    };
  }

  /** Worker accept job di escrow */
  async acceptJob(escrowAddress: PublicKey): Promise<TxResult> {
    const program = await this.getProgram();

    const sig = await program.methods
      .acceptJob()
      .accounts({
        escrowAccount: escrowAddress,
        worker: this.provider.wallet.publicKey,
      })
      .rpc();

    return { signature: sig, explorerUrl: explorerUrl(sig) };
  }

  /** Worker submit result hash ke escrow */
  async submitResult(
    escrowAddress: PublicKey,
    resultHash: string
  ): Promise<TxResult> {
    const program = await this.getProgram();

    const sig = await program.methods
      .submitResult(resultHash)
      .accounts({
        escrowAccount: escrowAddress,
        worker: this.provider.wallet.publicKey,
      })
      .rpc();

    return { signature: sig, explorerUrl: explorerUrl(sig) };
  }

  /** Orchestrator approve dan release payment */
  async approveAndRelease(escrowAddress: PublicKey): Promise<TxResult> {
    const program = await this.getProgram();
    const escrow = await program.account.escrowAccount.fetch(escrowAddress);

    const sig = await program.methods
      .approveAndRelease()
      .accounts({
        escrowAccount: escrowAddress,
        workerAgent: escrow.worker,
        treasury: new PublicKey(this.config.treasuryAddress),
        orchestrator: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { signature: sig, explorerUrl: explorerUrl(sig) };
  }

  /** Klaim refund setelah timeout */
  async claimTimeoutRefund(escrowAddress: PublicKey): Promise<TxResult> {
    const program = await this.getProgram();

    const sig = await program.methods
      .claimTimeoutRefund()
      .accounts({
        escrowAccount: escrowAddress,
        orchestrator: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { signature: sig, explorerUrl: explorerUrl(sig) };
  }

  private async getProgram() {
    const idl = await anchor.Program.fetchIdl(this.programId, this.provider);
    return new anchor.Program(idl!, this.programId, this.provider);
  }
}
