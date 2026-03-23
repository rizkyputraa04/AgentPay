import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// =============================================================================
// CORE CONFIG
// =============================================================================

export interface AgentPayConfig {
  /** RPC endpoint Solana. Default: devnet */
  rpcEndpoint?: string;
  /** Program IDs — override jika deploy ulang */
  programIds?: {
    registry?: string;
    escrow?: string;
    job?: string;
  };
  /** Wallet treasury AgentPay untuk menerima protocol fee */
  treasuryAddress?: string;
  /** Commitment level untuk transaksi */
  commitment?: "processed" | "confirmed" | "finalized";
}

export const DEFAULT_CONFIG: Required<AgentPayConfig> = {
  rpcEndpoint: "https://api.devnet.solana.com",
  programIds: {
    registry: "AgntReg11111111111111111111111111111111111",
    escrow:   "EscrwPay1111111111111111111111111111111111",
    job:      "JobPay111111111111111111111111111111111111",
  },
  treasuryAddress: "Treasury1111111111111111111111111111111111",
  commitment: "confirmed",
};

// =============================================================================
// AGENT TYPES
// =============================================================================

export interface RegisterAgentParams {
  /** Nama unik agent, max 50 karakter */
  name: string;
  /** Deskripsi kemampuan agent, max 200 karakter */
  description: string;
  /** List skill tags, misal ["code", "research", "analysis"] */
  skills: string[];
  /** Harga per job dalam lamports. Gunakan helper toSOL() untuk konversi */
  pricePerJob: number;
  /** URL endpoint agent untuk menerima job request */
  endpointUrl: string;
}

export interface AgentInfo {
  address: PublicKey;
  owner: PublicKey;
  name: string;
  description: string;
  skills: string[];
  pricePerJob: number;
  endpointUrl: string;
  isActive: boolean;
  jobsCompleted: number;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// JOB TYPES
// =============================================================================

export type JobPriority = "low" | "normal" | "high" | "urgent";
export type JobStatus =
  | "open"
  | "assigned"
  | "inExecution"
  | "pendingReview"
  | "completed"
  | "cancelled"
  | "expired";

export interface PostJobParams {
  /** ID unik untuk job ini, max 32 karakter */
  jobId: string;
  /** Judul singkat job, max 100 karakter */
  title: string;
  /** Deskripsi lengkap task, max 500 karakter */
  description: string;
  /** Skills yang dibutuhkan worker untuk mengerjakan job ini */
  requiredSkills: string[];
  /** JSON schema format input yang akan dikirim ke worker */
  inputSchema: object;
  /** Deskripsi format output yang diharapkan */
  expectedOutput: string;
  /** Tingkat prioritas job */
  priority?: JobPriority;
  /** Deadline dalam detik dari sekarang. Default: 86400 (24 jam) */
  deadlineSeconds?: number;
  /** Maksimal percobaan ulang jika result ditolak. Default: 1 */
  maxRetries?: number;
  /** Tag kategori untuk indexing */
  tags?: string[];
  /** IPFS CID untuk context/data input tambahan yang besar */
  contextCid?: string;
}

export interface HireAgentParams {
  /** Pubkey agent yang ingin di-hire */
  agentAddress: PublicKey;
  /** Spesifikasi job yang akan dikerjakan */
  job: PostJobParams;
  /** Jumlah SOL yang dibayar dalam lamports */
  paymentAmount: number;
}

export interface JobInfo {
  address: PublicKey;
  jobId: string;
  orchestrator: PublicKey;
  worker: PublicKey | null;
  escrowAddress: PublicKey | null;
  title: string;
  description: string;
  requiredSkills: string[];
  inputSchema: string;
  expectedOutput: string;
  contextCid: string | null;
  priority: JobPriority;
  status: JobStatus;
  resultCid: string | null;
  resultVerified: boolean;
  retryCount: number;
  maxRetries: number;
  tags: string[];
  createdAt: Date;
  deadline: Date;
  executionLog: ExecutionLogEntry[];
}

export interface ExecutionLogEntry {
  eventType: string;
  actor: PublicKey;
  timestamp: Date;
  note: string | null;
}

// =============================================================================
// ESCROW TYPES
// =============================================================================

export type EscrowStatus =
  | "funded"
  | "inProgress"
  | "pendingApproval"
  | "completed"
  | "disputed"
  | "refunded";

export interface EscrowInfo {
  address: PublicKey;
  orchestrator: PublicKey;
  worker: PublicKey;
  jobId: string;
  amount: number;
  protocolFee: number;
  status: EscrowStatus;
  resultHash: string | null;
  createdAt: Date;
  deadline: Date;
}

// =============================================================================
// RESULT TYPES
// =============================================================================

export interface TxResult {
  /** Signature transaksi Solana */
  signature: string;
  /** Link ke Solana Explorer */
  explorerUrl: string;
}

export interface HireResult extends TxResult {
  jobAddress: PublicKey;
  escrowAddress: PublicKey;
  jobId: string;
}

// =============================================================================
// FILTER TYPES (untuk query)
// =============================================================================

export interface JobFilter {
  status?: JobStatus;
  skills?: string[];
  priority?: JobPriority;
  orchestrator?: PublicKey;
  worker?: PublicKey;
  tags?: string[];
}

export interface AgentFilter {
  skills?: string[];
  maxPrice?: number;
  isActive?: boolean;
}

// =============================================================================
// HELPER UTILS
// =============================================================================

/** Konversi SOL ke lamports */
export const solToLamports = (sol: number): number =>
  Math.floor(sol * 1_000_000_000);

/** Konversi lamports ke SOL */
export const lamportsToSol = (lamports: number): number =>
  lamports / 1_000_000_000;

/** Generate job ID unik berdasarkan timestamp + random */
export const generateJobId = (prefix = "job"): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${prefix}-${timestamp}-${random}`.substring(0, 32);
};

/** Format lamports ke string SOL yang readable */
export const formatSol = (lamports: number): string =>
  `${lamportsToSol(lamports).toFixed(4)} SOL`;
