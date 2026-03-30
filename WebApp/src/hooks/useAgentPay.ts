import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { AnchorProvider, BN, Program, Idl } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, Connection } from '@solana/web3.js';
import { useMemo } from 'react';

const PROGRAM_ID = new PublicKey('Fpp4D9vgStYwnwoukyFG38n3ZF18pS6kfBbdUdKAxw9h');
const DEVNET_URL = 'https://api.devnet.solana.com';

export function useAgentPay() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const provider = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    return new AnchorProvider(connection, wallet as any, { commitment: 'confirmed' });
  }, [connection, wallet.publicKey]);

  const getAgentPDA = (ownerKey: PublicKey, name: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('agent'), ownerKey.toBuffer(), Buffer.from(name)],
      PROGRAM_ID
    );
    return pda;
  };

  const getJobPDA = (ownerKey: PublicKey, jobId: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('job'), ownerKey.toBuffer(), Buffer.from(jobId)],
      PROGRAM_ID
    );
    return pda;
  };

  const getEscrowPDA = (ownerKey: PublicKey, jobId: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('escrow'), ownerKey.toBuffer(), Buffer.from(jobId)],
      PROGRAM_ID
    );
    return pda;
  };

  const getProgram = async () => {
    if (!provider) throw new Error('Wallet not connected');
    const idl = await fetch('/agentpay_idl_v1.json').then(r => r.json());
    // Fix IDL format untuk Anchor browser
    const fixedIdl = {
      ...idl,
      accounts: idl.accounts?.map((acc: any) => ({
        name: acc.name,
        discriminator: acc.discriminator,
        type: {
          kind: 'struct',
          fields: acc.type?.fields || [],
        },
      })) || [],
      types: idl.types || [],
    } as Idl;
    return new Program(fixedIdl, PROGRAM_ID, provider);
  };

  const fetchAgents = async () => {
    try {
      const conn = new Connection(DEVNET_URL, 'confirmed');
      const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
        filters: [{ dataSize: 672 }],
      });
      return accounts.map((acc) => {
        try {
          const data = acc.account.data;
          let offset = 8;
          const owner = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
          const nameLen = data.readUInt32LE(offset); offset += 4;
          const name = data.slice(offset, offset + nameLen).toString('utf8'); offset += nameLen;
          const descLen = data.readUInt32LE(offset); offset += 4;
          const description = data.slice(offset, offset + descLen).toString('utf8'); offset += descLen;
          const skillsCount = data.readUInt32LE(offset); offset += 4;
          const skills: string[] = [];
          for (let i = 0; i < skillsCount; i++) {
            const sLen = data.readUInt32LE(offset); offset += 4;
            skills.push(data.slice(offset, offset + sLen).toString('utf8'));
            offset += sLen;
          }
          const pricePerJob = Number(data.readBigUInt64LE(offset)); offset += 8;
          const urlLen = data.readUInt32LE(offset); offset += 4;
          const endpointUrl = data.slice(offset, offset + urlLen).toString('utf8'); offset += urlLen;
          const isActive = data[offset] === 1;
          return { address: acc.pubkey.toBase58(), owner: owner.toBase58(), name, description, skills, pricePerJob, endpointUrl, isActive };
        } catch { return null; }
      }).filter(Boolean);
    } catch (e) {
      console.error('fetchAgents error:', e);
      return [];
    }
  };

  const fetchJobs = async () => {
    try {
      const conn = new Connection(DEVNET_URL, 'confirmed');
      const accounts = await conn.getProgramAccounts(PROGRAM_ID, {
        filters: [{ dataSize: 1288 }],
      });
      return accounts.map((acc) => {
        try {
          const data = acc.account.data;
          let offset = 8;
          const jobIdLen = data.readUInt32LE(offset); offset += 4;
          const jobId = data.slice(offset, offset + jobIdLen).toString('utf8'); offset += jobIdLen;
          const orchestrator = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
          offset += 33;
          const titleLen = data.readUInt32LE(offset); offset += 4;
          const title = data.slice(offset, offset + titleLen).toString('utf8'); offset += titleLen;
          const descLen = data.readUInt32LE(offset); offset += 4;
          const description = data.slice(offset, offset + descLen).toString('utf8'); offset += descLen;
          return { address: acc.pubkey.toBase58(), jobId, orchestrator: orchestrator.toBase58(), title, description, requiredSkills: [], status: 'open', deadline: 0 };
        } catch { return null; }
      }).filter(Boolean);
    } catch (e) {
      console.error('fetchJobs error:', e);
      return [];
    }
  };

  const registerAgent = async (name: string, description: string, skills: string[], pricePerJob: number, endpointUrl: string) => {
    if (!provider || !wallet.publicKey) throw new Error('Wallet not connected');
    const program = await getProgram();
    const agentPDA = getAgentPDA(wallet.publicKey, name);
    return await (program.methods as any)
      .registerAgent(name, description, skills, new BN(pricePerJob), endpointUrl)
      .accounts({ agentAccount: agentPDA, owner: wallet.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
  };

  const postJob = async (jobId: string, title: string, description: string, requiredSkills: string[], expectedOutput: string, deadlineSeconds: number) => {
    if (!provider || !wallet.publicKey) throw new Error('Wallet not connected');
    const program = await getProgram();
    const jobPDA = getJobPDA(wallet.publicKey, jobId);
    return await (program.methods as any)
      .postJob(jobId, title, description, requiredSkills, expectedOutput, new BN(deadlineSeconds))
      .accounts({ jobAccount: jobPDA, orchestrator: wallet.publicKey, systemProgram: SystemProgram.programId })
      .rpc();
  };

  const hireAgent = async (jobId: string, title: string, description: string, requiredSkills: string[], workerAddress: string, amountLamports: number) => {
    if (!provider || !wallet.publicKey) throw new Error('Wallet not connected');
    const program = await getProgram();
    const jobPDA = getJobPDA(wallet.publicKey, jobId);
    const escrowPDA = getEscrowPDA(wallet.publicKey, jobId);
    const workerPubkey = new PublicKey(workerAddress);

    await (program.methods as any)
      .postJob(jobId, title, description, requiredSkills, 'See description', new BN(86400))
      .accounts({ jobAccount: jobPDA, orchestrator: wallet.publicKey, systemProgram: SystemProgram.programId })
      .rpc();

    const tx = await (program.methods as any)
      .createEscrow(jobId, new BN(amountLamports), description)
      .accounts({ escrowAccount: escrowPDA, orchestrator: wallet.publicKey, worker: workerPubkey, systemProgram: SystemProgram.programId })
      .rpc();

    return {
      txSignature: tx,
      escrowAddress: escrowPDA.toBase58(),
      explorerUrl: 'https://explorer.solana.com/tx/' + tx + '?cluster=devnet',
    };
  };

  return { provider, wallet, connected: wallet.connected, publicKey: wallet.publicKey, fetchAgents, fetchJobs, registerAgent, postJob, hireAgent };
}
