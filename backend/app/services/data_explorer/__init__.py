from __future__ import annotations

"""
Module 4: AI Data Explorer - 智能数据探索
"""

import json

from app.prompts import DATA_EXPLORER
from app.services.ai_provider import get_ai_provider


class DataExplorerService:
    """自然语言 → 数据查询 + 可视化推荐"""

    def __init__(self):
        self.ai = get_ai_provider()

    async def explore(self, nl_text: str, available_sources: list[dict]) -> dict:
        prompt = DATA_EXPLORER.format(
            nl_text=nl_text,
            available_sources=json.dumps(available_sources, ensure_ascii=False, indent=2),
        )
        try:
            return await self.ai.chat_json([
                {"role": "system", "content": "你是 IoT 数据分析专家。"},
                {"role": "user", "content": prompt},
            ])
        except Exception as e:
            return {"intent": "查询", "explanation": f"分析出错: {e}"}


_data_explorer = None


def get_data_explorer() -> DataExplorerService:
    global _data_explorer
    if _data_explorer is None:
        _data_explorer = DataExplorerService()
    return _data_explorer
