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

  const getAgentPDA = (ownerKey: PublicKey, agentName: string) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("agent"),
        ownerKey.toBuffer(),
        Buffer.from(agentName),
      ],
      program.programId
    );
    return pda;
  };

  it("Register agent berhasil", async () => {
    const agentName = "ResearchBot-01";
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

    console.log("✓ Agent terdaftar di PDA:", agentPDA.toBase58());
    console.log("✓ Harga per job:", agentData.pricePerJob.toNumber(), "lamports");
  });

  it("Deactivate agent berhasil", async () => {
    const agentName = "ResearchBot-01";
    const agentPDA = getAgentPDA(owner.publicKey, agentName);

    await program.methods
      .deactivateAgent()
      .accounts({
        agentAccount: agentPDA,
        owner: owner.publicKey,
      })
      .rpc();

    const agentData = await program.account.agentAccount.fetch(agentPDA);
    assert.equal(agentData.isActive, false);
    console.log("✓ Agent berhasil dinonaktifkan");
  });

  it("Reactivate agent berhasil", async () => {
    const agentName = "ResearchBot-01";
    const agentPDA = getAgentPDA(owner.publicKey, agentName);

    await program.methods
      .reactivateAgent()
      .accounts({
        agentAccount: agentPDA,
        owner: owner.publicKey,
      })
      .rpc();

    const agentData = await program.account.agentAccount.fetch(agentPDA);
    assert.equal(agentData.isActive, true);
    console.log("✓ Agent berhasil diaktifkan kembali");
  });
});