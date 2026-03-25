import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AgentpayContracts } from "../target/types/agentpay_contracts";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("agentpay-contracts", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AgentpayContracts as Program<AgentpayContracts>;
  const owner = provider.wallet as anchor.Wallet;

  // Gunakan timestamp agar nama selalu unik setiap test dijalankan
  const agentName = `ResearchBot-${Date.now()}`;
  const jobId = `job-${Date.now()}`;

  const getAgentPDA = (ownerKey: PublicKey, name: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("agent"), ownerKey.toBuffer(), Buffer.from(name)],
      program.programId
    );
    return pda;
  };

  const getEscrowPDA = (ownerKey: PublicKey, id: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), ownerKey.toBuffer(), Buffer.from(id)],
      program.programId
    );
    return pda;
  };

  // ================================================================
  // AGENT REGISTRY TESTS
  // ================================================================

  it("Register agent berhasil", async () => {
    const agentPDA = getAgentPDA(owner.publicKey, agentName);

    await program.methods
      .registerAgent(
        agentName,
        "Agent riset dan analisis data",
        ["research", "analysis"],
        new anchor.BN(10_000_000),
        "https://api.myagent.com/run"
      )
      .accounts({
        agentAccount: agentPDA,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const agentData = await program.account.agentAccount.fetch(agentPDA);

    assert.equal(agentData.name, agentName);
    assert.equal(agentData.isActive, true);
    assert.equal(agentData.jobsCompleted.toNumber(), 0);
    assert.deepEqual(agentData.skills, ["research", "analysis"]);
    assert.equal(agentData.pricePerJob.toNumber(), 10_000_000);

    console.log("✓ Agent terdaftar:", agentPDA.toBase58());
    console.log("✓ Harga:", agentData.pricePerJob.toNumber(), "lamports");
  });

  it("Deactivate agent berhasil", async () => {
    const agentPDA = getAgentPDA(owner.publicKey, agentName);

    await program.methods
      .deactivateAgent()
      .accounts({ agentAccount: agentPDA, owner: owner.publicKey })
      .rpc();

    const agentData = await program.account.agentAccount.fetch(agentPDA);
    assert.equal(agentData.isActive, false);
    console.log("✓ Agent dinonaktifkan");
  });

  it("Reactivate agent berhasil", async () => {
    const agentPDA = getAgentPDA(owner.publicKey, agentName);

    await program.methods
      .reactivateAgent()
      .accounts({ agentAccount: agentPDA, owner: owner.publicKey })
      .rpc();

    const agentData = await program.account.agentAccount.fetch(agentPDA);
    assert.equal(agentData.isActive, true);
    console.log("✓ Agent diaktifkan kembali");
  });

  // ================================================================
  // ESCROW TESTS
  // ================================================================

  it("Create escrow berhasil", async () => {
    const escrowPDA = getEscrowPDA(owner.publicKey, jobId);
    const workerKeypair = anchor.web3.Keypair.generate();
    const amount = new anchor.BN(50_000_000);

    await program.methods
      .createEscrow(jobId, amount, "Analisis tren DeFi Q1 2026")
      .accounts({
        escrowAccount: escrowPDA,
        orchestrator: owner.publicKey,
        worker: workerKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const escrowData = await program.account.escrowAccount.fetch(escrowPDA);

    assert.equal(escrowData.jobId, jobId);
    assert.equal(escrowData.amount.toNumber(), 50_000_000);
    assert.ok(escrowData.status.funded !== undefined);

    console.log("✓ Escrow dibuat:", escrowPDA.toBase58());
    console.log("✓ SOL terkunci:", escrowData.amount.toNumber(), "lamports");
  });

  it("Approve and release berhasil", async () => {
    const escrowPDA = getEscrowPDA(owner.publicKey, jobId);
    const escrowData = await program.account.escrowAccount.fetch(escrowPDA);

    await program.methods
      .approveAndRelease()
      .accounts({
        escrowAccount: escrowPDA,
        worker: escrowData.worker,
        orchestrator: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const escrowAfter = await program.account.escrowAccount.fetch(escrowPDA);
    assert.ok(escrowAfter.status.completed !== undefined);

    console.log("✓ Payment released ke worker");
    console.log("✓ Status: Completed");
  });
});
