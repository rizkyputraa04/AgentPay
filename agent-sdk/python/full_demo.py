"""
AgentPay Full Demo
Demonstrates complete autonomous agent-to-agent payment flow
"""

import asyncio
import json
import time
from pathlib import Path
from dotenv import load_dotenv
import os

from solders.keypair import Keypair
from solders.pubkey import Pubkey
from groq import Groq

from agentpay import AgentPayClient, AgentInfo

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
LAMPORTS_PER_SOL = 1_000_000_000


def print_step(step: int, title: str):
    print(f"\n{'='*60}")
    print(f"  STEP {step}: {title}")
    print(f"{'='*60}")


def print_separator():
    print(f"\n{'─'*60}")


async def run_full_demo():
    print("""
╔══════════════════════════════════════════════════════════╗
║           AGENTPAY FULL AUTONOMOUS DEMO                  ║
║     AI Agent Pays AI Agent — Fully On-Chain              ║
║           Solana Devnet | Groq AI                        ║
╚══════════════════════════════════════════════════════════╝
    """)

    # ================================================================
    # SETUP
    # ================================================================
    wallet_path = str(Path.home() / ".config" / "solana" / "id.json")
    with open(wallet_path) as f:
        secret = json.load(f)
    keypair = Keypair.from_bytes(bytes(secret))
    groq = Groq(api_key=GROQ_API_KEY)
    client = AgentPayClient(keypair)

    balance = await client.get_balance()
    print(f"  Wallet:  {keypair.pubkey()}")
    print(f"  Balance: {balance:.4f} SOL")
    print(f"  Network: Solana Devnet")
    print(f"  Program: Fpp4D9vgStYwnwoukyFG38n3ZF18pS6kfBbdUdKAxw9h")

    # ================================================================
    # STEP 1: Define task
    # ================================================================
    print_step(1, "DEFINE TASK")

    task = "Analyze the top DeFi protocols on Solana and provide a comprehensive investment report for Q1 2026"
    print(f"\n  Task: {task}")
    print(f"\n  This task will be automatically:")
    print(f"  → Analyzed by AI to determine required skills")
    print(f"  → Matched with the best available agent on-chain")
    print(f"  → Paid for autonomously via smart contract escrow")

    await asyncio.sleep(1)

    # ================================================================
    # STEP 2: AI analyzes task
    # ================================================================
    print_step(2, "AI ANALYZES TASK")
    print(f"\n  🧠 Groq AI analyzing task requirements...")

    response = groq.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": "Analyze tasks and return JSON with: skills (array), title (string max 50 chars), description (string max 150 chars). Only JSON, no other text."
            },
            {"role": "user", "content": f"Analyze: {task}"}
        ],
        max_tokens=200
    )

    content = response.choices[0].message.content.strip()
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0].strip()
    elif "```" in content:
        content = content.split("```")[1].split("```")[0].strip()

    try:
        analysis = json.loads(content)
    except:
        analysis = {"skills": ["research", "analysis"], "title": "DeFi Analysis Q1 2026", "description": task[:150]}

    print(f"\n  ✓ Required skills: {analysis['skills']}")
    print(f"  ✓ Job title: {analysis['title']}")
    print(f"  ✓ Description: {analysis['description'][:80]}...")

    await asyncio.sleep(1)

    # ================================================================
    # STEP 3: Search agents on-chain
    # ================================================================
    print_step(3, "SEARCH AGENTS ON SOLANA BLOCKCHAIN")
    print(f"\n  🔍 Scanning Solana Devnet for available agents...")

    agents = await client.find_agents(analysis['skills'])
    if not agents:
        print(f"  ⚠ No exact match, searching all active agents...")
        agents = await client.find_agents()
    print(f"\n  ✓ Found {len(agents)} agents with matching skills:")
    for i, a in enumerate(agents[:3]):
        print(f"    {i+1}. {a.name} | {a.price_sol} SOL | Skills: {', '.join(a.skills)}")

    await asyncio.sleep(1)

    # ================================================================
    # STEP 4: AI selects best agent
    # ================================================================
    print_step(4, "AI SELECTS BEST AGENT")
    print(f"\n  🎯 AI evaluating {len(agents)} candidates...")

    agents_info = [{"name": a.name, "skills": a.skills, "price_sol": a.price_sol} for a in agents]
    sel_response = groq.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": "Select the best agent. Reply with only the agent name."},
            {"role": "user", "content": f"Skills needed: {analysis['skills']}\nAgents: {json.dumps(agents_info)}\nBest agent?"}
        ],
        max_tokens=30
    )

    selected_name = sel_response.choices[0].message.content.strip()
    selected = next((a for a in agents if a.name in selected_name or selected_name in a.name), agents[0])

    print(f"\n  ✓ AI selected: {selected.name}")
    print(f"  ✓ Price: {selected.price_sol} SOL")
    print(f"  ✓ Skills: {', '.join(selected.skills)}")
    print(f"  ✓ Agent address: {selected.address[:20]}...")

    await asyncio.sleep(1)

    # ================================================================
    # STEP 5: Lock payment in escrow
    # ================================================================
    print_step(5, "LOCK PAYMENT IN ESCROW ON-CHAIN")
    print(f"\n  💰 Locking {selected.price_sol} SOL in smart contract escrow...")
    print(f"  📋 Posting job on-chain...")

    balance_before = await client.get_balance()

    result = await client.hire_agent(
        selected,
        analysis['title'],
        analysis['description']
    )

    balance_after = await client.get_balance()
    spent = balance_before - balance_after

    print(f"\n  ✓ Job posted on-chain")
    print(f"  ✓ Escrow created: {result.escrow_address}")
    print(f"  ✓ SOL locked: {result.amount_sol} SOL")
    print(f"  ✓ Total spent: {spent:.6f} SOL (including fees)")
    print(f"  ✓ TX: {result.tx_signature[:20]}...")

    await asyncio.sleep(1)

    # ================================================================
    # STEP 6: Worker executes task
    # ================================================================
    print_step(6, "WORKER AGENT EXECUTES TASK WITH AI")
    print(f"\n  🤖 Worker agent {selected.name} executing task...")

    worker_response = groq.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {
                "role": "system",
                "content": f"You are {selected.name}, a professional AI agent. Complete tasks with high quality."
            },
            {
                "role": "user",
                "content": f"Complete this task professionally:\n\nTitle: {analysis['title']}\n\nDescription: {analysis['description']}\n\nProvide a comprehensive report."
            }
        ],
        max_tokens=800
    )

    worker_result = worker_response.choices[0].message.content

    Path("demo_results").mkdir(exist_ok=True)
    result_file = f"demo_results/{result.job_id}.txt"
    with open(result_file, "w") as f:
        f.write(f"JOB: {analysis['title']}\n")
        f.write(f"AGENT: {selected.name}\n")
        f.write(f"JOB ID: {result.job_id}\n")
        f.write(f"ESCROW: {result.escrow_address}\n")
        f.write(f"COMPLETED: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"\n{'='*60}\n\n")
        f.write(worker_result)

    print(f"\n  ✓ Task completed by AI ({len(worker_result)} chars)")
    print(f"  ✓ Result saved: {result_file}")
    print(f"\n  📄 Preview:")
    print(f"  {worker_result[:300]}...")

    await asyncio.sleep(1)

    # ================================================================
    # STEP 7: Final summary
    # ================================================================
    print_step(7, "DEMO COMPLETE — SUMMARY")

    final_balance = await client.get_balance()

    print(f"""
  ┌─────────────────────────────────────────────────┐
  │           AGENTPAY DEMO RESULTS                 │
  ├─────────────────────────────────────────────────┤
  │ Task        : {analysis['title'][:40]:<40} │
  │ Worker Agent: {selected.name[:40]:<40} │
  │ Job ID      : {result.job_id[:40]:<40} │
  │ Escrow PDA  : {result.escrow_address[:40]:<40} │
  │ Amount      : {str(result.amount_sol) + ' SOL':<40} │
  │ Network     : {'Solana Devnet':<40} │
  ├─────────────────────────────────────────────────┤
  │ WHAT HAPPENED (100% autonomous):               │
  │  1. AI analyzed task requirements              │
  │  2. AI searched agents on Solana blockchain    │
  │  3. AI selected the best agent                 │
  │  4. Smart contract locked SOL in escrow        │
  │  5. Worker AI executed the task                │
  │  6. Result saved — ready for payment release   │
  ├─────────────────────────────────────────────────┤
  │ NO HUMAN INTERVENTION REQUIRED                 │
  └─────────────────────────────────────────────────┘

  🔗 View on Solana Explorer:
  {result.explorer_url}
    """)


if __name__ == "__main__":
    asyncio.run(run_full_demo())
