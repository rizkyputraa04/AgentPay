"""
AgentPay Python SDK
Enables AI agents to interact with AgentPay protocol on Solana
"""

import json
import time
import struct
import asyncio
import httpx
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

from solders.keypair import Keypair
from solders.pubkey import Pubkey


PROGRAM_ID = Pubkey.from_string("Fpp4D9vgStYwnwoukyFG38n3ZF18pS6kfBbdUdKAxw9h")
DEVNET_URL = "https://api.devnet.solana.com"
LAMPORTS_PER_SOL = 1_000_000_000


@dataclass
class AgentInfo:
    address: str
    owner: str
    name: str
    description: str
    skills: list
    price_per_job: int
    endpoint_url: str
    is_active: bool
    jobs_completed: int

    @property
    def price_sol(self) -> float:
        return self.price_per_job / LAMPORTS_PER_SOL


@dataclass
class HireResult:
    job_id: str
    job_address: str
    escrow_address: str
    tx_signature: str
    explorer_url: str
    amount_locked: int

    @property
    def amount_sol(self) -> float:
        return self.amount_locked / LAMPORTS_PER_SOL


class AgentPayClient:
    def __init__(self, keypair: Keypair, rpc_url: str = DEVNET_URL):
        self.keypair = keypair
        self.rpc_url = rpc_url

    @classmethod
    def from_file(cls, path: Optional[str] = None) -> "AgentPayClient":
        from pathlib import Path as P
        import os
        wallet_path = path or str(P.home() / ".config" / "solana" / "id.json")
        with open(wallet_path) as f:
            secret = json.load(f)
        keypair = Keypair.from_bytes(bytes(secret))
        return cls(keypair)

    @property
    def public_key(self) -> Pubkey:
        return self.keypair.pubkey()

    def get_agent_pda(self, owner: Pubkey, name: str) -> Pubkey:
        pda, _ = Pubkey.find_program_address(
            [b"agent", bytes(owner), name.encode()],
            PROGRAM_ID
        )
        return pda

    def get_job_pda(self, owner: Pubkey, job_id: str) -> Pubkey:
        pda, _ = Pubkey.find_program_address(
            [b"job", bytes(owner), job_id.encode()],
            PROGRAM_ID
        )
        return pda

    def get_escrow_pda(self, owner: Pubkey, job_id: str) -> Pubkey:
        pda, _ = Pubkey.find_program_address(
            [b"escrow", bytes(owner), job_id.encode()],
            PROGRAM_ID
        )
        return pda

    async def _rpc(self, method: str, params: list) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                self.rpc_url,
                json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
                timeout=30
            )
            return resp.json()

    async def get_balance(self) -> float:
        result = await self._rpc("getBalance", [str(self.public_key)])
        return result["result"]["value"] / LAMPORTS_PER_SOL

    def _parse_agent_account(self, pubkey_str: str, data: bytes) -> Optional[AgentInfo]:
        try:
            offset = 8
            owner = Pubkey.from_bytes(data[offset:offset+32]); offset += 32
            name_len = struct.unpack_from("<I", data, offset)[0]; offset += 4
            name = data[offset:offset+name_len].decode(); offset += name_len
            desc_len = struct.unpack_from("<I", data, offset)[0]; offset += 4
            description = data[offset:offset+desc_len].decode(); offset += desc_len
            skills_count = struct.unpack_from("<I", data, offset)[0]; offset += 4
            skills = []
            for _ in range(skills_count):
                s_len = struct.unpack_from("<I", data, offset)[0]; offset += 4
                skills.append(data[offset:offset+s_len].decode()); offset += s_len
            price_per_job = struct.unpack_from("<Q", data, offset)[0]; offset += 8
            url_len = struct.unpack_from("<I", data, offset)[0]; offset += 4
            endpoint_url = data[offset:offset+url_len].decode(); offset += url_len
            is_active = data[offset] == 1

            return AgentInfo(
                address=pubkey_str,
                owner=str(owner),
                name=name,
                description=description,
                skills=skills,
                price_per_job=price_per_job,
                endpoint_url=endpoint_url,
                is_active=is_active,
                jobs_completed=0
            )
        except Exception as e:
            return None

    async def find_agents(self, skills: Optional[list] = None) -> list:
        result = await self._rpc("getProgramAccounts", [
            str(PROGRAM_ID),
            {
                "encoding": "base64",
                "filters": [{"dataSize": 672}]
            }
        ])

        agents = []
        import base64
        for acc in result.get("result", []):
            pubkey_str = acc["pubkey"]
            data_b64 = acc["account"]["data"][0]
            data = base64.b64decode(data_b64)
            agent = self._parse_agent_account(pubkey_str, data)
            if agent and agent.is_active:
                if skills:
                    has_skill = any(
                        s.lower() in [sk.lower() for sk in agent.skills]
                        for s in skills
                    )
                    if not has_skill:
                        continue
                agents.append(agent)
        return agents

    async def hire_agent(self, agent: AgentInfo, job_title: str, job_description: str) -> HireResult:
        job_id = f"hire-{int(time.time() * 1000)}"

        idl_path = Path(__file__).parent / "agentpay_idl_v1.json"
        with open(idl_path) as f:
            raw_idl = json.load(f)

        from solana.rpc.async_api import AsyncClient
        from anchorpy import Provider, Wallet, Program, Idl, Context
        from solders.system_program import ID as SYS_PROGRAM_ID

        async with AsyncClient(self.rpc_url) as client:
            wallet = Wallet(self.keypair)
            provider = Provider(client, wallet)
            idl = Idl.from_json(json.dumps(raw_idl))
            program = Program(idl, PROGRAM_ID, provider)

            job_pda = self.get_job_pda(self.public_key, job_id)
            escrow_pda = self.get_escrow_pda(self.public_key, job_id)
            worker_pubkey = Pubkey.from_string(agent.owner)

            await program.rpc["post_job"](
                job_id, job_title, job_description,
                agent.skills, "See description", 86400,
                ctx=Context(accounts={
                    "job_account": job_pda,
                    "orchestrator": self.public_key,
                    "system_program": SYS_PROGRAM_ID,
                })
            )

            tx = await program.rpc["create_escrow"](
                job_id, agent.price_per_job, job_description,
                ctx=Context(accounts={
                    "escrow_account": escrow_pda,
                    "orchestrator": self.public_key,
                    "worker": worker_pubkey,
                    "system_program": SYS_PROGRAM_ID,
                })
            )

            result = HireResult(
                job_id=job_id,
                job_address=str(job_pda),
                escrow_address=str(escrow_pda),
                tx_signature=str(tx),
                explorer_url=f"https://explorer.solana.com/tx/{tx}?cluster=devnet",
                amount_locked=agent.price_per_job
            )

            print(f"✓ Agent '{agent.name}' hired")
            print(f"  Job ID:  {job_id}")
            print(f"  Escrow:  {escrow_pda}")
            print(f"  Amount:  {agent.price_sol} SOL")
            print(f"  TX:      {tx}")
            return result
