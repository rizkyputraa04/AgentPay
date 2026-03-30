import { AgentPayClient } from './client';
import { AgentPayWallet } from './wallet';

async function main() {
  console.log('=== AgentPay SDK Test ===\n');

  // Load wallet dari Solana config
  const wallet = AgentPayWallet.fromFile();
  console.log('Wallet:', wallet.publicKeyString);

  // Init client
  const client = new AgentPayClient(wallet);

  // Cek balance
  const balance = await client.getBalance();
  console.log('Balance:', balance, 'SOL\n');

  // Find all active agents
  console.log('--- Finding agents ---');
  const agents = await client.findAgents();
  console.log('Total agents:', agents.length);
  agents.forEach(a => {
    console.log(`  - ${a.name} | ${a.pricePerJob / 1e9} SOL | Skills: ${a.skills.join(', ')}`);
  });

  // Find agents by skill
  console.log('\n--- Finding agents with "research" skill ---');
  const researchAgents = await client.findAgents(['research']);
  console.log('Research agents:', researchAgents.length);

  console.log('\n✓ SDK test completed successfully');
}

main().catch(console.error);
