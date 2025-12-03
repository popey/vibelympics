# Use Chainguard Node image for development
FROM cgr.dev/chainguard/node:latest-dev

WORKDIR /app

# Copy package files
COPY --chown=node:node package*.json ./

# Install dependencies (reset entrypoint first for RUN command)
RUN npm install

# Copy source files
COPY --chown=node:node . .

# Expose dev server port
EXPOSE 5173

# Reset entrypoint (Chainguard image sets node as entrypoint)
ENTRYPOINT []

# Run dev server with hot reload
CMD ["/bin/sh", "-c", "npm run dev -- --host 0.0.0.0"]
