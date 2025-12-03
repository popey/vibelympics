# Use Chainguard Python image for development (includes shell and pip)
FROM cgr.dev/chainguard/python:latest-dev

# Set working directory
WORKDIR /app

# Copy dependency files
COPY --chown=nonroot:nonroot pyproject.toml ./

# Install uv and dependencies
RUN pip install --no-cache-dir uv && \
    uv venv /app/.venv && \
    . /app/.venv/bin/activate && \
    uv pip install fastapi "uvicorn[standard]" httpx

# Copy application code
COPY --chown=nonroot:nonroot src/ /app/src/

# Set environment variables
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app"

# Expose port
EXPOSE 8000

# Reset entrypoint (Chainguard image sets python as entrypoint)
ENTRYPOINT []

# Run the application with hot-reload for development
CMD ["/bin/sh", "-c", ". /app/.venv/bin/activate && python -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir /app/src"]
