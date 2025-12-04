FROM cgr.dev/chainguard/node:latest-dev

WORKDIR /app

# Copy package files first for better caching
COPY --chown=node:node package*.json ./

# Install dependencies - need to override entrypoint for build steps
RUN ["/usr/bin/npm", "install"]

# Copy application code
COPY --chown=node:node . .

EXPOSE 5173

# Use npx to run vite
ENTRYPOINT ["/usr/bin/npx"]
CMD ["vite", "--host", "0.0.0.0"]
