import asyncio
from app.agents.arise_agent import AriseAgent
from app.agents.schemas import AskAriseRequest

async def main():
    agent = AriseAgent()
    questions = [
        "Can I go out now?",
        "Why is the air bad?",
        "What is the best time to go outside?",
        "Can my kid play outside?",
        "Should school outdoor sports continue?"
    ]
    
    print("Testing Ask Arise Agent with LIVE data (demo=False)...")
    for q in questions:
        req = AskAriseRequest(
            question=q,
            lat=28.6139,
            lon=77.2090,
            persona="Parent",
            demo=False
        )
        resp = await agent.answer(req)
        print(f"\n==========================================")
        print(f"Q: {q}")
        print(f"Verdict: {resp.verdict}")
        print(f"Headline: {resp.headline}")
        print(f"Best Window: {resp.best_window}")
        print(f"Recheck At: {resp.recheck_at}")
        print(f"Why:")
        for w in resp.why:
            print(f"  • {w}")
        print(f"Do:")
        for d in resp.do:
            print(f"  • {d}")
        print(f"Sources: {resp.sources}")

if __name__ == "__main__":
    asyncio.run(main())
