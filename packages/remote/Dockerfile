# syntax=docker/dockerfile:1
# NeuroDock remote MCP server — the combined STATELESS tool surface (ADR 0008/0009).
#
# Build from the REPO ROOT (the workspace graph must be visible):
#   docker build -f packages/remote/Dockerfile -t neurodock-remote .
#
# Single-stage on the uv image: the resolved virtualenv at /app/.venv references
# this image's interpreter, so we serve from the same base rather than copying the
# venv onto a different python image (which would break the interpreter path).
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Workspace metadata + lockfile first for layer caching. The remote package depends
# on three sibling workspace packages, so the whole workspace must be present to
# resolve from the frozen lock.
COPY pyproject.toml uv.lock README.md ./
COPY packages/ ./packages/

# Install ONLY neurodock-remote and its (stateless) workspace dependencies. The
# stateful servers (cognitive-graph, chronometric) and their heavy native deps are
# not dependencies of neurodock-remote and are therefore never installed.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --package neurodock-remote

# Bind all interfaces (the container sits behind the edge/proxy). This is an
# explicit deployment decision; the application code defaults to 127.0.0.1.
ENV NEURODOCK_HTTP_HOST=0.0.0.0 \
    NEURODOCK_HTTP_PORT=8000

# Run as a non-root user.
RUN useradd --create-home --uid 10001 neurodock \
    && chown -R neurodock:neurodock /app
USER neurodock

EXPOSE 8000

# Public deployments MUST set NEURODOCK_AUTH_PROVIDER + the matching IdP config
# (ADR 0009 §3); without it the server logs a loud warning and serves unauthenticated.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "neurodock_remote.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
