from __future__ import annotations

"""
AI Provider 抽象层 - 支持多种模型提供商

用法:
    from app.services.ai_provider import get_ai_provider
    
    provider = get_ai_provider()
    result = await provider.chat([
        {"role": "system", "content": "..."},
        {"role": "user", "content": "..."}
    ])
"""

from abc import ABC, abstractmethod
from typing import Optional

from openai import AsyncOpenAI

from app.core.config import get_settings


class AIProvider(ABC):
    """AI 模型提供商基类"""

    @abstractmethod
    async def chat(self, messages: list[dict], **kwargs) -> str:
        """发送对话消息，返回文本响应"""

    @abstractmethod
    async def chat_json(self, messages: list[dict], **kwargs) -> dict:
        """发送对话消息，返回 JSON 结构化响应"""


class DummyAIProvider(AIProvider):
    """占位 Provider - 无 API Key 时使用，返回模拟数据"""

    async def chat(self, messages: list[dict], **kwargs) -> str:
        return '{"error": "no_api_key", "message": "请配置 LLM_API_KEY 环境变量"}'

    async def chat_json(self, messages: list[dict], **kwargs) -> dict:
        return {"error": "no_api_key", "message": "请配置 LLM_API_KEY 环境变量"}


class OpenAIProvider(AIProvider):
    """OpenAI 兼容接口 (支持 OpenAI / Azure / 本地 Ollama / vLLM)"""

    def __init__(self):
        settings = get_settings()
        self._no_key = not settings.llm_api_key or settings.llm_api_key == "sk-your-key-here"
        self.model = settings.llm_model
        if not self._no_key:
            self.client = AsyncOpenAI(
                api_key=settings.llm_api_key,
                base_url=settings.llm_api_base,
            )
        else:
            self.client = None

    async def chat(self, messages: list[dict], temperature: float = 0.1, max_tokens: int = 16000) -> str:
        if self._no_key:
            return '{"error": "no_api_key", "message": "请配置 LLM_API_KEY 环境变量"}'
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    async def chat_json(self, messages: list[dict], temperature: float = 0.1, max_tokens: int = 16000) -> dict:
        import json
        text = await self.chat(messages, temperature=temperature, max_tokens=max_tokens)
        text = self._clean_json(text)
        return json.loads(text)

    def _clean_json(self, text: str) -> str:
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()


class OllamaProvider(OpenAIProvider):
    """Ollama 本地模型 (完全兼容 OpenAI 接口)"""
    pass


class DeepSeekProvider(OpenAIProvider):
    """DeepSeek API"""
    pass


_provider_instance: Optional[AIProvider] = None


def get_ai_provider() -> AIProvider:
    global _provider_instance
    if _provider_instance is None:
        settings = get_settings()
        base = settings.llm_api_base.lower()

        if "deepseek" in base:
            _provider_instance = DeepSeekProvider()
        elif "ollama" in base:
            _provider_instance = OllamaProvider()
        else:
            _provider_instance = OpenAIProvider()

    return _provider_instance


def reset_ai_provider():
    """重置 provider (测试用)"""
    global _provider_instance
    _provider_instance = None
