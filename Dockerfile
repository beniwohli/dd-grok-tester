# --- Frontend Build Stage ---
FROM --platform=$BUILDPLATFORM node:20-slim AS frontend-builder
WORKDIR /app/client
RUN npm install -g pnpm
# Cache dependencies
COPY client/package.json ./
RUN pnpm install
# Build source
COPY client/ ./
RUN pnpm run build

# --- Backend Build Stage ---
FROM --platform=$BUILDPLATFORM rust:1.94-slim-bookworm AS backend-builder
COPY --from=tonistiigi/xx / /
ARG TARGETPLATFORM

WORKDIR /app/server
# Install host build dependencies (clang, lld are used by xx as cross linkers)
RUN apt-get update && apt-get install -y pkg-config clang lld && rm -rf /var/lib/apt/lists/*
# Install target platform dependencies
RUN xx-apt-get install -y gcc libc6-dev libssl-dev libonig-dev
# Setup cargo for cross compilation

# Cache dependencies by building a dummy source
COPY server/Cargo.toml server/Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN xx-cargo build --release --target-dir ./target && rm -rf src
# Build actual source
COPY server/src ./src
# Ensure we don't accidentally use the cached binary
RUN touch src/main.rs && xx-cargo build --release --target-dir ./target
# Verify the binary is compiled for the target architecture and standardize path
RUN xx-verify target/$(xx-cargo --print-target-triple)/release/server
RUN cp target/$(xx-cargo --print-target-triple)/release/server /server-bin

# --- Final Runtime Stage ---
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y ca-certificates libssl3 libonig5 tini && rm -rf /var/lib/apt/lists/*
COPY --from=backend-builder /server-bin ./datadog-grok-tester
COPY --from=frontend-builder /app/client/dist ./dist
ENV PORT=3001
EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./datadog-grok-tester"]
