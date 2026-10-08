import os
from functools import lru_cache
from pathlib import Path
from typing import Optional, Literal
from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator, model_validator

# Load .env from backend directory and project root
load_dotenv()
_backend_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(_backend_dir / ".env")
load_dotenv(_backend_dir.parent / ".env")


class Settings(BaseModel):
    """
    Centralized configuration layer for Arise Phase 2.
    Safe defaults for local development; strict validation for production.
    Ensures secrets are never exposed in logs or string representations.
    """
    MODE: Literal["local", "aws"] = "local"
    AWS_REGION: str = "us-east-1"
    
    # External API Keys (Optional in local mode; fallback mock/cached data used if missing)
    OPENAQ_API_KEY: Optional[str] = None
    FIRMS_MAP_KEY: Optional[str] = None
    CPCB_API_KEY: Optional[str] = None
    
    # Caching & Timeouts
    CACHE_TTL_SECONDS: int = Field(default=1800, ge=1, le=86400)
    CACHE_DIR: str = "data/cache"
    DYNAMODB_TABLE_NAME: str = "arise-cache"
    API_TIMEOUT_SECONDS: float = Field(default=10.0, gt=0.0, le=60.0)
    
    # Operational & Observability Flags
    DEMO_MODE_DEFAULT: bool = False
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,*"
    POWERTOOLS_SERVICE_NAME: str = "arise-api"
    
    # AI / LLM Integration
    LLM_PROVIDER: Literal["local", "ollama", "bedrock"] = "local"
    BEDROCK_MODEL_ID: str = "us.amazon.nova-lite-v1:0"
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2"
    
    @field_validator("MODE", mode="before")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if isinstance(v, str):
            v_lower = v.strip().lower()
            if v_lower in ("local", "aws"):
                return v_lower
        raise ValueError("MODE must be either 'local' or 'aws'")

    @field_validator("CACHE_TTL_SECONDS", "API_TIMEOUT_SECONDS", mode="before")
    @classmethod
    def validate_positive_numbers(cls, v):
        try:
            val = float(v)
            if val <= 0:
                raise ValueError("Must be greater than 0")
            return int(val) if isinstance(v, int) or str(v).isdigit() else val
        except (TypeError, ValueError) as err:
            raise ValueError(f"Invalid positive number: {v}") from err

    @model_validator(mode="after")
    def validate_production_requirements(self) -> "Settings":
        if self.MODE == "aws":
            # In AWS production mode, region must be specified
            if not self.AWS_REGION:
                raise ValueError("AWS_REGION is required when MODE='aws'")
        return self

    def is_secret_set(self, key_name: str) -> bool:
        """Check if an API key is present without exposing its value."""
        val = getattr(self, key_name, None)
        return bool(val and str(val).strip())

    def safe_dict(self) -> dict:
        """Export settings with sensitive credentials masked."""
        data = self.model_dump()
        sensitive_keys = {"OPENAQ_API_KEY", "FIRMS_MAP_KEY", "CPCB_API_KEY"}
        for k in sensitive_keys:
            if data.get(k):
                data[k] = "******"
            else:
                data[k] = None
        return data

    def __repr__(self) -> str:
        safe_info = self.safe_dict()
        return f"Settings({safe_info})"

    def __str__(self) -> str:
        return self.__repr__()


@lru_cache
def get_settings() -> Settings:
    """Load settings from environment variables."""
    return Settings(
        MODE=os.getenv("MODE", "local"),
        AWS_REGION=os.getenv("AWS_REGION", "us-east-1"),
        OPENAQ_API_KEY=os.getenv("OPENAQ_API_KEY") or None,
        FIRMS_MAP_KEY=os.getenv("FIRMS_MAP_KEY") or None,
        CPCB_API_KEY=os.getenv("CPCB_API_KEY") or None,
        CACHE_TTL_SECONDS=int(os.getenv("CACHE_TTL_SECONDS", "1800")),
        CACHE_DIR=os.getenv("CACHE_DIR", "data/cache"),
        DYNAMODB_TABLE_NAME=os.getenv("DYNAMODB_TABLE_NAME", "arise-cache"),
        API_TIMEOUT_SECONDS=float(os.getenv("API_TIMEOUT_SECONDS", "10.0")),
        DEMO_MODE_DEFAULT=os.getenv("DEMO_MODE_DEFAULT", "false").lower() in ("true", "1", "yes"),
        CORS_ORIGINS=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,*"),
        POWERTOOLS_SERVICE_NAME=os.getenv("POWERTOOLS_SERVICE_NAME", "arise-api"),
        LLM_PROVIDER=os.getenv("LLM_PROVIDER", "local"),
        BEDROCK_MODEL_ID=os.getenv("BEDROCK_MODEL_ID", "us.amazon.nova-lite-v1:0"),
        OLLAMA_HOST=os.getenv("OLLAMA_HOST", "http://localhost:11434"),
        OLLAMA_MODEL=os.getenv("OLLAMA_MODEL", "llama3.2"),
    )
