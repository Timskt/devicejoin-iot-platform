from __future__ import annotations

"""
Module 6: AI Simulator - 智能模拟器
"""

import asyncio
import json
import math
import random

from app.prompts import SIMULATOR_GENERATOR
from app.services.ai_provider import get_ai_provider


class SimulatorService:
    """虚拟设备模拟器"""

    def __init__(self):
        self.ai = get_ai_provider()
        self.running_simulations: dict[str, asyncio.Task] = {}

    async def generate_pattern(self, points: list[dict], device_count: int,
                                interval_seconds: int, duration_seconds: int,
                                anomaly_probability: float) -> dict:
        prompt = SIMULATOR_GENERATOR.format(
            points=json.dumps(points, ensure_ascii=False, indent=2),
            device_count=device_count,
            interval_seconds=interval_seconds,
            duration_seconds=duration_seconds,
            anomaly_probability=anomaly_probability,
        )
        try:
            return await self.ai.chat_json([
                {"role": "system", "content": "你是 IoT 设备模拟专家。"},
                {"role": "user", "content": prompt},
            ])
        except Exception:
            return self._fallback_pattern(points, device_count, anomaly_probability)

    def _fallback_pattern(self, points: list[dict], device_count: int,
                          anomaly_probability: float) -> dict:
        """降级方案: 纯本地模拟"""
        devices = []
        for i in range(device_count):
            dp_pattern = {}
            for pt in points:
                rmin = pt.get("range_min", 0)
                rmax = pt.get("range_max", 100)
                mid = (rmin + rmax) / 2
                noise = (rmax - rmin) * 0.05
                dp_pattern[pt["identifier"]] = {
                    "base_value": mid,
                    "noise_range": noise,
                    "trend": random.choice(["stable", "periodic"]),
                    "period_seconds": random.choice([60, 300, 3600]),
                    "anomaly_scenarios": [],
                }
            devices.append({"device_name": f"虚拟设备-{i+1}", "data_pattern": dp_pattern})

        return {"devices": devices, "anomaly_scenarios": []}

    def _generate_value(self, base: float, noise: float, trend: str,
                        elapsed_seconds: int, period_seconds: int) -> float:
        val = base + random.uniform(-noise, noise)
        if trend == "periodic":
            val += math.sin(2 * math.pi * elapsed_seconds / period_seconds) * noise * 2
        return round(val, 2)


_simulator = None


def get_simulator() -> SimulatorService:
    global _simulator
    if _simulator is None:
        _simulator = SimulatorService()
    return _simulator
