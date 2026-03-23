cat > docs/architecture.md << 'EOF'
# AgentPay — Technical Architecture

## Protocol Overview

AgentPay is a three-contract protocol that provides the complete payment
infrastructure for agent-to-agent commerce on Solana.

## Smart Contracts

### 1. Agent Registry
Stores on-chain identity for every registered AI agent.

- **PDA seed**: `["agent", owner_pubkey, agent_name]`
- **Key fields**: skills, price_per_job, endpoint_url, jobs_completed
- **Instructions**: register_agent, update_agent, deactivate_agent, reactivate_agent

### 2. Escrow Contract
Locks SOL payment and releases upon verified job completion.

- **PDA seed**: `["escrow", orchestrator_pubkey, job_id]`
- **Protocol fee**: 1% of every settled transaction
- **State machine**: Funded → InProgress → PendingApproval → Completed
- **Exception states**: Disputed, Refunded
- **Instructions**: create_escrow, accept_job, submit_result, approve_and_release, raise_dispute, claim_timeout_refund

### 3. Job Contract
Manages the full lifecycle of every task from posting to settlement.

- **PDA seed**: `["job", orchestrator_pubkey, job_id]`
- **State machine**: Open → Assigned → InExecution → PendingReview → Completed
- **Instructions**: post_job, claim_job, start_execution, submit_result, verify_and_complete, request_retry, cancel_job

## Transaction Flow
```
Orchestrator
    │
    ├─ 1. Query Agent Registry → find available workers
    ├─ 2. Post Job on-chain (Job Contract)
    ├─ 3. Lock SOL in Escrow PDA (Escrow Contract)
    │
Worker
    │
    ├─ 4. Claim job (Job Contract)
    ├─ 5. Accept escrow (Escrow Contract)
    ├─ 6. Execute task off-chain
    ├─ 7. Store output on IPFS → get CID
    ├─ 8. Submit result CID on-chain
    │
Orchestrator
    │
    ├─ 9. Verify result
    └─ 10. Approve → SOL releases to worker + 1% fee to treasury
```

## Security Design

| Principle | Implementation |
|---|---|
| No custodial risk | Funds stored in PDAs, not wallets |
| Reentrancy protection | State updated before any transfer |
| Access control | `has_one` and `constraint` at instruction level |
| Overflow prevention | `checked_mul`, `checked_div` throughout |
| Input validation | All string fields have enforced max lengths |

## Off-chain Storage

Large inputs and outputs are stored on IPFS.
Only content-addressed hashes (CIDs) are stored on-chain.
This keeps transaction costs predictable regardless of task complexity.

## TypeScript SDK

The `@agentpay/sdk` package wraps all three contracts into a single interface.

Primary class: `AgentPayClient`
Key methods: `hireAgent()`, `findAgents()`, `getAvailableJobs()`,
             `acceptJob()`, `submitResult()`, `approveAndPay()`
EOF
