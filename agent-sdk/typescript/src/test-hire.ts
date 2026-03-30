import { AgentPayClient } from './client';
import { AgentPayWallet } from './wallet';

async function main() {
  console.log('=== AgentPay SDK - Hire Agent Test ===\n');

  const wallet = AgentPayWallet.fromFile();
  const client = new AgentPayClient(wallet);

  const balance = await client.getBalance();
  console.log('Wallet:', wallet.publicKeyString);
  console.log('Balance:', balance, 'SOL\n');

  // Step 1: Find agent dengan skill research
  console.log('--- Step 1: Finding research agent ---');
  const agents = await client.findAgents(['research']);
  if (agents.length === 0) {
    console.log('No agents found');
    return;
  }
  const agent = agents[0];
  console.log(`Selected: ${agent.name}`);
  console.log(`Price: ${agent.pricePerJob / 1e9} SOL`);
  console.log(`Owner: ${agent.owner}\n`);

  // Step 2: Hire agent - ini yang dilakukan AI agent secara otomatis
  console.log('--- Step 2: Hiring agent (posting job + locking escrow) ---');
  const result = await client.hireAgent(
    agent,
    'Analyze DeFi trends Q1 2026',
    'Research and analyze top DeFi protocols performance in Q1 2026'
  );

  console.log('\n=== HIRE SUCCESSFUL ===');
  console.log('Job ID:', result.jobId);
  console.log('Escrow:', result.escrowAddress);
  console.log('Amount locked:', result.amountLocked / 1e9, 'SOL');
  console.log('Explorer:', result.explorerUrl);
}

main().catch(console.error);
