from __future__ import annotations

"""
Module 5: AI Dashboard Builder - 智能面板构建
"""

import json

from app.prompts import DASHBOARD_BUILDER
from app.services.ai_provider import get_ai_provider


class DashboardBuilderService:
    """Auto-generate dashboard layout"""

    def __init__(self):
        self.ai = get_ai_provider()

    async def build(self, nl_text: str, available_points: list[dict]) -> dict:
        prompt = DASHBOARD_BUILDER.format(
            nl_text=nl_text,
            available_points=json.dumps(available_points, ensure_ascii=False, indent=2),
        )
        try:
            return await self.ai.chat_json([
                {"role": "system", "content": "你是 IoT 大屏设计专家。"},
                {"role": "user", "content": prompt},
            ])
        except Exception as e:
            return {"dashboard_name": "监控面板", "error": str(e)}


_dashboard_builder = None


def get_dashboard_builder() -> DashboardBuilderService:
    global _dashboard_builder
    if _dashboard_builder is None:
        _dashboard_builder = DashboardBuilderService()
    return _dashboard_builder
