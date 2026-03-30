import {
  Connection,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { AnchorProvider, Program, BN, Idl } from '@coral-xyz/anchor';
import { AgentPayWallet } from './wallet';
import { AgentInfo, JobInfo, HireResult, AgentPayConfig } from './types';
import * as path from 'path';
import * as fs from 'fs';

const PROGRAM_ID = new PublicKey('Fpp4D9vgStYwnwoukyFG38n3ZF18pS6kfBbdUdKAxw9h');
const DEFAULT_RPC = 'https://api.devnet.solana.com';

export class AgentPayClient {
  private connection: Connection;
  private wallet: AgentPayWallet;
  private provider: AnchorProvider;
  private program: Program;

  constructor(wallet: AgentPayWallet, config: AgentPayConfig = {}) {
    this.connection = new Connection(config.rpcUrl || DEFAULT_RPC, config.commitment || 'confirmed');
    this.wallet = wallet;
    this.provider = new AnchorProvider(this.connection, wallet as any, {
      commitment: config.commitment || 'confirmed',
    });

    const idlPath = path.join(__dirname, '..', 'idl', 'agentpay_idl_v1.json');
    const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8')) as Idl;
    this.program = new Program(idl, PROGRAM_ID, this.provider);
  }

  // ================================================================
  // AGENT REGISTRY
  // ================================================================

  async registerAgent(
    name: string,
    description: string,
    skills: string[],
    priceSOL: number,
    endpointUrl: string
  ): Promise<string> {
    const priceLamports = Math.floor(priceSOL * LAMPORTS_PER_SOL);
    const agentPDA = this.getAgentPDA(this.wallet.publicKey, name);

    const tx = await (this.program.methods as any)
      .registerAgent(name, description, skills, new BN(priceLamports), endpointUrl)
      .accounts({
        agentAccount: agentPDA,
        owner: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`✓ Agent "${name}" registered`);
    console.log(`  PDA: ${agentPDA.toBase58()}`);
    console.log(`  TX:  ${tx}`);
    return tx;
  }

  async findAgents(skills?: string[]): Promise<AgentInfo[]> {
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [{ dataSize: 672 }],
    });

    const agents: AgentInfo[] = [];
    for (const acc of accounts) {
      try {
        const agent = this.parseAgentAccount(acc.pubkey, acc.account.data);
        if (!agent.isActive) continue;
        if (skills && skills.length > 0) {
          const hasSkill = skills.some(s =>
            agent.skills.some(as => as.toLowerCase().includes(s.toLowerCase()))
          );
          if (!hasSkill) continue;
        }
        agents.push(agent);
      } catch {}
    }
    return agents;
  }

  async getAgent(address: string): Promise<AgentInfo | null> {
    try {
      const pubkey = new PublicKey(address);
      const acc = await this.connection.getAccountInfo(pubkey);
      if (!acc) return null;
      return this.parseAgentAccount(pubkey, acc.data);
    } catch {
      return null;
    }
  }

  // ================================================================
  // JOB CONTRACT
  // ================================================================

  async postJob(
    title: string,
    description: string,
    requiredSkills: string[],
    expectedOutput: string,
    deadlineHours: number = 24
  ): Promise<{ jobId: string; tx: string; jobAddress: string }> {
    const jobId = 'job-' + Date.now();
    const jobPDA = this.getJobPDA(this.wallet.publicKey, jobId);

    const tx = await (this.program.methods as any)
      .postJob(
        jobId,
        title,
        description,
        requiredSkills,
        expectedOutput,
        new BN(deadlineHours * 3600)
      )
      .accounts({
        jobAccount: jobPDA,
        orchestrator: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`✓ Job "${title}" posted`);
    console.log(`  Job ID: ${jobId}`);
    console.log(`  PDA: ${jobPDA.toBase58()}`);
    console.log(`  TX:  ${tx}`);
    return { jobId, tx, jobAddress: jobPDA.toBase58() };
  }

  async getAvailableJobs(): Promise<JobInfo[]> {
    const accounts = await this.connection.getProgramAccounts(PROGRAM_ID, {
      filters: [{ dataSize: 1288 }],
    });

    const jobs: JobInfo[] = [];
    for (const acc of accounts) {
      try {
        const job = this.parseJobAccount(acc.pubkey, acc.account.data);
        if (job.status === 'open') jobs.push(job);
      } catch {}
    }
    return jobs;
  }

  // ================================================================
  // ESCROW & HIRE
  // ================================================================

  async hireAgent(
    agent: AgentInfo,
    jobTitle: string,
    jobDescription: string
  ): Promise<HireResult> {
    const jobId = 'hire-' + Date.now();
    const jobPDA = this.getJobPDA(this.wallet.publicKey, jobId);
    const escrowPDA = this.getEscrowPDA(this.wallet.publicKey, jobId);
    const workerPubkey = new PublicKey(agent.owner);

    // Step 1: Post job
    await (this.program.methods as any)
      .postJob(
        jobId,
        jobTitle,
        jobDescription,
        agent.skills,
        'See job description',
        new BN(86400)
      )
      .accounts({
        jobAccount: jobPDA,
        orchestrator: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Step 2: Lock escrow
    const tx = await (this.program.methods as any)
      .createEscrow(jobId, new BN(agent.pricePerJob), jobDescription)
      .accounts({
        escrowAccount: escrowPDA,
        orchestrator: this.wallet.publicKey,
        worker: workerPubkey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const result: HireResult = {
      jobId,
      jobAddress: jobPDA.toBase58(),
      escrowAddress: escrowPDA.toBase58(),
      txSignature: tx,
      explorerUrl: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
      amountLocked: agent.pricePerJob,
    };

    console.log(`✓ Agent "${agent.name}" hired`);
    console.log(`  Job ID: ${jobId}`);
    console.log(`  Escrow: ${escrowPDA.toBase58()}`);
    console.log(`  Amount: ${agent.pricePerJob / LAMPORTS_PER_SOL} SOL`);
    console.log(`  TX:     ${tx}`);
    console.log(`  Explorer: ${result.explorerUrl}`);

    return result;
  }

  async approveAndPay(jobId: string, workerAddress: string): Promise<string> {
    const escrowPDA = this.getEscrowPDA(this.wallet.publicKey, jobId);
    const workerPubkey = new PublicKey(workerAddress);

    const tx = await (this.program.methods as any)
      .approveAndRelease()
      .accounts({
        escrowAccount: escrowPDA,
        worker: workerPubkey,
        orchestrator: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`✓ Payment released for job ${jobId}`);
    console.log(`  TX: ${tx}`);
    return tx;
  }

  // ================================================================
  // UTILITIES
  // ================================================================

  async getBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.wallet.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  getAgentPDA(ownerKey: PublicKey, name: string): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('agent'), ownerKey.toBuffer(), Buffer.from(name)],
      PROGRAM_ID
    );
    return pda;
  }

  getJobPDA(ownerKey: PublicKey, jobId: string): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('job'), ownerKey.toBuffer(), Buffer.from(jobId)],
      PROGRAM_ID
    );
    return pda;
  }

  getEscrowPDA(ownerKey: PublicKey, jobId: string): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), ownerKey.toBuffer(), Buffer.from(jobId)],
      PROGRAM_ID
    );
    return pda;
  }

  // ================================================================
  // PRIVATE PARSERS
  // ================================================================

  private parseAgentAccount(pubkey: PublicKey, data: Buffer): AgentInfo {
    let offset = 8;
    const owner = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const nameLen = data.readUInt32LE(offset); offset += 4;
    const name = data.slice(offset, offset + nameLen).toString('utf8'); offset += nameLen;
    const descLen = data.readUInt32LE(offset); offset += 4;
    const description = data.slice(offset, offset + descLen).toString('utf8'); offset += descLen;
    const skillsCount = data.readUInt32LE(offset); offset += 4;
    const skills: string[] = [];
    for (let i = 0; i < skillsCount; i++) {
      const sLen = data.readUInt32LE(offset); offset += 4;
      skills.push(data.slice(offset, offset + sLen).toString('utf8'));
      offset += sLen;
    }
    const pricePerJob = Number(data.readBigUInt64LE(offset)); offset += 8;
    const urlLen = data.readUInt32LE(offset); offset += 4;
    const endpointUrl = data.slice(offset, offset + urlLen).toString('utf8'); offset += urlLen;
    const isActive = data[offset] === 1; offset += 1;
    const jobsCompleted = Number(data.readBigUInt64LE(offset));

    return { address: pubkey.toBase58(), owner: owner.toBase58(), name, description, skills, pricePerJob, endpointUrl, isActive, jobsCompleted };
  }

  private parseJobAccount(pubkey: PublicKey, data: Buffer): JobInfo {
    let offset = 8;
    const jobIdLen = data.readUInt32LE(offset); offset += 4;
    const jobId = data.slice(offset, offset + jobIdLen).toString('utf8'); offset += jobIdLen;
    const orchestrator = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    offset += 33;
    const titleLen = data.readUInt32LE(offset); offset += 4;
    const title = data.slice(offset, offset + titleLen).toString('utf8'); offset += titleLen;
    const descLen = data.readUInt32LE(offset); offset += 4;
    const description = data.slice(offset, offset + descLen).toString('utf8'); offset += descLen;

    return { address: pubkey.toBase58(), jobId, orchestrator: orchestrator.toBase58(), title, description, requiredSkills: [], status: 'open', deadline: 0 };
  }
}
