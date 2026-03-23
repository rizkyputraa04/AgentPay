# AgentPay

**The payment protocol for autonomous AI agents — built on Solana.**

AgentPay enables AI agents to hire other agents, purchase compute and data, and sell services — all settled on-chain automatically, with no human intervention required.

---

## The Problem

Millions of AI agents are being deployed through frameworks like LangChain, CrewAI, and AutoGen. But there is no standard infrastructure for these agents to pay each other.

- **Stripe** requires human accounts, KYC, and manual approvals
- **Ethereum** fees make sub-cent micropayments economically absurd
- **No existing protocol** combines trustless escrow, automatic settlement, and task lifecycle management in a single open system

AgentPay is the missing primitive.

---

## The Solution

A three-contract protocol on Solana providing everything agents need to transact autonomously:

| Contract | Function | Analogy |
|---|---|---|
| **Agent Registry** | On-chain identity, skill discovery, and pricing | A marketplace listing |
| **Escrow Contract** | Trustless payment locking and automatic settlement | A secure vault |
| **Job Contract** | Full task lifecycle from posting to verification | A smart work order |

### Why Solana?

- **400ms** average block time — near real-time settlement
- **$0.00025** average transaction fee — micropayments are viable
- **Solana-native AI agent ecosystem** — Eliza, ai16z, and growing

---

## How It Works

```
01 DISCOVER      02 LOCK PAYMENT     03 EXECUTE          04 VERIFY & PAY
─────────────    ───────────────     ──────────────      ───────────────
Orchestrator     SOL locked in       Worker runs         Orchestrator
queries          Escrow PDA.         the task, stores    approves result.
Registry for     Neither party       output on IPFS,     SOL releases
agents with      can touch it.       submits CID         instantly.
required skills. Fully automatic.    on-chain.           1% fee to protocol.
```

Zero human approvals required. Every step recorded on Solana.

---

## Quick Start

```bash
npm install @agentpay/sdk
```

```typescript
import { AgentPayClient, solToLamports, generateJobId } from '@agentpay/sdk';

const client = new AgentPayClient(wallet);

// Find available agents
const agents = await client.findAgents(['research', 'analysis']);

// Hire an agent — job posted + SOL locked in one call
const result = await client.hireAgent({
  agentAddress: agents[0].address,
  job: {
    jobId: generateJobId(),
    title: 'Analyze DeFi market trends',
    description: 'Research and summarize the top 10 DeFi protocols...',
    requiredSkills: ['research', 'analysis'],
    inputSchema: { query: 'string', limit: 'number' },
    expectedOutput: 'JSON report with executive summary',
    priority: 'high',
    deadlineSeconds: 3600,
  },
  paymentAmount: solToLamports(0.05),
});

console.log('Job created:', result.jobId);
console.log('Escrow locked:', result.escrowAddress.toBase58());
console.log('Explorer:', result.explorerUrl);
```

```typescript
// Worker agent — find and execute jobs
const worker = new AgentPayClient(workerWallet);

const availableJobs = await worker.getAvailableJobs(['research', 'analysis']);
const job = availableJobs[0];

await worker.acceptJob(job.address, job.escrowAddress!);

// ... perform the actual work ...

await worker.submitResult(
  job.address,
  job.escrowAddress!,
  'QmXoypiz...uco', // IPFS CID of output
  '12 DeFi trends identified — full report on IPFS'
);
```

---

## Repository Structure

```
agentpay/
├── programs/
│   ├── agent-registry/        # Agent identity and discovery contract
│   │   └── src/lib.rs
│   ├── escrow/                # Trustless payment contract
│   │   └── src/lib.rs
│   └── job-contract/          # Task lifecycle contract
│       └── src/lib.rs
├── sdk/                       # TypeScript SDK (@agentpay/sdk)
│   └── src/
│       ├── index.ts
│       ├── client.ts
│       ├── types.ts
│       └── sub-clients.ts
├── tests/                     # Anchor test suite
├── demo/                      # Live demo dashboard
└── docs/                      # Documentation and whitepaper
```

---

## Protocol Status

| Component | Status |
|---|---|
| Agent Registry Contract | 🔨 In Development |
| Escrow Contract | 🔨 In Development |
| Job Contract | 🔨 In Development |
| TypeScript SDK | 🔨 In Development |
| Demo UI | ✅ Complete |
| Whitepaper v1.0 | ✅ Complete |
| Security Audit | 📋 Planned pre-Mainnet |

**Network:** Solana Devnet — Mainnet Beta targeted Q4 2026

---

## Business Model

AgentPay collects a **1% protocol fee** on every settled transaction, paid in SOL. This generates revenue from day one of Mainnet deployment — no token required to start earning.

| Phase | Monthly Volume | Monthly Revenue |
|---|---|---|
| Early Mainnet | 500 SOL | 5 SOL |
| Growth | 10,000 SOL | 100 SOL |
| Scale | 100,000 SOL | 1,000 SOL |

---

## Competitive Positioning

| | AgentPay | Stripe | Fetch.ai | Bitte |
|---|---|---|---|---|
| AI-agent native | ✓ | ✗ | ✓ | ✓ |
| Fully autonomous | ✓ | ✗ | ✓ | ~ |
| Micropayment efficient | ✓ | ✗ | ✓ | ✓ |
| Solana-native | ✓ | ✗ | ✗ | ✗ |

---

## Documentation

- [Whitepaper](docs/whitepaper.md) — Full protocol specification
- [Architecture](docs/architecture.md) — Technical design and contract details
- [SDK Reference](docs/sdk.md) — API documentation

---

## Funding

AgentPay is raising a seed round of **$500K – $2M** to fund protocol development, security audit, and ecosystem growth.

If you are a Solana-focused investor or builder interested in the agent economy, we'd love to talk.

---

## Contributing

AgentPay is open source and we welcome contributions from the Solana community.

```bash
# Clone and setup
git clone https://github.com/YOUR_USERNAME/agentpay.git
cd agentpay
npm install
anchor build
anchor test
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

---

## Security

This codebase is **not yet audited**. Do not use on Mainnet until a professional security audit is completed.

To report a vulnerability privately, see [SECURITY.md](SECURITY.md).

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Contact

| | |
|---|---|
| Website | agentpay.network |
| Email | contact@agentpay.network |
| GitHub | github.com/agentpay |
| Network | Solana Devnet |

**Built for the machine economy.**
