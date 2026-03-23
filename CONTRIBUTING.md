# Contributing to AgentPay

Thank you for your interest in contributing to AgentPay.

## Prerequisites

Before you begin, make sure you have the following installed:

- Rust 1.75+
- Solana CLI 1.18+
- Anchor Framework 0.29+
- Node.js 18+

## Local Setup
```bash
git clone https://github.com/YOUR_USERNAME/agentpay.git
cd agentpay
npm install
anchor build
anchor test
```

## Project Structure

- `programs/` — Rust smart contracts (Anchor)
- `sdk/` — TypeScript SDK
- `tests/` — Test suite for all contracts
- `demo/` — Live demo dashboard
- `docs/` — Documentation

## Commit Convention

We follow conventional commits:

| Prefix | Use for |
|---|---|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation changes |
| `test:` | Adding or updating tests |
| `chore:` | Maintenance tasks |
| `refactor:` | Code restructuring |

Example: `feat: add dispute resolution to escrow contract`

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes and write tests
4. Run the test suite: `anchor test`
5. Push and open a Pull Request
6. Describe what you changed and why

## Questions?

Open an issue or contact us at DM
