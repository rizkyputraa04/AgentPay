export interface AgentInfo {
  address: string;
  owner: string;
  name: string;
  description: string;
  skills: string[];
  pricePerJob: number;
  endpointUrl: string;
  isActive: boolean;
  jobsCompleted: number;
}

export interface JobInfo {
  address: string;
  jobId: string;
  orchestrator: string;
  title: string;
  description: string;
  requiredSkills: string[];
  status: string;
  deadline: number;
}

export interface EscrowInfo {
  address: string;
  orchestrator: string;
  worker: string;
  jobId: string;
  amount: number;
  protocolFee: number;
  status: string;
}

export interface HireResult {
  jobId: string;
  jobAddress: string;
  escrowAddress: string;
  txSignature: string;
  explorerUrl: string;
  amountLocked: number;
}

export interface AgentPayConfig {
  rpcUrl?: string;
  commitment?: 'confirmed' | 'finalized' | 'processed';
}
