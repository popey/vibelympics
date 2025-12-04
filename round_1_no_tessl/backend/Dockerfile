FROM cgr.dev/chainguard/python:latest-dev

WORKDIR /app

# Add local bin to PATH for uv
ENV PATH="/home/nonroot/.local/bin:$PATH"

# Copy dependency files first for better caching
COPY --chown=nonroot:nonroot pyproject.toml .

# Install uv for package management
RUN pip install uv --user

# Install dependencies
RUN uv sync

# Copy application code
COPY --chown=nonroot:nonroot . .

EXPOSE 8000

ENTRYPOINT ["uv", "run"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
