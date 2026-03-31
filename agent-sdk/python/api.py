"""
AgentPay Backend API
FastAPI server yang menghubungkan web app dengan Solana dan Groq AI
"""

import asyncio
import json
import time
from pathlib import Path
from typing import Optional, List
from dotenv import load_dotenv
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from solders.keypair import Keypair
from groq import Groq

from agentpay import AgentPayClient

load_dotenv()

app = FastAPI(title="AgentPay API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load wallet dan client
wallet_path = str(Path.home() / ".config" / "solana" / "id.json")
with open(wallet_path) as f:
    secret = json.load(f)
keypair = Keypair.from_bytes(bytes(secret))
client = AgentPayClient(keypair)
groq = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Activity log in-memory
activity_log = []

def add_activity(event_type: str, message: str, data: dict = {}):
    activity_log.append({
        "id": len(activity_log) + 1,
        "type": event_type,
        "message": message,
        "data": data,
        "timestamp": time.strftime("%H:%M:%S"),
        "time": int(time.time())
    })
    if len(activity_log) > 100:
        activity_log.pop(0)


class TaskRequest(BaseModel):
    task: str


# ================================================================
# REST ENDPOINTS
# ================================================================

@app.get("/")
async def root():
    return {"status": "AgentPay API running", "version": "1.0.0"}

@app.get("/api/balance")
async def get_balance():
    balance = await client.get_balance()
    return {
        "wallet": str(keypair.pubkey()),
        "balance": balance,
        "network": "devnet"
    }

@app.get("/api/agents")
async def get_agents():
    agents = await client.find_agents()
    return {
        "total": len(agents),
        "agents": [
            {
                "address": a.address,
                "owner": a.owner,
                "name": a.name,
                "description": a.description,
                "skills": a.skills,
                "pricePerJob": a.price_per_job,
                "priceSol": a.price_sol,
                "isActive": a.is_active,
                "jobsCompleted": a.jobs_completed,
            }
            for a in agents
        ]
    }

@app.get("/api/activity")
async def get_activity():
    return {"events": list(reversed(activity_log))}

@app.get("/api/stats")
async def get_stats():
    agents = await client.find_agents()
    balance = await client.get_balance()
    return {
        "totalAgents": len(agents),
        "activeAgents": len([a for a in agents if a.is_active]),
        "totalJobs": len([e for e in activity_log if e["type"] == "job_completed"]),
        "totalVolume": sum(e["data"].get("amount", 0) for e in activity_log if e["type"] == "escrow_created"),
        "walletBalance": balance,
        "network": "Solana Devnet",
        "programId": "Fpp4D9vgStYwnwoukyFG38n3ZF18pS6kfBbdUdKAxw9h"
    }


# ================================================================
# WEBSOCKET — Live Demo dengan real-time log
# ================================================================

@app.websocket("/ws/demo")
async def demo_websocket(websocket: WebSocket):
    await websocket.accept()
    
    async def send(event: str, message: str, data: dict = {}):
        payload = {
            "event": event,
            "message": message,
            "data": data,
            "timestamp": time.strftime("%H:%M:%S")
        }
        await websocket.send_json(payload)
        add_activity(event, message, data)

    try:
        # Terima task dari client
        raw = await websocket.receive_text()
        task_data = json.loads(raw)
        task = task_data.get("task", "Analyze DeFi trends on Solana Q1 2026")

        await send("started", "🚀 AgentPay Autonomous Demo Started", {"task": task})
        await asyncio.sleep(0.5)

        # STEP 1: Analyze task
        await send("analyzing", "🧠 Step 1: AI analyzing task requirements...")
        await asyncio.sleep(0.5)

        response = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "Analyze tasks and return JSON with: skills (array of simple words like 'research'), title (max 50 chars), description (max 150 chars). Only JSON."
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
            analysis = {
                "skills": ["research", "analysis"],
                "title": task[:50],
                "description": task[:150]
            }

        await send("analyzed", f"✓ Skills needed: {', '.join(analysis['skills'])}", {
            "skills": analysis["skills"],
            "title": analysis["title"]
        })
        await asyncio.sleep(0.5)

        # STEP 2: Search agents
        await send("searching", "🔍 Step 2: Searching agents on Solana blockchain...")
        await asyncio.sleep(0.5)

        agents = await client.find_agents(analysis["skills"])
        if not agents:
            agents = await client.find_agents()

        await send("agents_found", f"✓ Found {len(agents)} agents on Devnet", {
            "count": len(agents),
            "agents": [{"name": a.name, "price": a.price_sol, "skills": a.skills} for a in agents[:3]]
        })
        await asyncio.sleep(0.5)

        if not agents:
            await send("error", "✗ No agents available", {})
            return

        # STEP 3: Select best agent
        await send("selecting", "🎯 Step 3: AI selecting best agent...")
        await asyncio.sleep(0.5)

        agents_info = [{"name": a.name, "skills": a.skills, "price_sol": a.price_sol} for a in agents]
        sel_resp = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "Select best agent. Reply with only the agent name."},
                {"role": "user", "content": f"Skills: {analysis['skills']}\nAgents: {json.dumps(agents_info)}\nBest?"}
            ],
            max_tokens=30
        )

        selected_name = sel_resp.choices[0].message.content.strip()
        selected = next((a for a in agents if a.name in selected_name or selected_name in a.name), agents[0])

        await send("agent_selected", f"✓ Selected: {selected.name} ({selected.price_sol} SOL)", {
            "agent": selected.name,
            "price": selected.price_sol,
            "skills": selected.skills,
            "address": selected.address
        })
        await asyncio.sleep(0.5)

        # STEP 4: Lock escrow
        await send("locking", f"💰 Step 4: Locking {selected.price_sol} SOL in escrow on-chain...")
        await asyncio.sleep(0.5)

        result = await client.hire_agent(
            selected,
            analysis["title"],
            analysis["description"]
        )

        await send("escrow_created", f"✓ Escrow locked on-chain!", {
            "jobId": result.job_id,
            "escrow": result.escrow_address,
            "amount": result.amount_sol,
            "tx": result.tx_signature,
            "explorerUrl": result.explorer_url
        })
        await asyncio.sleep(0.5)

        # STEP 5: Worker executes
        await send("executing", f"🤖 Step 5: Worker AI executing task...")
        await asyncio.sleep(0.5)

        worker_resp = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": f"You are {selected.name}, a professional AI agent. Complete tasks with high quality and structure."},
                {"role": "user", "content": f"Complete this task:\n\nTitle: {analysis['title']}\n\nDescription: {analysis['description']}\n\nProvide a professional report."}
            ],
            max_tokens=600
        )

        worker_result = worker_resp.choices[0].message.content

        # Save result
        Path("demo_results").mkdir(exist_ok=True)
        result_file = f"demo_results/{result.job_id}.txt"
        with open(result_file, "w") as f:
            f.write(f"JOB: {analysis['title']}\n")
            f.write(f"AGENT: {selected.name}\n")
            f.write(f"TX: {result.tx_signature}\n\n")
            f.write(worker_result)

        await send("job_completed", f"✓ Task completed by AI!", {
            "preview": worker_result[:400],
            "resultFile": result_file,
            "charCount": len(worker_result)
        })
        await asyncio.sleep(0.5)

        # STEP 6: Done
        await send("completed", "✅ DEMO COMPLETE — Agent paid agent autonomously!", {
            "task": task,
            "agent": selected.name,
            "jobId": result.job_id,
            "escrow": result.escrow_address,
            "amountLocked": result.amount_sol,
            "tx": result.tx_signature,
            "explorerUrl": result.explorer_url,
            "resultPreview": worker_result[:500]
        })

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        await websocket.send_json({
            "event": "error",
            "message": f"Error: {str(e)}",
            "data": {},
            "timestamp": time.strftime("%H:%M:%S")
        })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
