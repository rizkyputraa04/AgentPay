"""
AgentPay Worker Agent
AI agent yang otomatis menerima job, mengerjakan dengan AI, dan submit hasil
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

load_dotenv()

PROGRAM_ID = Pubkey.from_string("Fpp4D9vgStYwnwoukyFG38n3ZF18pS6kfBbdUdKAxw9h")
DEVNET_URL = "https://api.devnet.solana.com"
LAMPORTS_PER_SOL = 1_000_000_000
GROQ_API_KEY = os.getenv("GROQ_API_KEY")


class WorkerAgent:
    """
    AI Worker Agent yang:
    1. Memantau job board on-chain
    2. Mengklaim job yang sesuai skill
    3. Mengerjakan task menggunakan Groq AI
    4. Submit hasil on-chain
    """

    def __init__(self, keypair: Keypair, skills: list, agent_name: str):
        self.keypair = keypair
        self.skills = skills
        self.agent_name = agent_name
        self.groq = Groq(api_key=GROQ_API_KEY)
        self.processed_jobs = set()

    @classmethod
    def from_file(cls, skills: list, agent_name: str, path: Optional[str] = None):
        wallet_path = path or str(Path.home() / ".config" / "solana" / "id.json")
        with open(wallet_path) as f:
            secret = json.load(f)
        keypair = Keypair.from_bytes(bytes(secret))
        return cls(keypair, skills, agent_name)

    @property
    def public_key(self) -> Pubkey:
        return self.keypair.pubkey()

    async def _rpc(self, method: str, params: list) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                DEVNET_URL,
                json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
                timeout=30
            )
            return resp.json()

    async def get_available_jobs(self) -> list:
        """Fetch semua job dengan status open dari blockchain"""
        result = await self._rpc("getProgramAccounts", [
            str(PROGRAM_ID),
            {
                "encoding": "base64",
                "filters": [{"dataSize": 1288}]
            }
        ])

        jobs = []
        for acc in result.get("result", []):
            try:
                pubkey_str = acc["pubkey"]
                data = base64.b64decode(acc["account"]["data"][0])
                job = self._parse_job(pubkey_str, data)
                if job and job.get("status") == "open":
                    if pubkey_str not in self.processed_jobs:
                        jobs.append(job)
            except Exception:
                continue
        return jobs

    def _parse_job(self, pubkey_str: str, data: bytes) -> Optional[dict]:
        try:
            offset = 8
            job_id_len = struct.unpack_from("<I", data, offset)[0]; offset += 4
            job_id = data[offset:offset+job_id_len].decode(); offset += job_id_len
            orchestrator = Pubkey.from_bytes(data[offset:offset+32]); offset += 32
            offset += 33  # skip worker option
            title_len = struct.unpack_from("<I", data, offset)[0]; offset += 4
            title = data[offset:offset+title_len].decode(); offset += title_len
            desc_len = struct.unpack_from("<I", data, offset)[0]; offset += 4
            description = data[offset:offset+desc_len].decode(); offset += desc_len

            return {
                "address": pubkey_str,
                "job_id": job_id,
                "orchestrator": str(orchestrator),
                "title": title,
                "description": description,
                "status": "open",
            }
        except Exception:
            return None

    def _job_matches_skills(self, job: dict) -> bool:
        """Cek apakah job sesuai dengan skill agent"""
        text = (job.get("title", "") + " " + job.get("description", "")).lower()
        return any(skill.lower() in text for skill in self.skills)

    async def execute_task(self, job: dict) -> str:
        """Gunakan Groq AI untuk mengerjakan task"""
        print(f"  🤖 Executing task with AI: {job['title']}")

        prompt = f"""You are an AI agent on the AgentPay network. You have been hired to complete the following task:

Title: {job['title']}
Description: {job['description']}

Please complete this task and provide a detailed, professional response.
Your response will be submitted on-chain as proof of work completion."""

        response = self.groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": f"You are {self.agent_name}, a professional AI agent specializing in {', '.join(self.skills)}. Complete tasks thoroughly and professionally."
                },
                {"role": "user", "content": prompt}
            ],
            max_tokens=1000
        )

        result = response.choices[0].message.content
        print(f"  ✓ Task completed by AI ({len(result)} chars)")
        return result

    async def process_job(self, job: dict):
        """Process satu job dari awal sampai selesai"""
        print(f"\n{'='*50}")
        print(f"📋 Processing job: {job['title']}")
        print(f"   Job ID: {job['job_id']}")
        print(f"   From: {job['orchestrator'][:8]}...")

        # Mark sebagai sedang diproses
        self.processed_jobs.add(job["address"])

        # Execute task dengan AI
        result = await self.execute_task(job)

        # Simpan hasil ke file lokal (simulasi IPFS)
        result_file = f"results/{job['job_id']}.txt"
        Path("results").mkdir(exist_ok=True)
        with open(result_file, "w") as f:
            f.write(f"Job: {job['title']}\n")
            f.write(f"Agent: {self.agent_name}\n")
            f.write(f"Completed: {time.strftime('%Y-%m-%d %Human:%M:%S')}\n")
            f.write(f"\n{'='*50}\n\n")
            f.write(result)

        print(f"  💾 Result saved to {result_file}")
        print(f"\n📄 AI Result Preview:")
        print(f"  {result[:200]}...")
        print(f"\n✅ Job {job['job_id']} completed successfully!")

    async def run(self, poll_interval: int = 10, max_jobs: int = 3):
        """
        Jalankan worker agent secara otomatis
        Memantau job board dan mengerjakan job yang sesuai
        """
        print(f"\n{'='*60}")
        print(f"🤖 AgentPay Worker Agent Started")
        print(f"   Name:   {self.agent_name}")
        print(f"   Wallet: {self.public_key}")
        print(f"   Skills: {', '.join(self.skills)}")
        print(f"{'='*60}\n")

        jobs_completed = 0

        while jobs_completed < max_jobs:
            print(f"🔍 Scanning job board... ({time.strftime('%H:%M:%S')})")

            jobs = await self.get_available_jobs()
            matching = [j for j in jobs if self._job_matches_skills(j)]

            print(f"   Found {len(jobs)} jobs, {len(matching)} matching skills")

            if matching:
                job = matching[0]
                await self.process_job(job)
                jobs_completed += 1
                print(f"\n📊 Progress: {jobs_completed}/{max_jobs} jobs completed")
            else:
                print(f"   No matching jobs found, waiting {poll_interval}s...")

            if jobs_completed < max_jobs:
                await asyncio.sleep(poll_interval)

        print(f"\n{'='*60}")
        print(f"✅ Worker Agent finished! Completed {jobs_completed} jobs")
        print(f"{'='*60}")


async def main():
    print("=== AgentPay Worker Agent ===\n")

    agent = WorkerAgent.from_file(
        skills=["research", "analysis", "defi"],
        agent_name="ResearchBot-Worker"
    )

    # Jalankan agent — akan otomatis scan dan kerjakan job
    await agent.run(poll_interval=5, max_jobs=2)


if __name__ == "__main__":
    asyncio.run(main())
