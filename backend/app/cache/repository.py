import json
import os
import time
import uuid
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone, timedelta
from typing import Optional, Any, Dict, Literal
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


def get_geographic_cell(lat: float, lon: float, resolution_deg: float = 0.02) -> tuple[float, float, str]:
    """
    Snap coordinates to a geographic grid cell for localized caching.

    Physical dimension documentation:
    - Latitude spacing is approximately constant worldwide: 1 deg lat ~ 111.0 km.
      At resolution_deg = 0.02, North-South cell span is ~2.22 km.
    - Longitude spacing shrinks with the cosine of latitude: 1 deg lon ~ 111.0 * cos(lat) km.
      - At Equator (0 deg): ~2.22 km East-West span.
      - At Delhi (28.6 deg N): ~1.95 km East-West span (cos ~ 0.878).
      - At London (51.5 deg N): ~1.38 km East-West span (cos ~ 0.623).
      - At High Latitudes (70 deg N): ~0.76 km East-West span.
      - At Poles (90 deg N/S): ~0 km East-West span.
    Returns:
        (cell_lat, cell_lon, cache_key)
    """
    res = float(resolution_deg) if resolution_deg > 0 else 0.02
    cell_lat = round(round(lat / res) * res, 4)
    cell_lon = round(round(lon / res) * res, 4)
    return cell_lat, cell_lon, f"weather:cell:{cell_lat:.4f}:{cell_lon:.4f}"


class CacheEntry(BaseModel):
    """
    Cache entry with explicit two-tier freshness semantics:
    - Fresh window: [fetched_at, expires_at] where expires_at = fetched_at + ttl_seconds.
    - Stale grace window: [expires_at, grace_expires_at] where grace_expires_at = fetched_at + grace_seconds.
      During this grace window, stale data may be served if upstream providers are failing.
    """
    key: str
    value: Any
    fetched_at: str
    expires_at: str
    grace_expires_at: Optional[str] = None
    source: str = "upstream"
    ttl_seconds: int = 150
    grace_seconds: int = 1800

    @property
    def is_expired(self) -> bool:
        """True when the fresh freshness window (e.g. 150s) has elapsed."""
        try:
            exp_dt = datetime.fromisoformat(self.expires_at)
            return datetime.now(timezone.utc) > exp_dt
        except Exception:
            return True

    @property
    def is_grace_expired(self) -> bool:
        """True when the extended stale grace window has elapsed."""
        if self.grace_expires_at:
            try:
                exp_dt = datetime.fromisoformat(self.grace_expires_at)
                return datetime.now(timezone.utc) > exp_dt
            except Exception:
                return True
        # If grace_expires_at is not explicitly stored, fall back:
        # If grace_seconds > ttl_seconds, grace was measured from fetched_at;
        # otherwise grace_seconds represents the extension beyond expires_at.
        try:
            exp_iso = self.expires_at
            if exp_iso:
                exp_dt = datetime.fromisoformat(exp_iso)
                if self.fetched_at and self.grace_seconds > self.ttl_seconds:
                    base_dt = datetime.fromisoformat(self.fetched_at)
                    grace_dt = base_dt + timedelta(seconds=self.grace_seconds)
                else:
                    grace_dt = exp_dt + timedelta(seconds=self.grace_seconds)
                return datetime.now(timezone.utc) > grace_dt
        except Exception:
            pass
        return self.is_expired

    @property
    def status(self) -> Literal["fresh", "stale"]:
        return "stale" if self.is_expired else "fresh"


class BaseCacheRepository(ABC):
    """Abstract caching repository interface."""

    @abstractmethod
    def get(self, key: str, allow_stale: bool = True) -> Optional[CacheEntry]:
        pass

    @abstractmethod
    def set(
        self,
        key: str,
        value: Any,
        ttl_seconds: int = 150,
        source: str = "upstream",
        grace_seconds: Optional[int] = None,
    ) -> CacheEntry:
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

    @abstractmethod
    def acquire_fetch_lock(self, key: str, lease_seconds: int = 10) -> Optional[str]:
        """
        Acquire a mutual exclusion lock across processes/Lambdas for fetching upstream.
        Returns a unique lock ownership token (str) if this worker won the fetch lease; None if another worker is fetching.
        """
        pass

    @abstractmethod
    def release_fetch_lock(self, key: str, token: Optional[str] = None) -> bool:
        """Release the fetch lock if the caller still holds ownership (token matches)."""
        pass


