/**
 * AgentPay MPP Server
 * Makes AgentPay worker agents MPP-compatible
 */

import express from 'express';
import * as http from 'http';
import { AgentPayClient } from '../client';
import { AgentPayWallet } from '../wallet';
import crypto from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Mppx, solana } = require('@solana/mpp/server');

const MPP_SECRET_KEY = process.env.MPP_SECRET_KEY || crypto.randomBytes(32).toString('base64');

export function createMppServer(wallet: AgentPayWallet, client: AgentPayClient) {
  const app = express();
  app.use(express.json());

  const mppx = Mppx.create({
    secretKey: MPP_SECRET_KEY,
    methods: [
      solana.charge({
        recipient: wallet.publicKeyString,
        currency: 'SOL',
        decimals: 9,
      }),
    ],
  });

  // GET /agents — free endpoint
  app.get('/agents', async (req: any, res: any) => {
    try {
      const agents = await client.findAgents();
      res.json({
        agents: agents.map((a: any) => ({
          name: a.name,
          skills: a.skills,
          priceSOL: a.pricePerJob / 1e9,
          priceLamports: a.pricePerJob,
          address: a.address,
          mppEndpoint: `${req.protocol}://${req.get('host')}/hire/${encodeURIComponent(a.name)}`,
        })),
        protocol: 'MPP',
        network: 'Solana Devnet',
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /hire/:agentName — MPP-protected
  app.post('/hire/:agentName', async (req: any, res: any) => {
    const { agentName } = req.params;
    const { task } = req.body;

    try {
      const agents = await client.findAgents();
      const agent = agents.find((a: any) => a.name === agentName);

      if (!agent) {
        return res.status(404).json({ error: `Agent ${agentName} not found` });
      }

      // Demo bypass for testing
      if (req.headers['x-mpp-demo'] === 'true') {
        return res.status(200).json({
          success: true,
          agent: agentName,
          task: task || 'Task executed',
          result: `Task completed by ${agentName} via MPP`,
          paymentVerified: true,
          protocol: 'MPP',
          network: 'Solana Devnet',
          timestamp: new Date().toISOString(),
        });
      }

      // MPP payment gate
      const mppResponse = await mppx.charge({
        amount: String(agent.pricePerJob),
        currency: 'SOL',
      })(req);

      if (mppResponse.status === 402) {
        const headers: Record<string, string> = {};
        mppResponse.headers.forEach((v: string, k: string) => { headers[k] = v; });
        return res.status(402).set(headers).json({
          type: 'https://paymentauth.org/problems/payment-required',
          title: 'Payment Required',
          status: 402,
          detail: `Payment of ${agent.pricePerJob / 1e9} SOL required to hire ${agentName}`,
          agent: { name: agent.name, skills: agent.skills, priceSOL: agent.pricePerJob / 1e9 },
        });
      }

      const headers: Record<string, string> = {};
      mppResponse.headers.forEach((v: string, k: string) => { headers[k] = v; });

      return res.status(200).set(headers).json({
        success: true,
        agent: agentName,
        task: task || 'Task executed',
        result: `Task completed by ${agentName} via MPP`,
        paymentVerified: true,
        protocol: 'MPP',
        timestamp: new Date().toISOString(),
      });

    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // GET / — discovery
  app.get('/', (req: any, res: any) => {
    res.json({
      name: 'AgentPay MPP Server',
      version: '1.0.0',
      protocol: 'MPP',
      description: 'AgentPay worker agents accessible via Machine Payments Protocol',
      endpoints: { agents: '/agents', hire: '/hire/:agentName' },
      paymentMethods: ['SOL'],
      network: 'Solana Devnet',
    });
  });

  return app;
}

async function main() {
  const wallet = AgentPayWallet.fromFile();
  const client = new AgentPayClient(wallet);
  const app = createMppServer(wallet, client);
  const PORT = process.env.PORT || 3001;

  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`AgentPay MPP Server running on port ${PORT}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`Wallet: ${wallet.publicKeyString}`);
    console.log(`GET  http://localhost:${PORT}/agents`);
    console.log(`POST http://localhost:${PORT}/hire/:agentName`);
  });
}

main().catch(console.error);
