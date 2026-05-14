# 系统架构设计文档

## 1. 架构概览

```
                                    ┌──────────────────────────┐
                                    │      前端 SPA (React)     │
                                    │  产品创建 / 大屏 / 调试   │
                                    └────────────┬─────────────┘
                                                 │ HTTP / WebSocket
                                    ┌─────────────▼─────────────┐
                                    │       API Gateway          │
                                    │     FastAPI + CORS         │
                                    └──────┬──────────────┬─────┘
                                           │              │
                           ┌───────────────▼──┐    ┌──────▼──────────┐
                           │  AI Service 层   │    │  IoT Core 层     │
                           │                  │    │                  │
                           │ Product Studio  │    │ MQTT Broker     │
                           │ Debug Assistant │    │ Modbus Gateway  │
                           │ Rule Composer   │    │ Device Registry │
                           │ Data Explorer   │    │ Telemetry Store │
                           │ Dashboard Builder│   │ Command Dispatch │
                           │ Simulator       │    │                  │
                           │ Protocol Studio │    │                  │
                           └──────┬──────────┘    └──────┬───────────┘
                                  │                      │
                    ┌─────────────▼──┐        ┌──────────▼───────────┐
                    │   LLM Provider │        │   PostgreSQL 16      │
                    │                │        │   + pgvector (RAG)   │
                    │ OpenAI/DeepSeek│        │   + TimescaleDB      │
                    │ Ollama/Local   │        └──────────────────────┘
                    └────────────────┘
                                              ┌──────────────────┐
                                              │   Redis           │
                                              │ 缓存/消息队列/      │
                                              │ WebSocket PubSub  │
                                              └──────────────────┘
```

## 2. AI 服务层设计

### 2.1 AI Provider 抽象

```python
# 统一的 AI 调用接口，屏蔽不同提供商的差异
class AIProvider(ABC):
    async def chat(self, messages: list[dict]) -> str: ...
    async def chat_json(self, messages: list[dict]) -> dict: ...

# 所有兼容 OpenAI 接口的提供商可直接复用
OpenAIProvider    # api.openai.com
DeepSeekProvider  # api.deepseek.com
OllamaProvider    # localhost:11434
AzureProvider     # *.openai.azure.com
```

### 2.2 多阶段 Pipeline (以 Product Studio 为例)

```
┌──────────┐   ┌──────────┐   ┌──────────┐
│ 阶段一    │   │ 阶段二    │   │ 阶段三    │
│ 概览分析   │→  │ 精细提取   │→  │ 推断补全   │
│          │   │          │   │          │
│ 协议识别   │   │ 点位提取   │   │ 缺失字段   │
│ 完整性评估  │   │ 命令提取   │   │ 映射关系   │
│ 功能分类   │   │ 关系提取   │   │ 默认值     │
└──────────┘   └──────────┘   └──────────┘
     LLM           LLM           规则引擎
```

设计理由:
1. **阶段一轻量**: 快速评估文档质量，协议识别所需 token 少
2. **阶段二精细**: 有概览作为上下文，提取更准确
3. **阶段三不用 LLM**: 确定性规则补全，节省成本且准确

### 2.3 规则引擎 vs LLM

| 场景 | LLM | 规则引擎 |
|------|-----|---------|
| 从文档提取点位名称 | ✔ | ✘ |
| 推断温度单位=℃ | ✔ 但浪费 | ✔ 快速准确 |
| 推断 Modbus 功能码 | ✔ 准确性一般 | ✔ 协议规范 |
| 命令-点位关联 | ✔ 语义理解 | ✔ 关键词匹配 |
| 私有协议解析 | ✔ 唯一方案 | ✘ |

### 2.4 知识库 RAG

```
产品审核确认 → 向量化嵌入 → 存入 pgvector
                                ↓
新设备解析时 → 检索相似产品的点位配置 → 辅助推断
                                ↓
        例: 历史温湿度传感器的点位定义 → 参考补全新传感器
```

## 3. 数据模型

### 核心实体关系

```
Product (产品)
 ├── 1:N → DataPoint (点位)
 ├── 1:N → Command (命令)
 │         └── N:M → DataPoint (通过 CommandPointMapping)
 └── 1:N → Device (设备实例)
            └── 1:N → Telemetry (遥测数据)

Rule (规则)         Dashboard (面板)      KnowledgeEntry (知识)
 独立于产品           独立于产品             关联到产品
```

### 关键字段说明

- **DataPoint.ai_confidence**: AI 解析置信度，用于前端高亮低置信度字段
- **DataPoint.needs_review**: 是否需要人工确认
- **KnowledgeEntry.embedding**: pgvector 向量，用于相似产品检索

## 4. 部署架构

### 最小部署 (单机)

```
docker-compose up -d
┌─────────────────────────────────────────┐
│  frontend:3000  │  backend:8000         │
│  postgres:5432  │  redis:6379           │
└─────────────────────────────────────────┘
```

### 生产部署

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Nginx     │  │ Backend×3 │  │ Worker×2  │
│ (LB)     │  │          │  │ (Celery)  │
└────┬─────┘  └────┬─────┘  └────┬─────┘
     │             │             │
     └─────────────┼─────────────┘
                   │
     ┌─────────────┼─────────────┐
     │   PostgreSQL (主从)        │
     │   Redis Cluster           │
     │   MQTT Broker (EMQX)      │
     └───────────────────────────┘
```
