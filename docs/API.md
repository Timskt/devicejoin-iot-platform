# API 接口文档

## 基础信息

- **Base URL**: `http://localhost:8000/api/v1`
- **Swagger UI**: `http://localhost:8000/docs`
- **Content-Type**: `application/json`

---

## 1. 健康检查

### GET /health

```bash
curl http://localhost:8000/health
```

响应:
```json
{"status": "ok", "version": "0.1.0"}
```

---

## 2. 产品管理

### 2.1 创建产品 (手动)

**POST** `/api/v1/products`

```json
{
  "name": "温湿度传感器",
  "model": "TH-100",
  "manufacturer": "某科技有限公司",
  "protocol": "modbus_rtu",
  "description": "工业级温湿度传感器",
  "tags": ["温湿度", "Modbus"],
  "data_points": [
    {
      "identifier": "temperature_1",
      "name": "温度",
      "description": "环境温度测量值",
      "category": "环境",
      "register": "40001",
      "data_type": "int16",
      "unit": "℃",
      "access": "R",
      "scale": 1.0,
      "precision": 1,
      "range_min": -40,
      "range_max": 125
    },
    {
      "identifier": "humidity_1",
      "name": "湿度",
      "category": "环境",
      "register": "40002",
      "data_type": "uint16",
      "unit": "%",
      "access": "R",
      "range_min": 0,
      "range_max": 100
    }
  ],
  "commands": [
    {
      "identifier": "read_all",
      "name": "读取全部数据",
      "method": "03",
      "parameters": [],
      "related_point_ids": ["temperature_1", "humidity_1"]
    }
  ]
}
```

### 2.2 AI 解析文档

**POST** `/api/v1/products/ai/parse`

**请求**:
```json
{
  "files": ["uploads/doc1.pdf", "uploads/points.xlsx"],
  "product_hint": "这是一个工业温湿度传感器，Modbus RTU 协议"
}
```

**响应** (AI 解析结果):
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "reviewing",
  "product": {
    "name": "工业温湿度传感器",
    "model": "TH-100",
    "manufacturer": "某科技",
    "protocol": "modbus_rtu",
    "description": "...",
    "tags": ["温湿度", "工业"]
  },
  "data_points": [
    {
      "identifier": "temperature_1",
      "name": "温度",
      "register": "40001",
      "data_type": "int16",
      "unit": "℃",
      "range_min": -40,
      "range_max": 125,
      "access": "R",
      "confidence": "certain",
      "reasoning": "文档第3页寄存器表明确标注",
      "source": "doc1.pdf 第3页"
    },
    {
      "identifier": "humidity_1",
      "name": "湿度",
      "register": "40002",
      "data_type": "uint16",
      "unit": "%",
      "range_min": 0,
      "range_max": 100,
      "confidence": "inferred",
      "reasoning": "根据行业常识推断湿度范围为0-100%",
      "source": "doc1.pdf 第3页"
    }
  ],
  "commands": [...],
  "uncertainties": [
    {
      "field": "data_points[1].range_max",
      "reason": "文档未明确说明湿度上限",
      "suggestion": "100 (行业常识)"
    }
  ],
  "overall_confidence": 0.85
}
```

### 2.3 AI 审核确认并创建产品

**POST** `/api/v1/products/ai/review`

```json
{
  "session_id": "550e8400-...",
  "product": { "name": "工业温湿度传感器", "model": "TH-100", "manufacturer": "某科技", "protocol": "modbus_rtu" },
  "data_points": [{...}],
  "commands": [{...}]
}
```

响应: `201 Created` + ProductResponse

---

## 3. AI 智能模块

### 3.1 调试助手

**POST** `/api/v1/ai/debug`

```json
{
  "device_id": "device-uuid",
  "logs": [
    "[2024-01-01 10:00:00] Modbus Read Error: Timeout on register 40001",
    "[2024-01-01 10:00:05] Connection retry failed"
  ],
  "error_message": "设备无法连接",
  "context": "设备刚上电，之前连接正常"
}
```

响应:
```json
{
  "diagnosis": "设备通信超时，可能原因：电源未稳定、网络线路松动、波特率不匹配",
  "possible_causes": [
    {"cause": "485总线终端电阻缺失", "probability": 0.7, "evidence": "..."},
    {"cause": "波特率配置不匹配", "probability": 0.5, "evidence": "..."}
  ],
  "suggestions": [
    {"step": 1, "action": "检查设备电源指示灯是否常亮", "expected_result": "指示灯常亮", "command_hint": null},
    {"step": 2, "action": "确认485总线A/B线连接正确", "expected_result": "A接A，B接B", "command_hint": null},
    {"step": 3, "action": "尝试降低波特率至9600", "expected_result": "通信恢复", "command_hint": "修改设备配置寄存器"}
  ],
  "confidence": 0.75
}
```

### 3.2 规则编排

**POST** `/api/v1/ai/rules/compose`

```json
{
  "text": "温度超过80度持续5分钟，发短信给运维人员并记录日志",
  "context_product_ids": ["product-uuid"]
}
```

响应:
```json
{
  "rule_name": "高温告警",
  "rule_type": "alert",
  "trigger": {
    "metric": "temperature_1",
    "operator": "gt",
    "value": 80,
    "duration_seconds": 300
  },
  "actions": [
    {"type": "notify", "config": {"channels": ["sms"]}},
    {"type": "log_event", "config": {"level": "warning"}}
  ],
  "warnings": ["高温期间可能频繁触发，建议设置告警冷却时间"]
}
```

### 3.3 数据探索

**POST** `/api/v1/ai/data/explore`

```json
{
  "text": "本周用电最多的5台设备，按降序排列",
  "device_ids": ["uuid-1", "uuid-2"],
  "time_range": "7d"
}
```

响应:
```json
{
  "text": "本周用电最多的5台设备，按降序排列",
  "sql": "SELECT device_id, SUM(value) as total FROM telemetries WHERE point_id='energy_total' AND reported_at > NOW() - INTERVAL '7 days' GROUP BY device_id ORDER BY total DESC LIMIT 5",
  "data": [...],
  "visualization": {
    "type": "bar",
    "title": "本周用电排行",
    "x_axis": "设备",
    "y_axis": "用电量(kWh)"
  },
  "explanation": "查询了过去7天各设备的累计用电量，按降序排列"
}
```

### 3.4 面板构建

**POST** `/api/v1/ai/dashboards/build`

```json
{
  "text": "工厂1号车间环境监控大屏，包含温湿度、CO2、PM2.5",
  "product_ids": ["product-uuid"],
  "device_ids": ["device-uuid"]
}
```

### 3.5 启动模拟器

**POST** `/api/v1/ai/simulator/start`

```json
{
  "product_id": "product-uuid",
  "device_count": 10,
  "interval_seconds": 60,
  "duration_seconds": 3600,
  "anomaly_probability": 0.05
}
```

---

## 4. 批量操作

### 产品列表 (支持筛选)

**GET** `/api/v1/products?status=active&protocol=modbus_rtu&search=温湿度&limit=20&offset=0`

### 产品点位

**GET** `/api/v1/products/{product_id}/points`

### 产品命令

**GET** `/api/v1/products/{product_id}/commands`

---

## 错误码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 204 | 删除成功 (无响应体) |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 (通常是 LLM 调用失败) |
