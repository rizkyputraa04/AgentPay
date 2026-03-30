"""
AgentPay Orchestrator Agent
AI agent yang otomatis memilih worker agent, post job, dan lock payment
"""

import asyncio
import json
import time
import httpx
import struct
import base64
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv
import os

from solders.keypair import Keypair
from solders.pubkey import Pubkey
from groq import Groq

from agentpay import AgentPayClient, AgentInfo

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")


class OrchestratorAgent:
    """
    AI Orchestrator Agent yang:
    1. Menerima task dari user/sistem
    2. Menggunakan AI untuk breakdown task
    3. Mencari worker agent yang tepat di blockchain
    4. Otomatis hire worker dan lock payment
    5. Monitor hasil dan approve payment
    """

    def __init__(self, keypair: Keypair, name: str = "Orchestrator-1"):
        self.keypair = keypair
        self.name = name
        self.groq = Groq(api_key=GROQ_API_KEY)
        self.client = AgentPayClient(keypair)

    @classmethod
    def from_file(cls, name: str = "Orchestrator-1", path: Optional[str] = None):
        wallet_path = path or str(Path.home() / ".config" / "solana" / "id.json")
        with open(wallet_path) as f:
            secret = json.load(f)
        keypair = Keypair.from_bytes(bytes(secret))
        return cls(keypair, name)

    @property
    def public_key(self) -> Pubkey:
        return self.keypair.pubkey()

    def _analyze_task(self, task: str) -> dict:
        """Gunakan AI untuk menganalisis task dan menentukan skill yang dibutuhkan"""
        print(f"  🧠 Analyzing task with AI...")

        response = self.groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": """You are an AI orchestrator that analyzes tasks and determines what skills are needed.
Respond with a JSON object containing:
- skills: array of skills needed (e.g. ["research", "analysis"])
- title: short job title (max 50 chars)
- description: clear job description (max 150 chars)
- priority: "high", "medium", or "low"
Only respond with valid JSON, no other text."""
                },
                {
                    "role": "user",
                    "content": f"Analyze this task and return JSON: {task}"
                }
            ],
            max_tokens=300
        )

        try:
            content = response.choices[0].message.content.strip()
            # Clean up response jika ada markdown
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            return json.loads(content)
        except Exception:
            # Fallback jika AI response tidak valid JSON
            return {
                "skills": ["research", "analysis"],
                "title": task[:50],
                "description": task[:150],
                "priority": "medium"
            }

    def _select_best_agent(self, agents: list, required_skills: list) -> Optional[AgentInfo]:
        """Gunakan AI untuk memilih agent terbaik"""
        if not agents:
            return None

        print(f"  🎯 Selecting best agent from {len(agents)} candidates...")

        agents_info = [
            {
                "name": a.name,
                "skills": a.skills,
                "price_sol": a.price_sol,
                "jobs_completed": a.jobs_completed,
                "address": a.address
            }
            for a in agents
        ]

        response = self.groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": """You are selecting the best AI agent for a job.
Consider: skill match, price, and experience.
Respond with only the agent's name, nothing else."""
                },
                {
                    "role": "user",
                    "content": f"""Required skills: {required_skills}
Available agents: {json.dumps(agents_info)}
Which agent is best? Reply with just the agent name."""
                }
            ],
            max_tokens=50
        )

        selected_name = response.choices[0].message.content.strip()
        for agent in agents:
            if agent.name in selected_name or selected_name in agent.name:
                return agent

        return agents[0]  # fallback ke agent pertama

    async def execute_task(self, task: str) -> dict:
        """
        Eksekusi task secara fully autonomous:
        1. Analisis task
        2. Cari agent yang tepat
        3. Hire agent dan lock payment
        """
        print(f"\n{'='*60}")
        print(f"🎭 Orchestrator: {self.name}")
        print(f"📝 Task: {task}")
        print(f"{'='*60}\n")

        # Step 1: Analisis task dengan AI
        print("Step 1: Analyzing task...")
        task_analysis = self._analyze_task(task)
        print(f"  ✓ Skills needed: {task_analysis['skills']}")
        print(f"  ✓ Job title: {task_analysis['title']}")
        print(f"  ✓ Priority: {task_analysis['priority']}")

        # Step 2: Cari agent yang tersedia di blockchain
        print("\nStep 2: Searching for agents on-chain...")
        agents = await self.client.find_agents(task_analysis['skills'])
        print(f"  ✓ Found {len(agents)} matching agents on Devnet")

        if not agents:
            print("  ✗ No agents found with required skills")
            return {"success": False, "reason": "No agents available"}

        # Step 3: Pilih agent terbaik menggunakan AI
        print("\nStep 3: Selecting best agent with AI...")
        selected = self._select_best_agent(agents, task_analysis['skills'])
        print(f"  ✓ Selected: {selected.name}")
        print(f"  ✓ Price: {selected.price_sol} SOL")
        print(f"  ✓ Owner: {selected.owner[:8]}...")

        # Step 4: Hire agent dan lock payment on-chain
        print("\nStep 4: Hiring agent and locking payment on-chain...")
        result = await self.client.hire_agent(
            selected,
            task_analysis['title'],
            task_analysis['description']
        )

        print(f"\n{'='*60}")
        print(f"✅ AUTONOMOUS EXECUTION COMPLETE!")
        print(f"{'='*60}")
        print(f"  Task:    {task[:60]}...")
        print(f"  Agent:   {selected.name}")
        print(f"  Job ID:  {result.job_id}")
        print(f"  Escrow:  {result.escrow_address}")
        print(f"  Locked:  {result.amount_sol} SOL")
        print(f"  TX:      {result.tx_signature[:20]}...")
        print(f"  Explorer: {result.explorer_url}")

        return {
            "success": True,
            "task": task,
            "agent": selected.name,
            "job_id": result.job_id,
            "escrow": result.escrow_address,
            "amount_locked": result.amount_sol,
            "tx": result.tx_signature,
            "explorer": result.explorer_url
        }


async def main():
    print("=== AgentPay Orchestrator Agent ===")
    print("Fully autonomous AI agent that hires other agents\n")

    orchestrator = OrchestratorAgent.from_file(name="OrchestratorBot-1")

    balance = await orchestrator.client.get_balance()
    print(f"Wallet: {orchestrator.public_key}")
    print(f"Balance: {balance:.4f} SOL\n")

    # Task yang akan dikerjakan secara autonomous
    task = "Research and analyze the top 5 DeFi protocols by TVL in Q1 2026 and provide investment insights"

    result = await orchestrator.execute_task(task)

    if result["success"]:
        print(f"\n🎉 Mission accomplished!")
        print(f"   The orchestrator autonomously hired an AI agent")
        print(f"   and locked {result['amount_locked']} SOL in escrow")
        print(f"   All on Solana blockchain without human intervention!")
    else:
        print(f"\n❌ Mission failed: {result.get('reason')}")


if __name__ == "__main__":
    asyncio.run(main())
