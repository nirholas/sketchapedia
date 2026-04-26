"""Server entrypoint."""

from __future__ import annotations

import uvicorn

from .app import create_app
from .config import settings

app = create_app()


def main() -> None:
    s = settings()
    uvicorn.run("model_vision.main:app", host=s.host, port=s.port,
                log_level=s.log_level.lower(), workers=1)


if __name__ == "__main__":
    main()
