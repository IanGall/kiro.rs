# 前端构建阶段
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install
COPY frontend ./
RUN pnpm build

# 后端构建阶段
FROM rust:alpine AS builder

RUN apk add --no-cache musl-dev openssl-dev openssl-libs-static

WORKDIR /app
# 保持 backend 目录结构，确保 rust-embed 的相对路径（../frontend/dist）可用
COPY backend/Cargo.toml backend/Cargo.lock* /app/backend/
COPY backend/src /app/backend/src
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

RUN cargo build --release --manifest-path /app/backend/Cargo.toml

# 运行阶段
FROM alpine:3.21

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=builder /app/backend/target/release/kiro-rs /app/kiro-rs

VOLUME ["/app/data"]

EXPOSE 8990

CMD ["./kiro-rs", "-c", "/app/data/config.toml"]
