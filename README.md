# kiro.rs

基于 [hank9999/kiro.rs](https://github.com/hank9999/kiro.rs) 的个人部署版本。

完整功能文档和配置说明请参考原始仓库：https://github.com/hank9999/kiro.rs

---

## Docker 部署教程

### 前置准备

1. 安装 [Docker](https://docs.docker.com/get-docker/) 和 Docker Compose
2. 获取 `kiro-rs` 二进制文件（见下方说明）
3. 准备好配置文件 `config.json` 和 `credentials.json`

### 目录结构

```
├── Dockerfile            # 多阶段编译（前端 + Rust）
├── Dockerfile.deploy     # 轻量部署镜像
├── docker-compose.yml    # 部署 compose
├── kiro-rs               # 编译好的二进制文件
├── config.json           # 配置文件
└── credentials.json      # 凭证文件
```

### 获取二进制文件

#### 方式一：从 Releases 下载（推荐）

直接从 [Releases](https://github.com/meesii/kiro.rs/releases) 下载已编译好的 `Linux-musl-x64` 版本，解压后即可使用。

#### 方式二：本地 Docker 编译

服务器上编译 Rust 通常很慢，推荐在本地通过 Docker 编译好二进制文件，再传到服务器上构建运行镜像。

```bash
# 使用 Dockerfile 多阶段编译（无需本地安装 Rust 工具链）
docker build -t kiro-rs-build .

# 从编译容器中提取二进制文件
docker create --name temp-kiro kiro-rs-build
docker cp temp-kiro:/app/kiro-rs ./kiro-rs
docker rm temp-kiro
```

### 部署步骤

#### 1. 构建部署镜像

```bash
docker build -f Dockerfile.deploy -t kiro-rs:latest .
```

#### 2. 启动服务

```bash
docker compose up -d
```

服务启动后会监听 `8990` 端口。

#### 3. 查看日志

```bash
docker compose logs -f
```

#### 4. 停止服务

```bash
docker compose down
```

### 配置说明

- 当前目录（`./`）会被挂载到容器内的 `/app/config/`，程序会从中读取 `config.json` 和 `credentials.json`
- 容器内可通过 `host.docker.internal` 访问宿主机网络
- 服务设置了 `restart: unless-stopped`，异常退出后会自动重启

### 更新部署

```bash
# 替换新的 kiro-rs 二进制文件后重新构建
docker build -f Dockerfile.deploy -t kiro-rs:latest .
docker compose up -d
```

### 版本号

Rust 版本号在 `Cargo.toml` 的 `version` 字段中修改。发布时打 tag（如 `git tag v2026.3.1`）会触发 GitHub Actions 自动构建。
