# Docker Hub 构建与推送（linux/amd64）

本文档记录如何将 `kiro.rs` 构建为 **linux/amd64** 镜像并推送到 Docker Hub，便于后续重复发布。

## 0. 前置条件

- 已安装 Docker Desktop / Docker Engine，并启用 `buildx`
- 已登录 Docker Hub：`docker login`
- 目标仓库存在：`ianqian1111/kiro-rs`

> 说明：本项目 `Dockerfile` 位于仓库根目录，包含前端（Node）与后端（Rust）多阶段构建。

## 1. 推荐方式：一次性 build 并 push（单架构 amd64）

在项目根目录执行：

```bash
docker buildx build \
  --platform linux/amd64 \
  -t ianqian1111/kiro-rs:latest \
  -t ianqian1111/kiro-rs:2.3 \
  --push \
  -f Dockerfile .
```

## 2. 备选方式：先 build 到本地，再 tag/push

适合需要先在本地做快速检查的场景：

```bash
# 1) 构建 amd64 镜像到本地 Docker（注意：--load 只能加载单架构）
docker buildx build \
  --platform linux/amd64 \
  -t kiro-rs:amd64-test \
  --load \
  -f Dockerfile .

# 2) 打 tag 到 Docker Hub 仓库
docker tag kiro-rs:amd64-test ianqian1111/kiro-rs:latest

# 3) 推送
docker push ianqian1111/kiro-rs:latest
```

## 3. 校验与排查

### 3.1 查看镜像架构（本地）

```bash
docker image inspect ianqian1111/kiro-rs:latest --format '{{.Os}}/{{.Architecture}}'
```

### 3.2 查看远端 manifest（推荐）

```bash
docker buildx imagetools inspect ianqian1111/kiro-rs:latest
```

### 3.3 常见问题

- **Apple Silicon 上运行 amd64**：需要开启仿真（Docker Desktop 通常已集成），并在 `docker-compose.yml` 中指定 `platform: linux/amd64`（本仓库已支持通过 `DOCKER_DEFAULT_PLATFORM` 覆盖）。
- **只想强制拉取最新镜像**：执行 `docker compose pull` 后再 `docker compose up -d`。

## 4. 使用 docker-compose 直接运行 Docker Hub 镜像

1) 在项目根目录创建 `.env`（至少包含 `API_KEY`）：

```env
API_KEY=sk-kiro-rs-your-secret-key
```

2) 启动：

```bash
docker compose up -d
```

