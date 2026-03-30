import asyncio
from agentpay import AgentPayClient

async def main():
    print("=== AgentPay Python SDK Test ===\n")

    client = AgentPayClient.from_file()
    print(f"Wallet: {client.public_key}")

    balance = await client.get_balance()
    print(f"Balance: {balance:.4f} SOL\n")

    print("--- Finding agents ---")
    agents = await client.find_agents()
    print(f"Total agents: {len(agents)}")
    for a in agents:
        print(f"  - {a.name} | {a.price_sol} SOL | {', '.join(a.skills)}")

    print("\n--- Finding research agents ---")
    research = await client.find_agents(["research"])
    print(f"Research agents: {len(research)}")

    print("\n✓ Python SDK test completed!")

asyncio.run(main())
