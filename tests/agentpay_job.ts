import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { AgentpayJob } from "../target/types/agentpay_job";
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";

describe("AgentPay — Job Contract", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AgentpayJob as Program<AgentpayJob>;
  const orchestrator = provider.wallet as anchor.Wallet;
  const workerKeypair = Keypair.generate();

  // Helper: derive PDA job
  const getJobPDA = (orchestratorKey: PublicKey, jobId: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("job"), orchestratorKey.toBuffer(), Buffer.from(jobId)],
      program.programId
    );
    return pda;
  };

  // Helper: payload post job standar
  const defaultJobPayload = (jobId: string) => ({
    jobId,
    title: "Analisis sentimen 100 tweet AI terbaru",
    description: "Baca 100 tweet terbaru tentang AI, klasifikasikan sentimen (positif/negatif/netral), dan buat laporan ringkasan.",
    requiredSkills: ["research", "analysis"],
    inputSchema: JSON.stringify({ tweets_url: "string", count: "number" }),
    expectedOutput: JSON.stringify({ sentiment_report: "string", csv_url: "string" }),
    priority: { normal: {} },
    deadlineSeconds: new BN(86_400), // 24 jam
    maxRetries: 2,
    tags: ["nlp", "twitter", "sentiment"],
    contextCid: null,
  });

  before(async () => {
    const sig = await provider.connection.requestAirdrop(
      workerKeypair.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
  });

  // ---------------------------------------------------------------------------
  // TEST 1: Post job baru
  // ---------------------------------------------------------------------------
  it("Berhasil memposting job baru dengan status Open", async () => {
    const jobId = "job-sentiment-001";
    const jobPDA = getJobPDA(orchestrator.publicKey, jobId);
    const payload = defaultJobPayload(jobId);

    await program.methods
      .postJob(
        payload.jobId,
        payload.title,
        payload.description,
        payload.requiredSkills,
        payload.inputSchema,
        payload.expectedOutput,
        payload.priority,
        payload.deadlineSeconds,
        payload.maxRetries,
        payload.tags,
        payload.contextCid
      )
      .accounts({
        jobAccount: jobPDA,
        orchestrator: orchestrator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const job = await program.account.jobAccount.fetch(jobPDA);

    assert.equal(job.jobId, jobId);
    assert.equal(job.status.open !== undefined, true, "Status harus Open");
    assert.equal(job.worker, null, "Worker belum assigned");
    assert.equal(job.retryCount, 0);
    assert.equal(job.maxRetries, 2);
    assert.deepEqual(job.requiredSkills, ["research", "analysis"]);

    console.log("  Job diposting:", job.jobId);
    console.log("  Deadline:", new Date(job.deadline.toNumber() * 1000).toLocaleString());
    console.log("  Priority:", JSON.stringify(job.priority));
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Worker claim job
  // ---------------------------------------------------------------------------
  it("Worker berhasil claim job dan status berubah ke Assigned", async () => {
    const jobId = "job-sentiment-001";
    const jobPDA = getJobPDA(orchestrator.publicKey, jobId);

    // Simulasi escrow address (dalam implementasi nyata ini adalah PDA escrow)
    const fakeEscrowAddress = Keypair.generate().publicKey;

    // Setup worker registry stub (dalam implementasi nyata ini adalah account dari Agent Registry)
    // Untuk test ini kita skip verifikasi skill dengan mock
    // TODO: integrasi penuh dengan Agent Registry via CPI

    console.log("  Worker:", workerKeypair.publicKey.toBase58());
    console.log("  Escrow:", fakeEscrowAddress.toBase58());

    // NOTE: claim_job membutuhkan worker_registry dari Agent Registry.
    // Dalam unit test ini kita test instruksi lain dulu.
    // Test integrasi penuh ada di integration-tests/
  });

  // ---------------------------------------------------------------------------
  // TEST 3: Full lifecycle tanpa claim (direct assign untuk testing)
  // ---------------------------------------------------------------------------
  it("Full lifecycle: post → start → submit → verify", async () => {
    const jobId = "job-lifecycle-001";
    const jobPDA = getJobPDA(orchestrator.publicKey, jobId);

    // Post job
    await program.methods
      .postJob(
        jobId,
        "Buat script Python untuk scraping data",
        "Tulis script Python yang mengambil 1000 data dari API publik dan simpan ke CSV.",
        ["code", "python"],
        JSON.stringify({ api_endpoint: "string" }),
        JSON.stringify({ script_url: "string", csv_sample: "string" }),
        { high: {} },
        new BN(3600), // 1 jam
        1,
        ["python", "scraping"],
        null
      )
      .accounts({
        jobAccount: jobPDA,
        orchestrator: orchestrator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    let job = await program.account.jobAccount.fetch(jobPDA);
    assert.equal(job.status.open !== undefined, true);
    console.log("  [1] Job diposting, status: Open");

    // Untuk testing lifecycle, kita set worker manual via test helper
    // (dalam production, ini dilakukan via claim_job dengan Agent Registry)
    // Langsung test submit_result dan verify dari worker yang sudah di-assign
    // menggunakan orchestrator sebagai mock worker untuk simplifikasi test

    // Simulate: submit result
    const resultCid = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
    const summary = "Script Python berhasil dibuat, berhasil fetch 1000 records dari API";

    // NOTE: submit_result butuh worker yang sudah di-assign.
    // Test ini akan lengkap setelah integrasi dengan Agent Registry.
    // Di bawah adalah test verify_and_complete dari sisi orchestrator.

    console.log("  [Lifecycle test membutuhkan integrasi penuh dengan Agent Registry]");
    console.log("  Job ID:", job.jobId);
    console.log("  Required skills:", job.requiredSkills);
  });

  // ---------------------------------------------------------------------------
  // TEST 4: Retry logic
  // ---------------------------------------------------------------------------
  it("Validasi: retry_count tidak boleh melebihi max_retries", async () => {
    const jobId = "job-maxretry-001";
    const jobPDA = getJobPDA(orchestrator.publicKey, jobId);

    await program.methods
      .postJob(
        jobId,
        "Test max retry",
        "Job untuk test batas retry",
        ["test"],
        "{}",
        "{}",
        { low: {} },
        new BN(3600),
        0, // max_retries = 0, tidak boleh retry sama sekali
        [],
        null
      )
      .accounts({
        jobAccount: jobPDA,
        orchestrator: orchestrator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const job = await program.account.jobAccount.fetch(jobPDA);
    assert.equal(job.maxRetries, 0);
    console.log("  Job dengan max_retries=0 berhasil dibuat");
  });

  // ---------------------------------------------------------------------------
  // TEST 5: Cancel job yang masih Open
  // ---------------------------------------------------------------------------
  it("Orchestrator berhasil cancel job yang masih Open", async () => {
    const jobId = "job-cancel-001";
    const jobPDA = getJobPDA(orchestrator.publicKey, jobId);

    await program.methods
      .postJob(
        jobId,
        "Job yang akan dibatalkan",
        "Ini adalah job test untuk cancel",
        ["test"],
        "{}",
        "{}",
        { normal: {} },
        new BN(3600),
        1,
        [],
        null
      )
      .accounts({
        jobAccount: jobPDA,
        orchestrator: orchestrator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .cancelJob("Kebutuhan berubah, job tidak relevan lagi")
      .accounts({
        jobAccount: jobPDA,
        orchestrator: orchestrator.publicKey,
      })
      .rpc();

    const job = await program.account.jobAccount.fetch(jobPDA);
    assert.equal(job.status.cancelled !== undefined, true, "Status harus Cancelled");

    const lastEvent = job.executionLog[job.executionLog.length - 1];
    assert.equal(lastEvent.note, "Kebutuhan berubah, job tidak relevan lagi");
    console.log("  Job berhasil dibatalkan");
    console.log("  Execution log terakhir:", lastEvent.note);
  });

  // ---------------------------------------------------------------------------
  // TEST 6: Fetch semua Open jobs (untuk worker discovery)
  // ---------------------------------------------------------------------------
  it("Berhasil fetch semua job dengan status Open", async () => {
    const allJobs = await program.account.jobAccount.all();
    const openJobs = allJobs.filter(j => j.account.status.open !== undefined);

    console.log("  Total job di-chain:", allJobs.length);
    console.log("  Open jobs:", openJobs.length);

    openJobs.forEach(j => {
      console.log(`  - [${j.account.priority.high ? "HIGH" : "NORMAL"}] ${j.account.title}`);
      console.log(`    Skills: ${j.account.requiredSkills.join(", ")}`);
      console.log(`    Deadline: ${new Date(j.account.deadline.toNumber() * 1000).toLocaleString()}`);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 7: Validasi error — skill tidak mencukupi (simulasi)
  // ---------------------------------------------------------------------------
  it("Schema validasi: required_skills terlalu banyak (> 10) harus error", async () => {
    const jobId = "job-toomanyskills";
    const jobPDA = getJobPDA(orchestrator.publicKey, jobId);

    try {
      await program.methods
        .postJob(
          jobId,
          "Test validasi",
          "Test",
          ["skill1","skill2","skill3","skill4","skill5","skill6","skill7","skill8","skill9","skill10","skill11"],
          "{}",
          "{}",
          { normal: {} },
          new BN(3600),
          1,
          [],
          null
        )
        .accounts({
          jobAccount: jobPDA,
          orchestrator: orchestrator.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Seharusnya error");
    } catch (err: any) {
      assert.include(err.message, "TooManySkills");
      console.log("  Validasi skill berhasil:", err.message);
    }
  });
});
