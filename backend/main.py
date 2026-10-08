import time
import uuid
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.api.routes.health import router as health_router
from app.api.routes.air import router as air_router
from app.api.routes.weather import router as weather_router
from app.api.routes.forecast import router as forecast_router
from app.api.routes.fire import router as fire_router
from app.api.routes.environment import router as environment_router
from app.api.routes.verdict import router as verdict_router
from app.api.routes.compare import router as compare_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("arise.api")

settings = get_settings()

app = FastAPI(
    title="Arise API",
    description="Delhi-NCR Environmental Intelligence & Air Quality Decision Platform",
    version="2.0.0"
)

# CORS configuration for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    """Log structured request metadata without leaking sensitive query parameters."""
    req_id = str(uuid.uuid4())[:8]
    start_time = time.perf_counter()
    
    # Process request
    response = await call_next(request)
    duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
    
    response.headers["X-Request-ID"] = req_id
    logger.info(f"[{req_id}] {request.method} {request.url.path} -> {response.status_code} ({duration_ms}ms)")
    return response


# Mount API routers
app.include_router(health_router)
app.include_router(air_router)
app.include_router(weather_router)
app.include_router(forecast_router)
app.include_router(fire_router)
app.include_router(environment_router)
app.include_router(verdict_router)
app.include_router(compare_router)
