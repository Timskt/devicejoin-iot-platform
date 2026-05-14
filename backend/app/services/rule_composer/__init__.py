from __future__ import annotations

"""
Module 3: AI Rule Composer - 智能规则编排
"""

import json

from app.prompts import RULE_COMPOSER
from app.services.ai_provider import get_ai_provider


class RuleComposerService:
    """自然语言 → 规则结构"""

    def __init__(self):
        self.ai = get_ai_provider()

    async def compose(self, nl_text: str, available_points: list[dict],
                      available_commands: list[dict]) -> dict:
        prompt = RULE_COMPOSER.format(
            nl_text=nl_text,
            available_points=json.dumps(available_points, ensure_ascii=False, indent=2),
            available_commands=json.dumps(available_commands, ensure_ascii=False, indent=2),
        )
        try:
            return await self.ai.chat_json([
                {"role": "system", "content": "你是 IoT 规则引擎专家。"},
                {"role": "user", "content": prompt},
            ])
        except Exception as e:
            return {"rule_name": "未命名规则", "error": str(e)}


_rule_composer = None


def get_rule_composer() -> RuleComposerService:
    global _rule_composer
    if _rule_composer is None:
        _rule_composer = RuleComposerService()
    return _rule_composer