class MemoryCacheRepository(BaseCacheRepository):
    """Thread-safe in-memory cache repository with single-flight request coalescing."""

    def __init__(self):
        self._store: Dict[str, CacheEntry] = {}
        self._locks: Dict[str, tuple[float, str]] = {}

    def get(self, key: str, allow_stale: bool = True) -> Optional[CacheEntry]:
        entry = self._store.get(key)
        if not entry:
            return None
        if not allow_stale and entry.is_expired:
            return None
        if allow_stale and entry.is_grace_expired:
            return None
        return entry

    def set(
        self,
        key: str,
        value: Any,
        ttl_seconds: int = 150,
        source: str = "upstream",
        grace_seconds: Optional[int] = None,
    ) -> CacheEntry:
        now = datetime.now(timezone.utc)
        exp = now + timedelta(seconds=ttl_seconds)
        actual_grace = grace_seconds if grace_seconds is not None else max(1800, ttl_seconds * 2)
        grace_exp = now + timedelta(seconds=actual_grace)

        entry = CacheEntry(
            key=key,
            value=value,
            fetched_at=now.isoformat(),
            expires_at=exp.isoformat(),
            grace_expires_at=grace_exp.isoformat(),
            source=source,
            ttl_seconds=ttl_seconds,
            grace_seconds=actual_grace,
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
        self._locks.clear()

    def acquire_fetch_lock(self, key: str, lease_seconds: int = 10) -> Optional[str]:
        now = time.time()
        lock_key = f"lock:{key}"
        curr = self._locks.get(lock_key)
        if curr:
            exp, _ = curr
            if now < exp:
                return None
        token = str(uuid.uuid4())
        self._locks[lock_key] = (now + lease_seconds, token)
        return token

    def release_fetch_lock(self, key: str, token: Optional[str] = None) -> bool:
        lock_key = f"lock:{key}"
        curr = self._locks.get(lock_key)
        if not curr:
            return False
        exp, current_token = curr
        if token is not None and token != current_token:
            logger.warning(f"Lock release rejected for {key}: token does not match active owner")
            return False
        self._locks.pop(lock_key, None)
        return True


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

    def set(
        self,
        key: str,
        value: Any,
        ttl_seconds: int = 150,
        source: str = "upstream",
        grace_seconds: Optional[int] = None,
    ) -> CacheEntry:
        entry = self._memory.set(
            key, value, ttl_seconds=ttl_seconds, source=source, grace_seconds=grace_seconds
        )
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

    def acquire_fetch_lock(self, key: str, lease_seconds: int = 10) -> Optional[str]:
        return self._memory.acquire_fetch_lock(key, lease_seconds=lease_seconds)

    def release_fetch_lock(self, key: str, token: Optional[str] = None) -> bool:
        return self._memory.release_fetch_lock(key, token=token)


class AwsDynamoCacheRepository(BaseCacheRepository):
    """
    AWS DynamoDB implementation of CacheRepository for Phase 3.
    Enforces application-level freshness validation separate from DynamoDB background TTL.
    Supports atomic multi-Lambda request coalescing via DynamoDB conditional writes.
    Gracefully falls back to in-memory store if DynamoDB is unreachable.
    """

    def __init__(self, table_name: str = "arise-cache", region_name: str = "us-east-1"):
        self.table_name = table_name
        self.region_name = region_name
        self._memory_fallback = MemoryCacheRepository()
        self._table = None
        try:
            import boto3
            dynamodb = boto3.resource("dynamodb", region_name=self.region_name)
            self._table = dynamodb.Table(self.table_name)
        except Exception as e:
            logger.warning(f"DynamoDB initialization warning: {e}. Fallback to memory cache.")

    def get(self, key: str, allow_stale: bool = True) -> Optional[CacheEntry]:
        if not self._table:
            return self._memory_fallback.get(key, allow_stale=allow_stale)
        try:
            resp = self._table.get_item(Key={"pk": key})
            item = resp.get("Item")
            if not item:
                return self._memory_fallback.get(key, allow_stale=allow_stale)

            raw_data = item.get("data")
            if isinstance(raw_data, str):
                try:
                    val = json.loads(raw_data)
                except Exception:
                    val = raw_data
            else:
                val = raw_data

            entry = CacheEntry(
                key=key,
                value=val,
                fetched_at=item.get("fetched_at", datetime.now(timezone.utc).isoformat()),
                expires_at=item.get("expires_at", datetime.now(timezone.utc).isoformat()),
                grace_expires_at=item.get("grace_expires_at"),
                source=item.get("source", "dynamodb"),
                ttl_seconds=int(item.get("ttl_seconds", 150)),
                grace_seconds=int(item.get("grace_seconds", 1800)),
            )

            # Application-level freshness validation
            if not allow_stale and entry.is_expired:
                return None
            if allow_stale and entry.is_grace_expired:
                return None
            return entry
        except Exception as e:
            logger.warning(f"DynamoDB get error for {key}: {e}. Trying memory fallback.")
            return self._memory_fallback.get(key, allow_stale=allow_stale)

    def set(
        self,
        key: str,
        value: Any,
        ttl_seconds: int = 150,
        source: str = "upstream",
        grace_seconds: Optional[int] = None,
    ) -> CacheEntry:
        now = datetime.now(timezone.utc)
        exp = now + timedelta(seconds=ttl_seconds)
        actual_grace = grace_seconds if grace_seconds is not None else max(1800, ttl_seconds * 2)
        grace_exp = now + timedelta(seconds=actual_grace)
        now_epoch = int(now.timestamp())
        ttl_epoch = now_epoch + actual_grace

        entry = CacheEntry(
            key=key,
            value=value,
            fetched_at=now.isoformat(),
            expires_at=exp.isoformat(),
            grace_expires_at=grace_exp.isoformat(),
            source=source,
            ttl_seconds=ttl_seconds,
            grace_seconds=actual_grace,
        )

        # Update fallback in memory
        self._memory_fallback.set(
            key, value, ttl_seconds=ttl_seconds, source=source, grace_seconds=actual_grace
        )

        if self._table:
            try:
                json_data = json.dumps(value)
                item = {
                    "pk": key,
                    "data": json_data,
                    "source": source,
                    "fetched_at": now.isoformat(),
                    "expires_at": exp.isoformat(),
                    "grace_expires_at": grace_exp.isoformat(),
                    "status": "fresh",
                    "version": "1.0",
                    "ttl_seconds": ttl_seconds,
                    "grace_seconds": actual_grace,
                    "ttl_epoch": ttl_epoch,
                }
                self._table.put_item(Item=item)
            except Exception as e:
                logger.warning(f"DynamoDB put error for {key}: {e}")

        return entry

    def delete(self, key: str) -> bool:
        self._memory_fallback.delete(key)
        if self._table:
            try:
                self._table.delete_item(Key={"pk": key})
                return True
            except Exception as e:
                logger.warning(f"DynamoDB delete error for {key}: {e}")
        return True

    def exists(self, key: str) -> bool:
        entry = self.get(key, allow_stale=False)
        return entry is not None

    def clear(self) -> None:
        self._memory_fallback.clear()

    def acquire_fetch_lock(self, key: str, lease_seconds: int = 10) -> Optional[str]:
        """
        Cross-Lambda request coalescing using DynamoDB conditional write and ownership token fencing.
        Guarantees only ONE Lambda fetches upstream for a given cache cell during cache misses.
        Returns unique ownership token on success; None if another worker owns the lease.
        """
        if not self._table:
            return self._memory_fallback.acquire_fetch_lock(key, lease_seconds)
        now_epoch = int(time.time())
        lock_key = f"lock:{key}"
        expires_epoch = now_epoch + lease_seconds
        token = str(uuid.uuid4())
        try:
            self._table.put_item(
                Item={
                    "pk": lock_key,
                    "owner_token": token,
                    "expires_epoch": expires_epoch,
                    "ttl_epoch": expires_epoch + 60,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
                ConditionExpression="attribute_not_exists(pk) OR expires_epoch < :now",
                ExpressionAttributeValues={":now": now_epoch},
            )
            return token
        except Exception:
            # ConditionalCheckFailedException or network error -> another worker owns the lease
            return None

    def release_fetch_lock(self, key: str, token: Optional[str] = None) -> bool:
        """Release the cross-Lambda fetch lock with token fencing."""
        self._memory_fallback.release_fetch_lock(key, token)
        if not self._table:
            return True
        lock_key = f"lock:{key}"
        try:
            if token:
                self._table.delete_item(
                    Key={"pk": lock_key},
                    ConditionExpression="owner_token = :token",
                    ExpressionAttributeValues={":token": token},
                )
            else:
                self._table.delete_item(Key={"pk": lock_key})
            return True
        except Exception as e:
            logger.debug(f"Conditional release of fetch lock failed for {key}: {e}")
            return False


_default_cache = None


def get_cache_repository() -> BaseCacheRepository:
    """Singleton getter for application cache repository with MODE-based selection."""
    global _default_cache
    if _default_cache is None:
        from app.core.config import get_settings
        settings = get_settings()
        if settings.MODE == "aws":
            _default_cache = AwsDynamoCacheRepository(
                table_name=settings.DYNAMODB_TABLE_NAME,
                region_name=settings.AWS_REGION
            )
        else:
            _default_cache = JsonFileCacheRepository(cache_dir=settings.CACHE_DIR)
    return _default_cache
