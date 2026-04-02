/**
 * AgentPay MPP Client
 * Enables AgentPay agents to PAY for external services via MPP
 */

import { AgentPayWallet } from '../wallet';

export class AgentPayMppClient {
  private wallet: AgentPayWallet;

  constructor(wallet: AgentPayWallet) {
    this.wallet = wallet;
  }

  async discoverAgents(serverUrl: string): Promise<any[]> {
    const response = await fetch(`${serverUrl}/agents`);
    const data = await response.json() as any;
    return data.agents || [];
  }

  async hireAgentViaMpp(
    serverUrl: string,
    agentName: string,
    task: string
  ): Promise<any> {
    console.log(`\n  MPP Hire: ${agentName}`);
    console.log(`  Task: ${task}`);

    // Step 1: Request without payment — expect 402
    const firstResponse = await fetch(
      `${serverUrl}/hire/${encodeURIComponent(agentName)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      }
    );

    if (firstResponse.status === 402) {
      const challenge = await firstResponse.json() as any;
      console.log(`  ✓ Got 402 Payment Required`);
      console.log(`  ✓ Challenge: ${JSON.stringify(challenge).slice(0, 80)}...`);
      console.log(`  ✓ Payment amount: ${challenge.agent?.priceSOL} SOL`);

      // In production: agent would sign and send Solana transaction here
      // For demo: simulate payment credential
      console.log(`  → Simulating MPP payment flow...`);

      // Step 2: Retry with payment credential header (simulated)
      const paidResponse = await fetch(
        `${serverUrl}/hire/${encodeURIComponent(agentName)}?bypass=demo`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-MPP-Demo': 'true',
          },
          body: JSON.stringify({ task }),
        }
      );

      return await paidResponse.json();
    }

    return await firstResponse.json();
  }
}
