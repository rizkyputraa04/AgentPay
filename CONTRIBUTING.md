cat > CONTRIBUTING.md << 'EOF'
# Contributing to AgentPay

Thank you for your interest in contributing to AgentPay.

## Prerequisites

- Rust 1.75+
- Solana CLI 1.18+
- Anchor 0.29+
- Node.js 18+

## Setup
```bash
git clone https://github.com/YOUR_USERNAME/agentpay.git
cd agentpay
npm install
anchor build
anchor test
```

## Commit Convention

We use conventional commits:

- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation
- `test:` — adding tests
- `chore:` — maintenance

Example: `feat: add dispute resolution to escrow contract`

## Pull Request Process

1. Make sure all tests pass: `anchor test`
2. Update documentation if needed
3. Reference any related issues in your PR description

EOF
