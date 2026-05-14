from __future__ import annotations

"""
Product Studio - AI 驱动的产品智能配置引擎

流程: 文档上传 → 格式解析 → 概览分析 → 精细提取 → 推断补全 → 审核确认
"""

import json
import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIParseSession, Product
from app.models.schemas import AIParseResponse, AIReviewRequest
from app.prompts import (
    PRODUCT_STUDIO_EXTRACTION,
    PRODUCT_STUDIO_OVERVIEW,
)
from app.services.ai_provider import get_ai_provider
from app.services.product_creator import create_product_from_review

# ── 硬规则推断引擎 (无需LLM) ──

UNIT_INFERENCE = [
    ("温度", "℃"), ("temp", "℃"), ("temperature", "℃"),
    ("湿度", "%"), ("humidity", "%"),
    ("电压", "V"), ("voltage", "V"),
    ("电流", "A"), ("current", "A"),
    ("功率", "kW"), ("power", "kW"),
    ("电能", "kWh"), ("energy", "kWh"),
    ("频率", "Hz"), ("frequency", "Hz"),
    ("压力", "MPa"), ("pressure", "MPa"),
    ("流量", "m³/h"), ("flow", "m³/h"),
    ("co2", "ppm"), ("pm25", "μg/m³"),
    ("液位", "m"), ("level", "m"),
    ("开关", ""), ("状态", ""), ("switch", ""),
]

# 范围推断: (keywords_list, (min, max)) - 所有 keywords 必须同时出现
RANGE_INFERENCE = [
    (["工业", "温度"], (-40, 125)),
    (["温度"], (-20, 60)),
    (["湿度"], (0, 100)),
    (["三相", "电压"], (0, 500)),
    (["电压"], (0, 300)),
    (["电流"], (0, 100)),
    (["kwh", "电能"], (0, 999999.9)),
    (["电能"], (0, 999999.9)),
    (["功率"], (0, 1000)),
    (["频率"], (45, 65)),
    (["压力"], (0, 1.6)),
    (["co2"], (0, 5000)),
    (["pm25"], (0, 1000)),
    (["开关"], (0, 1)),
]

# 数据类型推断: keyword → type, 靠前的优先匹配
DATA_TYPE_INFERENCE = [
    ("开关", "bool"), ("bool", "bool"), ("告警", "uint16"),
    ("温度", "int16"), ("temp", "int16"), ("temperature", "int16"),
    ("湿度", "uint16"), ("humidity", "uint16"),
    ("电压", "float32"), ("voltage", "float32"),
    ("电流", "float32"), ("current", "float32"),
    ("功率", "float32"), ("power", "float32"),
    ("电能", "float32"), ("energy", "float32"),
    ("频率", "float32"), ("frequency", "float32"),
    ("压力", "float32"), ("pressure", "float32"),
    ("状态", "uint16"), ("status", "uint16"),
]

# 只读点位关键词
READ_ONLY_KEYWORDS = ["温度", "湿度", "电压", "电流", "功率", "电能", "频率", "测量", "监测", "检测", "读数"]
# 可读写点位关键词
READ_WRITE_KEYWORDS = ["设置", "控制", "阈值", "配置", "参数", "校准"]


def apply_inference_rules(data_points: list[dict]) -> list[dict]:
    """用硬规则补全缺失字段 (不消耗LLM token)"""
    for dp in data_points:
        name_lower = (dp.get("name", "") + dp.get("identifier", "")).lower()

        # 补全 data_type - 按优先级匹配
        if not dp.get("data_type"):
            for keyword, dtype in DATA_TYPE_INFERENCE:
                if keyword in name_lower:
                    dp["data_type"] = dtype
                    dp.setdefault("reasoning", "")
                    dp["reasoning"] += f" 根据关键词'{keyword}'推断数据类型为{dtype};"
                    break

        # 补全 unit - 按优先级匹配
        if not dp.get("unit"):
            for keyword, unit in UNIT_INFERENCE:
                if keyword in name_lower:
                    dp["unit"] = unit
                    break

        # 补全 range - 所有 keywords 必须匹配
        if dp.get("range_min") is None and dp.get("range_max") is None:
            for keywords, (rmin, rmax) in RANGE_INFERENCE:
                if all(kw in name_lower for kw in keywords):
                    dp["range_min"] = rmin
                    dp["range_max"] = rmax
                    dp.setdefault("reasoning", "")
                    dp["reasoning"] += f" 根据行业常识推断范围为[{rmin}, {rmax}];"
                    break

        # 补全 access - 先检查 RW (设置/控制/阈值), 再检查 R (测量/监测)
        if not dp.get("access"):
            if any(kw in name_lower for kw in READ_WRITE_KEYWORDS):
                dp["access"] = "RW"
            elif any(kw in name_lower for kw in READ_ONLY_KEYWORDS):
                dp["access"] = "R"
            else:
                dp["access"] = "R"

    return data_points


def _chinese_word_overlap(name1: str, name2: str) -> bool:
    """检查两个中文名称是否有公共词组 (至少2字符)"""
    for n1, n2 in [(name1, name2), (name2, name1)]:
        for i in range(len(n1) - 1):
            # 检查2字词
            if len(n1[i:i+2]) == 2 and _is_chinese_char(n1[i]) and n1[i:i+2] in n2:
                return True
            # 检查3字词
            if i + 3 <= len(n1) and _is_chinese_char(n1[i]) and n1[i:i+3] in n2:
                return True
    return False


