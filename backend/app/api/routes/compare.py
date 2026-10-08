from typing import List
from fastapi import APIRouter, Query
from pydantic import BaseModel
from app.services.compare_places import ComparePlacesService, PlaceTarget

router = APIRouter(tags=["Compare"])
compare_service = ComparePlacesService()


class CompareRequest(BaseModel):
    places: List[PlaceTarget]
    demo: bool = False


@router.post("/compare")
async def compare_locations(req: CompareRequest):
    """Compare multiple coordinates (e.g. Home vs School vs Office)."""
    res = await compare_service.compare_locations(req.places, force_demo=req.demo)
    return res.model_dump()
