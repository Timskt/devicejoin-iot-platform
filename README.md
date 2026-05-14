# DeviceJoin IoT Platform

> AI-powered IoT platform that eliminates the need for developers in device onboarding and management.

## 核心能力

| 模块 | 说明 | 用户价值 |
|------|------|---------|
| **AI Product Studio** | 上传设备文档 → AI 自动生成产品配置 | 无需开发人员分析协议文档 |
| **AI Debug Assistant** | 设备异常 → AI 自动诊断并给出修复建议 | 运维人员独立排查故障 |
| **AI Rule Composer** | 自然语言 → 告警/联动规则 | "温度超过80度报警" 即生成规则 |
| **AI Data Explorer** | 自然语言查询设备数据 | "本周用电最多的5台设备" |
| **AI Dashboard Builder** | 一句话构建监控大屏 | "工厂1号车间环境监控大屏" |
| **AI Simulator** | 自动生成虚拟设备模拟数据 | 硬件未到即可开始测试 |
| **AI Protocol Studio** | 协议文档 → 解析代码 | 私有协议也无需手写代码 |

## 快速启动

### 前置要求
- Python 3.12+
- Docker & Docker Compose
- LLM API Key (OpenAI / DeepSeek / Ollama)

### 5 分钟启动

```bash
# 1. 克隆项目 (或进入目录)
cd DeviceJoinIot

# 2. 配置 LLM
cp .env.example .env
# 编辑 .env: 填入你的 LLM_API_KEY

# 3. 一键启动
docker-compose up -d

# 4. 验证
curl http://localhost:8000/health
# → {"status":"ok","version":"0.1.0"}
```

### 本地开发

```bash
cd backend

# 安装 uv (Python 包管理器)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 安装依赖
uv pip install --system -e ".[dev]"

# 启动 PostgreSQL + Redis
docker-compose up -d postgres redis

# 启动后端
uvicorn app.main:app --reload --port 8000

# 运行测试
pytest tests/ -v
```

## API 概览

```
POST   /api/v1/products/ai/parse     # AI 解析设备文档
POST   /api/v1/products/ai/review    # 审核确认，创建产品
POST   /api/v1/products               # 手动创建产品
GET    /api/v1/products               # 产品列表

POST   /api/v1/ai/debug              # AI 设备调试
POST   /api/v1/ai/rules/compose      # NL → 规则
POST   /api/v1/ai/rules              # 创建规则
POST   /api/v1/ai/data/explore       # NL → 数据查询
POST   /api/v1/ai/dashboards/build   # 自动生成面板
POST   /api/v1/ai/dashboards         # 创建面板
POST   /api/v1/ai/simulator/start    # 启动模拟
```

完整 API 文档: 启动后访问 `http://localhost:8000/docs`

## 项目结构

```
DeviceJoinIot/
├── backend/                         # Python FastAPI 后端
│   ├── app/
│   │   ├── api/                     # REST API 路由
│   │   ├── services/                # 7 个 AI 服务模块
│   │   │   ├── product_studio/      # AI 产品智能配置
│   │   │   ├── debug_assistant/     # AI 调试助手
│   │   │   ├── rule_composer/       # AI 规则编排
│   │   │   ├── data_explorer/       # AI 数据探索
│   │   │   ├── dashboard_builder/   # AI 面板构建
│   │   │   ├── simulator/           # AI 模拟器
│   │   │   └── protocol_studio/     # AI 协议适配
│   │   ├── models/                  # 数据库模型 & Pydantic Schema
│   │   ├── prompts/                 # AI Prompt 模板库
│   │   └── core/                    # 配置、数据库、依赖
│   ├── tests/                       # 完整测试套件
│   ├── pyproject.toml               # uv 依赖管理
│   └── Dockerfile
├── frontend/                        # 前端 (React + TypeScript)
├── docs/                            # 项目文档
├── docker-compose.yml               # 一键部署
└── .env.example
```

## 技术栈

- **后端**: Python 3.12 + FastAPI + SQLAlchemy (async)
- **数据库**: PostgreSQL 16 + pgvector (向量检索)
- **缓存**: Redis
- **AI**: OpenAI 兼容接口 (支持 OpenAI / DeepSeek / Ollama / Azure)
- **前端**: React 18 + TypeScript + shadcn/ui
- **部署**: Docker Compose
- **包管理**: uv

## 文档索引

- [产品需求文档 (PRD)](docs/PRD.md)
- [架构设计文档](docs/ARCHITECTURE.md)
- [API 接口文档](docs/API.md)
- [用户使用指南](docs/USER_GUIDE.md)
