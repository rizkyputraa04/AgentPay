import asyncio
from agentpay import AgentPayClient

async def main():
    print("=== AgentPay Python SDK - Hire Test ===\n")

    client = AgentPayClient.from_file()
    print(f"Wallet: {client.public_key}")

    balance = await client.get_balance()
    print(f"Balance: {balance:.4f} SOL\n")

    print("--- Finding research agent ---")
    agents = await client.find_agents(["research"])
    if not agents:
        print("No agents found")
        return

    agent = agents[0]
    print(f"Selected: {agent.name}")
    print(f"Price: {agent.price_sol} SOL\n")

    print("--- Hiring agent ---")
    result = await client.hire_agent(
        agent,
        "Python SDK Test Job",
        "Testing hire agent flow from Python SDK"
    )

    print(f"\n=== HIRE SUCCESSFUL ===")
    print(f"Job ID:  {result.job_id}")
    print(f"Escrow:  {result.escrow_address}")
    print(f"Amount:  {result.amount_sol} SOL")
    print(f"Explorer: {result.explorer_url}")

asyncio.run(main())
