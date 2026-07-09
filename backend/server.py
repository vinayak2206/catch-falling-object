from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from datetime import datetime, timezone
import os

load_dotenv()

MONGO_URL = os.environ.get('MONGO_URL')
DB_NAME = os.environ.get('DB_NAME')

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
lb_col = db['leaderboard']

app = FastAPI(title="Catch! API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LBEntry(BaseModel):
    player_id: str = Field(..., min_length=3, max_length=64)
    name: str = Field(..., min_length=1, max_length=24)
    avatar: str = Field(default='🧺', max_length=8)
    score: int = Field(..., ge=0, le=10_000_000)
    combo: int = Field(..., ge=0, le=10_000)
    level: int = Field(..., ge=0, le=100)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "catch-falling-objects"}


@app.get("/api/")
async def root():
    return {"message": "Catch the Falling Objects API"}


@app.post("/api/leaderboard/submit")
async def submit_score(entry: LBEntry):
    """Upsert a player's best score/combo/level. Keeps only the max of each."""
    existing = await lb_col.find_one({"player_id": entry.player_id})
    payload = {
        "player_id": entry.player_id,
        "name": entry.name,
        "avatar": entry.avatar,
        "score": max(entry.score, existing["score"] if existing else 0),
        "combo": max(entry.combo, existing["combo"] if existing else 0),
        "level": max(entry.level, existing["level"] if existing else 0),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await lb_col.update_one(
        {"player_id": entry.player_id},
        {"$set": payload},
        upsert=True,
    )
    return {"ok": True, "entry": payload}


@app.get("/api/leaderboard/top")
async def top_scores(limit: int = 25, sort: str = "score"):
    """Return top-N entries sorted by score, combo or level."""
    if sort not in ("score", "combo", "level"):
        raise HTTPException(status_code=400, detail="invalid sort key")
    limit = max(1, min(limit, 100))
    cursor = lb_col.find({}, {"_id": 0}).sort(sort, -1).limit(limit)
    entries = await cursor.to_list(length=limit)
    return {"entries": entries, "sort": sort, "count": len(entries)}
