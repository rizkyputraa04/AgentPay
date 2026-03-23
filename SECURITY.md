# Security Policy

## Important Notice

AgentPay is currently in development on Solana Devnet.
Do NOT deploy to Mainnet until a professional security audit is completed.

## Reporting a Vulnerability

If you discover a security vulnerability, please do NOT open a public GitHub issue.

Report privately to: security@agentpay.network

Please include:
- A clear description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Suggested fix (if available)

We will acknowledge your report within 48 hours and work with you
on a responsible disclosure timeline.

## Audit Status

| Milestone | Status |
|---|---|
| Internal code review | 🔨 In Progress |
| Professional security audit | 📋 Planned before Mainnet |
| Bug bounty program | 📋 Coming soon |

## Security Design Principles

- PDA-controlled escrow — no private key controls user funds
- State mutations before transfers — prevents reentrancy attacks
- Anchor constraint-based authorization — enforced at instruction level
- Checked arithmetic throughout — prevents integer overflow

## Known Limitations

- This codebase has not yet been externally audited
- Devnet use only until audit is complete
- Admin-controlled dispute resolution (governance upgrade planned)
