import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AgentRegistry } from "../target/types/agent_registry";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("AgentPay — Agent Registry", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AgentRegistry as Program<AgentRegistry>;
  const owner = provider.wallet as anchor.Wallet;

  // Helper: derive PDA address untuk sebuah agent
  const getAgentPDA = async (ownerPubkey: PublicKey, agentName: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("agent"),
        ownerPubkey.toBuffer(),
        Buffer.from(agentName),
      ],
      program.programId
    );
    return pda;
  };

  // -------------------------------------------------------------------------
  // TEST 1: Register agent baru
  // -------------------------------------------------------------------------
  it("Berhasil mendaftarkan agent baru", async () => {
    const agentName = "ResearchBot-01";
    const agentPDA = await getAgentPDA(owner.publicKey, agentName);

    await program.methods
      .registerAgent(
        agentName,
        "Agent spesialis riset dan analisis data",
        ["research", "analysis", "summarize"],
        new anchor.BN(10_000_000), // 0.01 SOL per job
        "https://api.myagent.com/v1/run"
      )
      .accounts({
        agentAccount: agentPDA,
        owner: owner.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    // Fetch data dari on-chain dan verifikasi
    const agentData = await program.account.agentAccount.fetch(agentPDA);

    assert.equal(agentData.name, agentName);
    assert.equal(agentData.isActive, true);
    assert.equal(agentData.jobsCompleted.toNumber(), 0);
    assert.deepEqual(agentData.skills, ["research", "analysis", "summarize"]);
    assert.equal(agentData.pricePerJob.toNumber(), 10_000_000);

    console.log("  Agent terdaftar di PDA:", agentPDA.toBase58());
    console.log("  Harga per job:", agentData.pricePerJob.toNumber(), "lamports");
  });

  // -------------------------------------------------------------------------
  // TEST 2: Update agent
  // -------------------------------------------------------------------------
  it("Berhasil mengupdate deskripsi dan harga agent", async () => {
    const agentName = "ResearchBot-01";
    const agentPDA = await getAgentPDA(owner.publicKey, agentName);

    await program.methods
      .updateAgent(
        "Agent riset yang ditingkatkan dengan kemampuan coding",
        null,
        new anchor.BN(15_000_000), // naik harga ke 0.015 SOL
        null
      )
      .accounts({
        agentAccount: agentPDA,
        owner: owner.publicKey,
      })
      .rpc();

    const agentData = await program.account.agentAccount.fetch(agentPDA);
    assert.equal(agentData.pricePerJob.toNumber(), 15_000_000);
    console.log("  Harga diupdate ke:", agentData.pricePerJob.toNumber(), "lamports");
  });

  // -------------------------------------------------------------------------
  // TEST 3: Deactivate agent
  // -------------------------------------------------------------------------
  it("Berhasil menonaktifkan agent", async () => {
    const agentName = "ResearchBot-01";
    const agentPDA = await getAgentPDA(owner.publicKey, agentName);

    await program.methods
      .deactivateAgent()
      .accounts({
        agentAccount: agentPDA,
        owner: owner.publicKey,
      })
      .rpc();

    const agentData = await program.account.agentAccount.fetch(agentPDA);
    assert.equal(agentData.isActive, false);
    console.log("  Agent status:", agentData.isActive ? "aktif" : "nonaktif");
  });

  // -------------------------------------------------------------------------
  // TEST 4: Reactivate agent
  // -------------------------------------------------------------------------
  it("Berhasil mengaktifkan kembali agent", async () => {
    const agentName = "ResearchBot-01";
    const agentPDA = await getAgentPDA(owner.publicKey, agentName);

    await program.methods
      .reactivateAgent()
      .accounts({
        agentAccount: agentPDA,
        owner: owner.publicKey,
      })
      .rpc();

    const agentData = await program.account.agentAccount.fetch(agentPDA);
    assert.equal(agentData.isActive, true);
  });

  // -------------------------------------------------------------------------
  // TEST 5: Validasi error — nama terlalu panjang
  // -------------------------------------------------------------------------
  it("Gagal mendaftar jika nama terlalu panjang (> 50 karakter)", async () => {
    const longName = "A".repeat(51);
    const agentPDA = await getAgentPDA(owner.publicKey, longName);

    try {
      await program.methods
        .registerAgent(
          longName,
          "Deskripsi test",
          ["test"],
          new anchor.BN(1_000_000),
          "https://test.com"
        )
        .accounts({
          agentAccount: agentPDA,
          owner: owner.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

      assert.fail("Seharusnya error tapi tidak");
    } catch (err: any) {
      assert.include(err.message, "NameTooLong");
      console.log("  Error validasi berhasil ditangkap:", err.message);
    }
  });

  // -------------------------------------------------------------------------
  // TEST 6: Fetch semua agent aktif
  // -------------------------------------------------------------------------
  it("Berhasil fetch semua agent yang terdaftar", async () => {
    const allAgents = await program.account.agentAccount.all();
    console.log("  Total agent terdaftar:", allAgents.length);

    const activeAgents = allAgents.filter(a => a.account.isActive);
    console.log("  Agent aktif:", activeAgents.length);

    activeAgents.forEach(a => {
      console.log(`  - ${a.account.name} | ${a.account.pricePerJob.toNumber()} lamports | skills: ${a.account.skills.join(", ")}`);
    });
  });
});
