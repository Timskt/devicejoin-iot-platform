import enum
import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class ProtocolType(str, enum.Enum):
    MODBUS_RTU = "modbus_rtu"
    MODBUS_TCP = "modbus_tcp"
    MQTT = "mqtt"
    HTTP = "http"
    BACNET = "bacnet"
    OPC_UA = "opc_ua"
    CUSTOM_SERIAL = "custom_serial"


class DataType(str, enum.Enum):
    INT16 = "int16"
    UINT16 = "uint16"
    INT32 = "int32"
    UINT32 = "uint32"
    FLOAT32 = "float32"
    FLOAT64 = "float64"
    BOOL = "bool"
    STRING = "string"


class AccessType(str, enum.Enum):
    READ = "R"
    WRITE = "W"
    READ_WRITE = "RW"


class ConfidenceLevel(str, enum.Enum):
    CERTAIN = "certain"
    INFERRED = "inferred"
    GUESSED = "guessed"
    UNKNOWN = "unknown"


class ProductStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    DEPRECATED = "deprecated"


# ──────────────────────────────────────────────────────────────
# 产品 & 点位 & 命令
# ──────────────────────────────────────────────────────────────

class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False, index=True)
    model = Column(String(100), nullable=False)
    manufacturer = Column(String(200))
    protocol = Column(String(50), nullable=False)
    description = Column(Text)
    tags = Column(JSON, default=[])  # JSON兼容 SQLite 和 PostgreSQL

    status = Column(String(20), default=ProductStatus.DRAFT.value)

    # 来源：哪些文档被解析得到此产品
    source_documents = Column(JSON, default=[])  # [{filename, page, excerpt}]
    ai_confidence = Column(Float)  # 0-1 整体解析置信度

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    data_points = relationship("DataPoint", back_populates="product", cascade="all, delete-orphan")
    commands = relationship("Command", back_populates="product", cascade="all, delete-orphan")
    devices = relationship("Device", back_populates="product")


class DataPoint(Base):
    __tablename__ = "data_points"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    identifier = Column(String(100), nullable=False)      # 如 "temperature_1"
    name = Column(String(200), nullable=False)             # 如 "温度传感器1"
    description = Column(Text)
    category = Column(String(50))                          # 分类：环境/电气/状态/控制

    # 协议相关
    register = Column(String(50))                          # Modbus地址 或 MQTT Topic
    data_type = Column(String(20), nullable=False)
    unit = Column(String(20))
    access = Column(String(10), default=AccessType.READ.value)
    scale = Column(Float, default=1.0)                     # 缩放系数
    offset = Column(Float, default=0.0)                    # 偏移量
    precision = Column(Integer, default=1)                 # 小数位

    # 约束
    range_min = Column(Float)
    range_max = Column(Float)
    enum_values = Column(JSON)                             # 枚举值 {"0":"关闭","1":"开启"}

    # AI相关
    ai_confidence = Column(String(20), default=ConfidenceLevel.UNKNOWN.value)
    ai_reasoning = Column(Text)                            # AI推断理由
    needs_review = Column(Boolean, default=False)          # 是否需要人工确认

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", back_populates="data_points")
    command_mappings = relationship("CommandPointMapping", back_populates="data_point",
                                    cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_dp_product_identifier", "product_id", "identifier", unique=True),
    )


class Command(Base):
    __tablename__ = "commands"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)

    identifier = Column(String(100), nullable=False)       # 如 "set_temperature"
    name = Column(String(200), nullable=False)              # 如 "设置温度"
    description = Column(Text)
    method = Column(String(20))                             # GET/POST/PUBLISH 或功能码 03/06
    parameters = Column(JSON, default=[])                   # [{"name":"value","type":"int16","required":true,"range":{"min":-40,"max":125}}]
    response_schema = Column(JSON)                          # 响应格式
    timeout_ms = Column(Integer, default=5000)

    ai_confidence = Column(String(20), default=ConfidenceLevel.UNKNOWN.value)
    needs_review = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", back_populates="commands")
    point_mappings = relationship("CommandPointMapping", back_populates="command",
                                   cascade="all, delete-orphan")


