"""Validate /api/session handler in environments without external Python deps.

This script stubs fastapi/pydantic modules when they are unavailable so `app.py`
can be imported and the session handler can be exercised locally.
"""
from __future__ import annotations

import importlib.util
import json
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def ensure_module_stubs() -> None:
    if importlib.util.find_spec("fastapi") and importlib.util.find_spec("pydantic"):
        return

    fastapi = types.ModuleType("fastapi")

    class HTTPException(Exception):
        def __init__(self, status_code: int, detail: str = "") -> None:
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class Request:
        def __init__(self, headers: dict[str, str] | None = None) -> None:
            self.headers = headers or {}

    class FastAPI:
        def __init__(self, *args, **kwargs) -> None:
            self.routes = []

        def mount(self, *args, **kwargs) -> None:
            return None

        def _decorator(self, *args, **kwargs):
            def wrap(func):
                return func

            return wrap

        get = post = delete = _decorator

    fastapi.FastAPI = FastAPI
    fastapi.HTTPException = HTTPException
    fastapi.Request = Request

    responses = types.ModuleType("fastapi.responses")

    class FileResponse:
        def __init__(self, path: Path | str) -> None:
            self.path = str(path)

    responses.FileResponse = FileResponse

    staticfiles = types.ModuleType("fastapi.staticfiles")

    class StaticFiles:
        def __init__(self, directory: Path | str) -> None:
            self.directory = str(directory)

    staticfiles.StaticFiles = StaticFiles

    pydantic = types.ModuleType("pydantic")

    class BaseModel:
        def __init__(self, **kwargs) -> None:
            for key, value in kwargs.items():
                setattr(self, key, value)

        def model_dump_json(self) -> str:
            return json.dumps(self.__dict__)

    def Field(default=None, default_factory=None):
        if default_factory is not None:
            return default_factory()
        return default

    pydantic.BaseModel = BaseModel
    pydantic.Field = Field

    sys.modules["fastapi"] = fastapi
    sys.modules["fastapi.responses"] = responses
    sys.modules["fastapi.staticfiles"] = staticfiles
    sys.modules["pydantic"] = pydantic


def main() -> int:
    ensure_module_stubs()
    import app as job_app

    req = job_app.Request(headers={"x-linux-user": "browser_user"})
    data = job_app.get_session(req)
    if data.get("user") != "browser_user":
        print(f"FAIL: expected browser_user, got {data}")
        return 1
    print("PASS: /api/session returns browser user from header")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