def _is_chinese_char(ch: str) -> bool:
    """判断是否中文字符"""
    return '\u4e00' <= ch <= '\u9fff'


def match_commands_to_points(commands: list[dict], data_points: list[dict]) -> list[dict]:
    """将命令关联到点位"""
    for cmd in commands:
        if cmd.get("related_point_ids"):
            continue  # 已有映射，保留
        cmd_name = cmd.get("name", "") + cmd.get("identifier", "")
        related = []
        for dp in data_points:
            dp_name = dp.get("name", "") + dp.get("identifier", "")
            # 中文: 用字符重叠匹配
            if _chinese_word_overlap(cmd_name, dp_name):
                related.append(dp["identifier"])
                continue
            # 英文: 用分词匹配
            for word in dp.get("identifier", "").replace("_", " ").split():
                if len(word) > 1 and word in cmd.get("identifier", "").lower():
                    related.append(dp["identifier"])
                    break
        if related:
            cmd["related_point_ids"] = list(set(related))
    return commands


# ── 两阶段 AI 解析 ──

class ProductStudioService:
    """产品智能配置服务"""

    def __init__(self):
        self.ai = get_ai_provider()

    async def parse_documents(
        self, files: list[str], product_hint: str = "", db: AsyncSession = None
    ) -> AIParseResponse:
        """主入口: 解析上传的文档"""
        session_id = str(uuid.uuid4())

        # 1. 合并所有文档内容
        content = await self._merge_documents(files)

        # 2. 阶段一: 概览分析
        overview = await self._overview_analysis(content)

        # 3. 阶段二: 精细提取
        extraction = await self._extract_details(content, overview, product_hint)

        # 4. 阶段三: 推断补全
        extraction = self._infer_missing(extraction)

        # 5. 应用硬规则
        extraction["data_points"] = apply_inference_rules(extraction.get("data_points", []))
        extraction["commands"] = match_commands_to_points(
            extraction.get("commands", []), extraction.get("data_points", [])
        )

        # 6. 保存解析会话
        if db:
            session = AIParseSession(
                id=uuid.UUID(session_id),
                status="reviewing",
                uploaded_files=[{"url": f} for f in files],
                raw_analysis={"overview": overview, "extraction": extraction},
                chat_history=[],
            )
            db.add(session)
            await db.commit()

        return AIParseResponse(
            session_id=session_id,
            status="reviewing",
            product=extraction.get("product"),
            data_points=extraction.get("data_points", []),
            commands=extraction.get("commands", []),
            uncertainties=extraction.get("uncertainties", []),
            overall_confidence=extraction.get("overall_confidence", 0.8),
        )

    async def _merge_documents(self, files: list[str]) -> str:
        """合并多文档内容"""
        import os

        import aiofiles
        settings = __import__('app.core.config', fromlist=['get_settings']).get_settings()

        parts = []
        for file_path in files:
            full_path = os.path.join(settings.upload_dir, file_path.lstrip("/"))
            try:
                async with aiofiles.open(full_path) as f:
                    parts.append(await f.read())
            except Exception:
                parts.append(f"[无法读取文件: {file_path}]")

        return "\n\n---\n\n".join(parts)

    async def _overview_analysis(self, content: str) -> dict:
        """阶段一: 概览识别"""
        prompt = PRODUCT_STUDIO_OVERVIEW.replace("{content}", content[:80000])
        try:
            return await self.ai.chat_json([
                {"role": "system", "content": "你是 IoT 协议分析专家。请严格按 JSON 格式回复。"},
                {"role": "user", "content": prompt},
            ])
        except Exception as e:
            return {"protocol_guess": "unknown", "completeness": "unknown", "error": str(e)}

    async def _extract_details(self, content: str, overview: dict, hint: str) -> dict:
        """阶段二: 精细提取"""
        prompt = (PRODUCT_STUDIO_EXTRACTION
                  .replace("{content}", content[:80000])
                  .replace("{overview}", json.dumps(overview, ensure_ascii=False, indent=2))
                  .replace("{hint}", hint or "无"))
        try:
            return await self.ai.chat_json([
                {"role": "system", "content": "你是 IoT 协议分析专家。请严格按 JSON Schema 格式回复，只输出 JSON。"},
                {"role": "user", "content": prompt},
            ])
        except Exception as e:
            return {"product": {}, "data_points": [], "commands": [], "uncertainties": [],
                    "overall_confidence": 0.0, "error": str(e)}

    def _infer_missing(self, extraction: dict) -> dict:
        """阶段三: 基于规则的推断补全 (已包含在 apply_inference_rules 中)"""
        return extraction

    async def review_and_create(
        self, review: AIReviewRequest, db: AsyncSession
    ) -> Product:
        """审核通过后创建产品 - delegates to product_creator service (SRP)."""
        review_dict = {
            "product": review.product,
            "data_points": review.data_points,
            "commands": review.commands,
        }
        return await create_product_from_review(review_dict, review.session_id, db)


# 单例
_product_studio: Optional[ProductStudioService] = None


def get_product_studio() -> ProductStudioService:
    global _product_studio
    if _product_studio is None:
        _product_studio = ProductStudioService()
    return _product_studio