class CommandPointMapping(Base):
    """命令与点位的映射关系"""
    __tablename__ = "command_point_mappings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    command_id = Column(UUID(as_uuid=True), ForeignKey("commands.id", ondelete="CASCADE"), nullable=False)
    point_id = Column(UUID(as_uuid=True), ForeignKey("data_points.id", ondelete="CASCADE"), nullable=False)
    relation = Column(String(20), nullable=False)           # WRITE_TO / READ_FROM / TRIGGER

    command = relationship("Command", back_populates="point_mappings")
    data_point = relationship("DataPoint", back_populates="command_mappings")


# ──────────────────────────────────────────────────────────────
# 设备
# ──────────────────────────────────────────────────────────────

class DeviceStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    ERROR = "error"
    MAINTENANCE = "maintenance"


class Device(Base):
    __tablename__ = "devices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True)

    name = Column(String(200), nullable=False)
    device_id = Column(String(100), nullable=False, unique=True, index=True)  # 设备唯一ID
    secret = Column(String(200))                              # 设备密钥
    status = Column(String(20), default=DeviceStatus.OFFLINE.value)
    connection_info = Column(JSON)                            # {ip, port, slave_id, ...}
    last_online_at = Column(DateTime)
    metadata_ = Column("metadata", JSON)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", back_populates="devices")
    telemetries = relationship("Telemetry", back_populates="device", cascade="all, delete-orphan")


class Telemetry(Base):
    __tablename__ = "telemetries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    point_id = Column(UUID(as_uuid=True), ForeignKey("data_points.id"), nullable=False)

    value = Column(Float, nullable=False)
    raw_value = Column(String)                                # 原始报文
    quality = Column(Integer, default=0)                      # 数据质量 0-100
    reported_at = Column(DateTime, nullable=False, index=True)

    device = relationship("Device", back_populates="telemetries")


# ──────────────────────────────────────────────────────────────
# 告警规则
# ──────────────────────────────────────────────────────────────

class RuleType(str, enum.Enum):
    ALERT = "alert"
    AUTOMATION = "automation"


class Rule(Base):
    __tablename__ = "rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    rule_type = Column(String(20), nullable=False)            # alert / automation
    description = Column(Text)

    # 触发条件 JSON
    trigger = Column(JSON, nullable=False)
    # {"metric": "temperature", "operator": "gt", "value": 80, "duration_seconds": 300}

    # 执行动作 JSON
    actions = Column(JSON, nullable=False)
    # 告警: [{"type":"notify","channels":["sms","email"],"template":"..."}]
    # 联动: [{"type":"send_command","device_id":"...","command":"set_temp","params":{"value":25}}]

    enabled = Column(Boolean, default=True)
    scope = Column(JSON)                                     # {"product_ids":[], "device_ids":[], "all":false}

    # AI来源
    ai_generated = Column(Boolean, default=False)
    ai_prompt = Column(Text)                                 # 用户原始自然语言描述

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ──────────────────────────────────────────────────────────────
# 仪表盘
# ──────────────────────────────────────────────────────────────

class Dashboard(Base):
    __tablename__ = "dashboards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    description = Column(Text)

    layout = Column(JSON, nullable=False)
    # [{"type":"gauge","title":"温度","point_id":"...","position":{"x":0,"y":0,"w":4,"h":3}},
    #  {"type":"line_chart","title":"温度趋势","point_ids":["..."],"position":{...}}]

    ai_generated = Column(Boolean, default=False)
    ai_prompt = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ──────────────────────────────────────────────────────────────
# AI 解析会话 (用于多轮交互确认)
# ──────────────────────────────────────────────────────────────

class AIParseSession(Base):
    __tablename__ = "ai_parse_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status = Column(String(20), default="uploaded")          # uploaded/parsing/reviewing/confirmed

    uploaded_files = Column(JSON, default=[])
    raw_analysis = Column(JSON)                              # AI第一轮完整结果
    confirmed_product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=True)
    chat_history = Column(JSON, default=[])                  # 多轮对话记录

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ──────────────────────────────────────────────────────────────
# 知识库 (向量化存储的历史信息)
# ──────────────────────────────────────────────────────────────

class KnowledgeEntry(Base):
    __tablename__ = "knowledge_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=True)
    content = Column(Text, nullable=False)
    content_type = Column(String(50))                        # data_point / command / product / protocol_doc
    embedding = Column(String)                               # pgvector 向量 (通过原生SQL插入)
    metadata_ = Column("metadata", JSON)

    created_at = Column(DateTime, default=datetime.utcnow)
