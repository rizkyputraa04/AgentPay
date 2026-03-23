import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { AgentpayEscrow } from "../target/types/agentpay_escrow";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("AgentPay — Escrow Contract", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AgentpayEscrow as Program<AgentpayEscrow>;

  // Actors
  const orchestrator = provider.wallet as anchor.Wallet;
  const workerKeypair = Keypair.generate();
  const treasuryKeypair = Keypair.generate();
  const adminKeypair = Keypair.generate();

  const JOB_AMOUNT = new BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL
  const PROTOCOL_FEE = JOB_AMOUNT.muln(100).divn(10_000); // 1%

  // Helper: derive escrow PDA
  const getEscrowPDA = (orchestratorKey: PublicKey, jobId: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), orchestratorKey.toBuffer(), Buffer.from(jobId)],
      program.programId
    );
    return pda;
  };

  // Airdrop SOL ke semua actors sebelum test
  before(async () => {
    for (const kp of [workerKeypair, treasuryKeypair, adminKeypair]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        0.5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
  });

  // ---------------------------------------------------------------------------
  // HAPPY PATH: create → accept → submit → approve
  // ---------------------------------------------------------------------------

  it("Happy path: escrow selesai dan worker menerima pembayaran", async () => {
    const jobId = "job-001";
    const escrowPDA = getEscrowPDA(orchestrator.publicKey, jobId);

    // 1. Orchestrator buat escrow
    await program.methods
      .createEscrow(
        jobId,
        JOB_AMOUNT,
        "Analisis 10 paper AI terbaru dan buat ringkasan",
        null
      )
      .accounts({
        escrowAccount: escrowPDA,
        orchestrator: orchestrator.publicKey,
        workerAgent: workerKeypair.publicKey,
        treasury: treasuryKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    let escrow = await program.account.escrowAccount.fetch(escrowPDA);
    assert.equal(escrow.status.funded !== undefined, true, "Status harus Funded");
    console.log("  [1] Escrow dibuat, SOL terkunci:", escrow.amount.toNumber());

    // 2. Worker accept job
    await program.methods
      .acceptJob()
      .accounts({
        escrowAccount: escrowPDA,
        worker: workerKeypair.publicKey,
      })
      .signers([workerKeypair])
      .rpc();

    escrow = await program.account.escrowAccount.fetch(escrowPDA);
    assert.equal(escrow.status.inProgress !== undefined, true, "Status harus InProgress");
    console.log("  [2] Worker accept job, accepted_at:", escrow.acceptedAt);

    // 3. Worker submit result
    const resultHash = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"; // contoh IPFS CID
    await program.methods
      .submitResult(resultHash)
      .accounts({
        escrowAccount: escrowPDA,
        worker: workerKeypair.publicKey,
      })
      .signers([workerKeypair])
      .rpc();

    escrow = await program.account.escrowAccount.fetch(escrowPDA);
    assert.equal(escrow.status.pendingApproval !== undefined, true);
    assert.equal(escrow.resultHash, resultHash);
    console.log("  [3] Result submitted, hash:", escrow.resultHash);

    // 4. Orchestrator approve dan release payment
    const workerBalanceBefore = await provider.connection.getBalance(workerKeypair.publicKey);

    await program.methods
      .approveAndRelease()
      .accounts({
        escrowAccount: escrowPDA,
        workerAgent: workerKeypair.publicKey,
        treasury: treasuryKeypair.publicKey,
        orchestrator: orchestrator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const workerBalanceAfter = await provider.connection.getBalance(workerKeypair.publicKey);
    const treasuryBalance = await provider.connection.getBalance(treasuryKeypair.publicKey);

    escrow = await program.account.escrowAccount.fetch(escrowPDA);
    assert.equal(escrow.status.completed !== undefined, true, "Status harus Completed");

    const workerReceived = workerBalanceAfter - workerBalanceBefore;
    console.log("  [4] Payment released!");
    console.log("      Worker menerima:", workerReceived, "lamports");
    console.log("      Treasury balance:", treasuryBalance, "lamports (termasuk fee)");
    assert.equal(workerReceived, JOB_AMOUNT.toNumber(), "Worker harus menerima jumlah penuh");
  });

  // ---------------------------------------------------------------------------
  // TIMEOUT PATH: orchestrator klaim refund setelah deadline
  // ---------------------------------------------------------------------------

  it("Timeout: orchestrator berhasil klaim refund setelah deadline", async () => {
    const jobId = "job-timeout-001";
    const escrowPDA = getEscrowPDA(orchestrator.publicKey, jobId);

    // Buat escrow dengan timeout sangat pendek (1 detik) untuk testing
    await program.methods
      .createEscrow(
        jobId,
        new BN(0.05 * LAMPORTS_PER_SOL),
        "Test timeout job",
        new BN(1) // timeout 1 detik
      )
      .accounts({
        escrowAccount: escrowPDA,
        orchestrator: orchestrator.publicKey,
        workerAgent: workerKeypair.publicKey,
        treasury: treasuryKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Tunggu 2 detik sampai deadline lewat
    await new Promise(resolve => setTimeout(resolve, 2000));

    const balanceBefore = await provider.connection.getBalance(orchestrator.publicKey);

    await program.methods
      .claimTimeoutRefund()
      .accounts({
        escrowAccount: escrowPDA,
        orchestrator: orchestrator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const balanceAfter = await provider.connection.getBalance(orchestrator.publicKey);
    const escrow = await program.account.escrowAccount.fetch(escrowPDA);

    assert.equal(escrow.status.refunded !== undefined, true, "Status harus Refunded");
    console.log("  Refund berhasil, SOL kembali ke orchestrator");
    console.log("  Delta balance:", balanceAfter - balanceBefore, "lamports");
  });

  // ---------------------------------------------------------------------------
  // DISPUTE PATH: orchestrator raise dispute, admin resolve
  // ---------------------------------------------------------------------------

  it("Dispute: admin berhasil menyelesaikan dispute demi orchestrator", async () => {
    const jobId = "job-dispute-001";
    const escrowPDA = getEscrowPDA(orchestrator.publicKey, jobId);

    // Setup: buat escrow sampai PendingApproval
    await program.methods
      .createEscrow(jobId, new BN(0.05 * LAMPORTS_PER_SOL), "Test dispute job", null)
      .accounts({
        escrowAccount: escrowPDA,
        orchestrator: orchestrator.publicKey,
        workerAgent: workerKeypair.publicKey,
        treasury: treasuryKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods.acceptJob()
      .accounts({ escrowAccount: escrowPDA, worker: workerKeypair.publicKey })
      .signers([workerKeypair]).rpc();

    await program.methods.submitResult("QmBadResult123")
      .accounts({ escrowAccount: escrowPDA, worker: workerKeypair.publicKey })
      .signers([workerKeypair]).rpc();

    // Raise dispute
    await program.methods
      .raiseDispute("Hasil tidak sesuai spesifikasi yang diminta")
      .accounts({
        escrowAccount: escrowPDA,
        workerAgent: workerKeypair.publicKey,
        treasury: treasuryKeypair.publicKey,
        orchestrator: orchestrator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    let escrow = await program.account.escrowAccount.fetch(escrowPDA);
    assert.equal(escrow.status.disputed !== undefined, true, "Status harus Disputed");
    console.log("  Dispute raised:", escrow.disputeReason);

    // Admin resolve: refund ke orchestrator
    await program.methods
      .resolveDispute({ refundOrchestrator: {} })
      .accounts({
        escrowAccount: escrowPDA,
        workerAgent: workerKeypair.publicKey,
        orchestrator: orchestrator.publicKey,
        treasury: treasuryKeypair.publicKey,
        admin: adminKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();

    escrow = await program.account.escrowAccount.fetch(escrowPDA);
    assert.equal(escrow.status.refunded !== undefined, true, "Status harus Refunded setelah resolve");
    console.log("  Dispute resolved: refund ke orchestrator");
  });

  // ---------------------------------------------------------------------------
  // VALIDASI ERROR: status transition yang tidak valid
  // ---------------------------------------------------------------------------

  it("Error: tidak bisa approve escrow yang masih Funded (belum InProgress)", async () => {
    const jobId = "job-invalid-001";
    const escrowPDA = getEscrowPDA(orchestrator.publicKey, jobId);

    await program.methods
      .createEscrow(jobId, new BN(0.05 * LAMPORTS_PER_SOL), "Test invalid transition", null)
      .accounts({
        escrowAccount: escrowPDA,
        orchestrator: orchestrator.publicKey,
        workerAgent: workerKeypair.publicKey,
        treasury: treasuryKeypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    try {
      await program.methods
        .approveAndRelease()
        .accounts({
          escrowAccount: escrowPDA,
          workerAgent: workerKeypair.publicKey,
          treasury: treasuryKeypair.publicKey,
          orchestrator: orchestrator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Seharusnya error");
    } catch (err: any) {
      assert.include(err.message, "InvalidStatusTransition");
      console.log("  Error berhasil ditangkap:", err.message);
    }
  });
});
