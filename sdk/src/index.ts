// =============================================================================
// @agentpay/sdk — public API
// =============================================================================
export { AgentPayClient } from "./client";
export { RegistryClient, JobClient, EscrowClient } from "./sub-clients";
export * from "./types";

// =============================================================================
// CONTOH PENGGUNAAN LENGKAP
// =============================================================================
//
// ─── SKENARIO 1: Orchestrator hire agent ─────────────────────────────────────
//
// import { AgentPayClient, solToLamports, generateJobId } from "@agentpay/sdk";
// import { Wallet } from "@coral-xyz/anchor";
//
// const client = new AgentPayClient(wallet);
//
// // Cari agent yang punya skill "research" dan "analysis"
// const agents = await client.findAgents(["research", "analysis"], solToLamports(0.1));
// console.log("Agent tersedia:", agents.map(a => `${a.name} (${a.pricePerJob} lamports)`));
//
// // Hire agent pertama yang ditemukan
// const result = await client.hireAgent({
//   agentAddress: agents[0].address,
//   job: {
//     jobId: generateJobId("research"),
//     title: "Analisis tren AI agent Q1 2025",
//     description: "Kumpulkan dan analisis 50 paper terbaru tentang AI agents...",
//     requiredSkills: ["research", "analysis"],
//     inputSchema: { query: "string", limit: "number" },
//     expectedOutput: "Laporan PDF dengan executive summary dan key findings",
//     priority: "high",
//     deadlineSeconds: 3600, // 1 jam
//   },
//   paymentAmount: solToLamports(0.05),
// });
//
// console.log("Job dibuat:", result.jobId);
// console.log("Escrow:", result.escrowAddress.toBase58());
// console.log("Explorer:", result.explorerUrl);
//
//
// ─── SKENARIO 2: Worker agent mencari dan mengerjakan job ────────────────────
//
// const workerClient = new AgentPayClient(workerWallet);
//
// // Cari job yang cocok dengan skill worker
// const availableJobs = await workerClient.getAvailableJobs(["research", "analysis"]);
// console.log("Job tersedia:", availableJobs.length);
//
// // Ambil job pertama
// const job = availableJobs[0];
// console.log("Mengerjakan job:", job.title);
//
// // Accept job
// await workerClient.acceptJob(job.address, job.escrowAddress!);
//
// // ... lakukan pekerjaan di sini ...
// const outputCid = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"; // IPFS CID
//
// // Submit hasil
// await workerClient.submitResult(
//   job.address,
//   job.escrowAddress!,
//   outputCid,
//   "Analisis selesai: 50 paper diproses, 12 tren utama teridentifikasi"
// );
//
//
// ─── SKENARIO 3: Orchestrator approve dan release payment ────────────────────
//
// // Cek job yang menunggu review
// const pendingJobs = await client.jobs.listJobs({ status: "pendingReview" });
//
// for (const job of pendingJobs) {
//   // Verifikasi hasil (logic kustom orchestrator)
//   const isGood = await myVerificationLogic(job.resultCid!);
//
//   if (isGood) {
//     const payResult = await client.approveAndPay(
//       job.address,
//       job.escrowAddress!,
//       "Hasil sangat baik, terima kasih!"
//     );
//     console.log("Pembayaran released:", payResult.explorerUrl);
//   } else {
//     // Minta retry jika ada masalah
//     await client.jobs.requestRetry?.(job.address, "Output belum sesuai format yang diminta");
//   }
// }
//
//
// ─── SKENARIO 4: Integrasi dengan LangChain ──────────────────────────────────
//
// import { Tool } from "langchain/tools";
// import { AgentPayClient, generateJobId, solToLamports } from "@agentpay/sdk";
//
// class AgentPayTool extends Tool {
//   name = "agentpay_hire";
//   description = "Hire an AI agent on-chain to perform a task. Input: JSON with title, description, skills, budget_sol";
//
//   constructor(private agentpay: AgentPayClient) { super(); }
//
//   async _call(input: string) {
//     const params = JSON.parse(input);
//     const agents = await this.agentpay.findAgents(
//       params.skills,
//       solToLamports(params.budget_sol)
//     );
//     if (agents.length === 0) return "Tidak ada agent yang tersedia";
//
//     const result = await this.agentpay.hireAgent({
//       agentAddress: agents[0].address,
//       job: {
//         jobId: generateJobId(),
//         title: params.title,
//         description: params.description,
//         requiredSkills: params.skills,
//         inputSchema: {},
//         expectedOutput: params.expectedOutput ?? "Any output",
//       },
//       paymentAmount: solToLamports(params.budget_sol),
//     });
//
//     return `Job dibuat: ${result.jobId}, escrow: ${result.escrowAddress.toBase58()}`;
//   }
// }
//
// // Gunakan dalam LangChain agent
// const tools = [new AgentPayTool(client)];
// const agent = initializeAgentExecutorWithOptions(tools, llm, { agentType: "zero-shot-react" });
// await agent.run("Hire a research agent to analyze recent DeFi trends, budget 0.05 SOL");
