# --- Frontend Build Stage ---
FROM node:20-slim AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# --- Backend Build Stage ---
FROM rust:1.94-slim-bookworm AS backend-builder
WORKDIR /app/server
RUN apt-get update && apt-get install -y pkg-config libssl-dev libonig-dev && rm -rf /var/lib/apt/lists/*
COPY server/Cargo.toml server/Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src
COPY server/src ./src
RUN touch src/main.rs && cargo build --release

# --- Final Runtime Stage ---
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y ca-certificates libssl3 libonig5 tini && rm -rf /var/lib/apt/lists/*
COPY --from=backend-builder /app/server/target/release/server ./datadog-grok-tester
COPY --from=frontend-builder /app/client/dist ./dist
ENV PORT=3001
EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./datadog-grok-tester"]
