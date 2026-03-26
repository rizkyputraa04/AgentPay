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

  const timestamp = Date.now();
  const agentName = `ResearchBot-${timestamp}`;
  const jobId = `job-${timestamp}`;

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

  const getJobPDA = (ownerKey: PublicKey, id: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("job"), ownerKey.toBuffer(), Buffer.from(id)],
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

  // ================================================================
  // JOB CONTRACT TESTS
  // ================================================================

  it("Post job berhasil", async () => {
    const jobPDA = getJobPDA(owner.publicKey, jobId);

    await program.methods
      .postJob(
        jobId,
        "Analisis tren DeFi Q1 2026",
        "Buat laporan analisis lengkap tentang perkembangan DeFi",
        ["research", "analysis"],
        "Laporan PDF dengan executive summary",
        new anchor.BN(86400)
      )
      .accounts({
        jobAccount: jobPDA,
        orchestrator: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const jobData = await program.account.jobAccount.fetch(jobPDA);

    assert.equal(jobData.jobId, jobId);
    assert.ok(jobData.status.open !== undefined);
    assert.equal(jobData.worker, null);
    assert.deepEqual(jobData.requiredSkills, ["research", "analysis"]);

    console.log("✓ Job diposting:", jobPDA.toBase58());
    console.log("✓ Status: Open");
  });

  it("Claim job berhasil", async () => {
    const jobPDA = getJobPDA(owner.publicKey, jobId);
    const workerKeypair = anchor.web3.Keypair.generate();

    // Transfer SOL dari owner ke worker (tidak perlu airdrop)
    const transferTx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: owner.publicKey,
        toPubkey: workerKeypair.publicKey,
        lamports: 10_000_000, // 0.01 SOL cukup untuk fee
      })
    );
    await provider.sendAndConfirm(transferTx);

    await program.methods
      .claimJob()
      .accounts({
        jobAccount: jobPDA,
        worker: workerKeypair.publicKey,
      })
      .signers([workerKeypair])
      .rpc();

    const jobData = await program.account.jobAccount.fetch(jobPDA);

    assert.ok(jobData.status.inProgress !== undefined);
    assert.equal(
      jobData.worker?.toBase58(),
      workerKeypair.publicKey.toBase58()
    );

    console.log("✓ Job di-claim oleh worker");
    console.log("✓ Status: InProgress");
  });

  it("Cancel job berhasil", async () => {
    const cancelJobId = `cancel-${timestamp}`;
    const jobPDA = getJobPDA(owner.publicKey, cancelJobId);

    await program.methods
      .postJob(
        cancelJobId,
        "Job untuk di-cancel",
        "Test cancel job",
        ["test"],
        "Test output",
        new anchor.BN(86400)
      )
      .accounts({
        jobAccount: jobPDA,
        orchestrator: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .cancelJob()
      .accounts({
        jobAccount: jobPDA,
        orchestrator: owner.publicKey,
      })
      .rpc();

    const jobData = await program.account.jobAccount.fetch(jobPDA);
    assert.ok(jobData.status.cancelled !== undefined);

    console.log("✓ Job berhasil dibatalkan");
    console.log("✓ Status: Cancelled");
  });
});
