# Changelog

## [0.1.0] - 2026-05-14

### Added
- **AI Product Studio**: 上传设备文档(PDF/Word/Excel/图片)，AI 自动提取产品配置
  - 多阶段解析流水线：概览分析 → 精细提取 → 推断补全
  - 硬规则推断引擎：数据类型/单位/量程/访问权限自动补全
  - 置信度标注：certain / inferred / guessed / unknown
  - 命令-点位自动关联匹配
- **AI Debug Assistant**: 设备连接异常时 AI 自动诊断并给出修复建议
- **AI Rule Composer**: 自然语言 → 结构化告警/联动规则
- **AI Data Explorer**: 自然语言查询设备数据，AI 自动选图展示
- **AI Dashboard Builder**: 一句话生成监控大屏布局
- **AI Simulator**: 虚拟设备模拟器，硬件未到时即可测试
- **AI Protocol Studio**: 协议文档 → 解析代码生成
- 多 AI 提供商支持：OpenAI / DeepSeek / Ollama / 本地模型
- RESTful API + Swagger 文档
- PostgreSQL + pgvector 数据存储
- Docker Compose 一键部署

### Infrastructure
- CI/CD: GitHub Actions (lint → test → health check smoke)
- Health check with DB status verification
- Multi-stage Docker build with non-root user
- Structured Docker Compose with health checks and log rotation
- Alembic migration framework scaffold
- .gitignore / .dockerignore / .env.example
