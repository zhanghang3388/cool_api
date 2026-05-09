# syntax=docker/dockerfile:1.7

# ---- builder ----
FROM rust:1.88-bookworm AS builder
WORKDIR /build

# Copy just the manifests first so `cargo fetch` is cached across source changes.
COPY Cargo.toml Cargo.lock ./
# Create a stub main.rs so the dependency build can complete without the real
# sources, then fetch dependencies and pre-compile them. This layer is reused
# until Cargo.lock changes.
RUN mkdir -p src \
    && echo 'fn main() {}' > src/main.rs \
    && cargo build --release \
    && rm -rf src target/release/deps/aethergate* target/release/aethergate*

# Real sources + migrations.
COPY src ./src
COPY migrations ./migrations

# Touch so cargo rebuilds main.
RUN touch src/main.rs \
    && cargo build --release --bin aethergate

# ---- runtime ----
FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --home /app --uid 10001 app

WORKDIR /app
COPY --from=builder /build/target/release/aethergate /app/aethergate
COPY --from=builder /build/migrations /app/migrations

USER app
EXPOSE 3000
ENV BIND=0.0.0.0:3000 \
    RUST_LOG=info,aethergate=info
CMD ["/app/aethergate"]
