import json
import os
import time
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone, timedelta
from typing import Optional, Any, Dict, Literal
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class CacheEntry(BaseModel):
    key: str
    value: Any
    fetched_at: str
    expires_at: str
    source: str = "upstream"
    ttl_seconds: int = 1800

    @property
    def is_expired(self) -> bool:
        try:
            exp_dt = datetime.fromisoformat(self.expires_at)
            return datetime.now(timezone.utc) > exp_dt
        except Exception:
            return True

    @property
    def status(self) -> Literal["fresh", "stale"]:
        return "stale" if self.is_expired else "fresh"


class BaseCacheRepository(ABC):
    """Abstract caching repository interface."""

    @abstractmethod
    def get(self, key: str, allow_stale: bool = True) -> Optional[CacheEntry]:
        pass

    @abstractmethod
    def set(self, key: str, value: Any, ttl_seconds: int = 1800, source: str = "upstream") -> CacheEntry:
        pass

    @abstractmethod
    def delete(self, key: str) -> bool:
        pass

    @abstractmethod
    def exists(self, key: str) -> bool:
        pass

    @abstractmethod
    def clear(self) -> None:
        pass


class MemoryCacheRepository(BaseCacheRepository):
    """Thread-safe in-memory cache repository."""

    def __init__(self):
        self._store: Dict[str, CacheEntry] = {}

    def get(self, key: str, allow_stale: bool = True) -> Optional[CacheEntry]:
        entry = self._store.get(key)
        if not entry:
            return None
        if entry.is_expired and not allow_stale:
            return None
        return entry

    def set(self, key: str, value: Any, ttl_seconds: int = 1800, source: str = "upstream") -> CacheEntry:
        now = datetime.now(timezone.utc)
        exp = now + timedelta(seconds=ttl_seconds)
        entry = CacheEntry(
            key=key,
            value=value,
            fetched_at=now.isoformat(),
            expires_at=exp.isoformat(),
            source=source,
            ttl_seconds=ttl_seconds
        )
        self._store[key] = entry
        return entry

    def delete(self, key: str) -> bool:
        if key in self._store:
            del self._store[key]
            return True
        return False

    def exists(self, key: str) -> bool:
        return key in self._store

    def clear(self) -> None:
        self._store.clear()


class JsonFileCacheRepository(BaseCacheRepository):
    """Local JSON file cache repository for persistent local development."""

    def __init__(self, cache_dir: str = "data/cache"):
        self.cache_dir = cache_dir
        os.makedirs(self.cache_dir, exist_ok=True)
        self.cache_file = os.path.join(self.cache_dir, "cache_store.json")
        self._memory = MemoryCacheRepository()
        self._load_from_disk()

    def _load_from_disk(self) -> None:
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for k, item in data.items():
                        entry = CacheEntry(**item)
                        self._memory._store[k] = entry
            except Exception as e:
                logger.warning(f"Failed to load cache from disk: {e}")

    def _save_to_disk(self) -> None:
        try:
            raw_data = {k: entry.model_dump() for k, entry in self._memory._store.items()}
            with open(self.cache_file, "w", encoding="utf-8") as f:
                json.dump(raw_data, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to persist cache to disk: {e}")

    def get(self, key: str, allow_stale: bool = True) -> Optional[CacheEntry]:
        return self._memory.get(key, allow_stale=allow_stale)

    def set(self, key: str, value: Any, ttl_seconds: int = 1800, source: str = "upstream") -> CacheEntry:
        entry = self._memory.set(key, value, ttl_seconds=ttl_seconds, source=source)
        self._save_to_disk()
        return entry

    def delete(self, key: str) -> bool:
        res = self._memory.delete(key)
        if res:
            self._save_to_disk()
        return res

    def exists(self, key: str) -> bool:
        return self._memory.exists(key)

    def clear(self) -> None:
        self._memory.clear()
        self._save_to_disk()


_default_cache = None


def get_cache_repository() -> BaseCacheRepository:
    """Singleton getter for application cache repository."""
    global _default_cache
    if _default_cache is None:
        _default_cache = JsonFileCacheRepository()
    return _default_cache
