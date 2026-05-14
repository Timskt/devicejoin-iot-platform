from __future__ import annotations

"""
Module 2: AI Debug Assistant - 智能调试助手
"""

import json

from app.prompts import DEBUG_ASSISTANT
from app.services.ai_provider import get_ai_provider


class DebugAssistantService:
    """设备调试智能助手"""

    def __init__(self):
        self.ai = get_ai_provider()

    async def diagnose(self, device_info: dict, product_points: dict,
                       logs: list[str], context: str) -> dict:
        prompt = DEBUG_ASSISTANT.format(
            device_info=json.dumps(device_info, ensure_ascii=False, indent=2),
            product_points=json.dumps(product_points, ensure_ascii=False, indent=2),
            logs="\n".join(logs) if logs else "无日志",
            context=context or "无额外上下文",
        )
        try:
            return await self.ai.chat_json([
                {"role": "system", "content": "你是 IoT 调试专家，请严格按 JSON 回复。"},
                {"role": "user", "content": prompt},
            ])
        except Exception as e:
            return {
                "diagnosis": f"分析失败: {e}",
                "possible_causes": [],
                "suggestions": [{"step": 1, "action": "请检查设备电源和网络连接",
                                 "expected_result": "设备恢复在线", "command_hint": None}],
                "confidence": 0.0,
            }


_debug_assistant = None


def get_debug_assistant() -> DebugAssistantService:
    global _debug_assistant
    if _debug_assistant is None:
        _debug_assistant = DebugAssistantService()
    return _debug_assistant
