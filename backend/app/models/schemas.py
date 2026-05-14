from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# ── 产品 ──
class DataPointCreate(BaseModel):
    model_config = {"protected_namespaces": ()}
    identifier: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    register: Optional[str] = None
    data_type: str = "float32"
    unit: Optional[str] = None
    access: str = "R"
    scale: float = 1.0
    offset: float = 0.0
    precision: int = 1
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    enum_values: Optional[dict] = None


class CommandParam(BaseModel):
    name: str
    type: str = "int16"
    required: bool = True
    range: Optional[dict] = None
    description: Optional[str] = None


class CommandCreate(BaseModel):
    identifier: str
    name: str
    description: Optional[str] = None
    method: Optional[str] = None
    parameters: list[CommandParam] = []
    related_point_ids: list[str] = []


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    model: str
    manufacturer: Optional[str] = None
    protocol: str
    description: Optional[str] = None
    tags: list[str] = []
    data_points: list[DataPointCreate] = []
    commands: list[CommandCreate] = []


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    manufacturer: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    status: Optional[str] = None


class ProductResponse(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    name: str
    model: str
    manufacturer: Optional[str]
    protocol: str
    description: Optional[str]
    tags: list[str]
    status: str
    source_documents: list
    ai_confidence: Optional[float]
    created_at: datetime
    updated_at: datetime

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)


# ── AI 解析 ──
class AIParseRequest(BaseModel):
    files: list[str] = Field(..., description="上传后的文件URL列表")
    product_hint: Optional[str] = Field(None, description="用户对产品的补充描述")
    conversation_id: Optional[str] = None


class AIParseDataPoint(BaseModel):
    model_config = {"protected_namespaces": ()}
    identifier: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    register: Optional[str] = None
    data_type: Optional[str] = None
    unit: Optional[str] = None
    access: str = "R"
    scale: float = 1.0
    offset: float = 0.0
    precision: int = 1
    range_min: Optional[float] = None
    range_max: Optional[float] = None
    enum_values: Optional[dict] = None
    confidence: str = "unknown"
    reasoning: Optional[str] = None
    source: Optional[str] = None


class AIParseCommand(BaseModel):
    identifier: str
    name: str
    description: Optional[str] = None
    method: Optional[str] = None
    parameters: list[dict] = []
    related_point_ids: list[str] = []
    confidence: str = "unknown"
    reasoning: Optional[str] = None


class AIParseUncertainty(BaseModel):
    field: str
    reason: str
    suggestion: Optional[str] = None


class AIParseResponse(BaseModel):
    session_id: str
    status: str
    product: Optional[dict] = None
    data_points: list[AIParseDataPoint] = []
    commands: list[AIParseCommand] = []
    uncertainties: list[AIParseUncertainty] = []
    overall_confidence: float = 0.0
    raw_analysis: Optional[dict] = None


class AIReviewRequest(BaseModel):
    session_id: str
    data_points: list[dict]
    commands: list[dict]
    product: dict


# ── 告警规则 ──
class RuleCreate(BaseModel):
    name: str
    rule_type: str
    description: Optional[str] = None
    trigger: dict
    actions: list[dict]
    scope: Optional[dict] = None
    natural_language: Optional[str] = None  # 用户原始NL描述


class RuleNLRequest(BaseModel):
    text: str = Field(..., description="自然语言描述: 如'温度超过80度持续5分钟报警'")
    context_product_ids: Optional[list[str]] = None


# ── 仪表盘 ──
class DashboardCreate(BaseModel):
    name: str
    description: Optional[str] = None
    layout: list[dict]
    ai_generated: bool = False
    ai_prompt: Optional[str] = None


class DashboardNLRequest(BaseModel):
    text: str = Field(..., description="自然语言: 如'车间的环境监控大屏'")
    product_ids: list[str]
    device_ids: Optional[list[str]] = None


# ── 数据查询 ──
class DataQueryRequest(BaseModel):
    text: str = Field(..., description="自然语言查询")
    device_ids: Optional[list[str]] = None
    time_range: Optional[str] = None  # 1h / 24h / 7d / 30d


class DataQueryResponse(BaseModel):
    text: str
    sql: Optional[str] = None
    data: list[dict]
    visualization: Optional[dict] = None  # {"type":"line","config":{...}}
    explanation: str


# ── 调试 ──
class DebugRequest(BaseModel):
    device_id: str
    logs: Optional[list[str]] = None
    error_message: Optional[str] = None
    context: Optional[str] = None


class DebugResponse(BaseModel):
    diagnosis: str
    possible_causes: list[dict]
    suggestions: list[dict]
    confidence: float


# ── 模拟器 ──
class SimulatorStartRequest(BaseModel):
    product_id: str
    device_count: int = Field(1, ge=1, le=100)
    interval_seconds: int = Field(60, ge=1)
    duration_seconds: int = Field(3600, ge=60)
    anomaly_probability: float = Field(0.0, ge=0, le=1)
