export const PROGRAM_ID = "AgPay1111111111111111111111111111111111111111";

export interface Agent {
  id: string;
  name: string;
  description: string;
  skills: string[];
  priceSOL: number;
  status: "Active" | "Inactive";
  owner: string;
  endpoint: string;
}

export interface Job {
  id: string;
  title: string;
  requiredSkills: string[];
  status: "Open" | "In Progress" | "Completed";
  postedBy: string;
  deadline: string;
  budget: number;
}

export const mockAgents: Agent[] = [
  { id: "1", name: "CodeReviewer-3B", description: "Automated code review agent", skills: ["code-review", "solidity", "rust"], priceSOL: 0.5, status: "Active", owner: "7xKX...9fGh", endpoint: "https://api.agent1.io/run" },
  { id: "2", name: "DataAnalyst-7", description: "On-chain data analysis", skills: ["analytics", "defi", "charts"], priceSOL: 1.2, status: "Active", owner: "3mPQ...kL2x", endpoint: "https://api.agent2.io/run" },
  { id: "3", name: "TxMonitor-Alpha", description: "Transaction monitoring bot", skills: ["monitoring", "alerts", "security"], priceSOL: 0.8, status: "Active", owner: "9nRT...vW4z", endpoint: "https://api.agent3.io/run" },
  { id: "4", name: "NFT-Valuator", description: "NFT price estimation agent", skills: ["nft", "valuation", "ml"], priceSOL: 2.0, status: "Inactive", owner: "5kHJ...mN8y", endpoint: "https://api.agent4.io/run" },
  { id: "5", name: "AuditBot-Pro", description: "Smart contract auditor", skills: ["audit", "security", "solidity"], priceSOL: 3.5, status: "Active", owner: "2pFG...bQ1w", endpoint: "https://api.agent5.io/run" },
];

export const mockJobs: Job[] = [
  { id: "1", title: "Audit Solana Token Contract", requiredSkills: ["audit", "security"], status: "Open", postedBy: "8xAB...cD3e", deadline: "2026-04-05", budget: 3.5 },
  { id: "2", title: "Analyze DeFi Protocol TVL", requiredSkills: ["analytics", "defi"], status: "Open", postedBy: "4mNO...pQ7r", deadline: "2026-04-02", budget: 1.2 },
  { id: "3", title: "Monitor Whale Wallets", requiredSkills: ["monitoring", "alerts"], status: "In Progress", postedBy: "6jKL...sT9u", deadline: "2026-04-10", budget: 0.8 },
  { id: "4", title: "Review Anchor Program", requiredSkills: ["code-review", "rust"], status: "Open", postedBy: "1vWX...yZ5a", deadline: "2026-04-08", budget: 0.5 },
];

export const deployedContracts = [
  { name: "AgentRegistry", address: "AgReg111111111111111111111111111111111111111", network: "Devnet" },
  { name: "EscrowVault", address: "EsVlt222222222222222222222222222222222222222", network: "Devnet" },
  { name: "JobBoard", address: "JbBrd333333333333333333333333333333333333333", network: "Devnet" },
  { name: "PaymentRouter", address: "PyRtr444444444444444444444444444444444444444", network: "Devnet" },
];
