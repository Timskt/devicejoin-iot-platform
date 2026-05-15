"""Mock LLM tests for AI services - improves coverage without real API calls."""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.dashboard_builder import get_dashboard_builder
from app.services.data_explorer import get_data_explorer
from app.services.debug_assistant import get_debug_assistant
from app.services.product_studio import (
    apply_inference_rules,
    get_product_studio,
    match_commands_to_points,
)
from app.services.rule_composer import get_rule_composer
from app.services.simulator import get_simulator


class TestInferenceRulesEdgeCases:
    def test_empty_points(self):
        assert apply_inference_rules([]) == []

    def test_fully_populated_point_unchanged(self):
        points = [{
            "identifier": "temp_1", "name": "温度",
            "data_type": "float32", "unit": "K",
            "range_min": -100, "range_max": 200, "access": "RW",
        }]
        result = apply_inference_rules(points)
        assert result[0]["data_type"] == "float32"
        assert result[0]["unit"] == "K"
        assert result[0]["range_min"] == -100

    def test_infer_current_unit(self):
        points = [{"name": "电机电流", "identifier": "motor_current"}]
        result = apply_inference_rules(points)
        assert result[0]["unit"] == "A"
        assert result[0]["data_type"] == "float32"

    def test_infer_energy_unit(self):
        points = [{"name": "总电能", "identifier": "total_energy"}]
        result = apply_inference_rules(points)
        assert result[0]["unit"] == "kWh"

    def test_infer_frequency(self):
        points = [{"name": "电网频率", "identifier": "grid_freq"}]
        result = apply_inference_rules(points)
        assert result[0]["unit"] == "Hz"
        assert result[0]["range_min"] == 45
        assert result[0]["range_max"] == 65

    def test_infer_three_phase_voltage_range(self):
        points = [{"name": "三相电压", "identifier": "voltage_3p"}]
        result = apply_inference_rules(points)
        assert result[0]["range_min"] == 0
        assert result[0]["range_max"] == 500


class TestCommandMatchingEdgeCases:
    def test_empty_lists(self):
        assert match_commands_to_points([], []) == []

    def test_no_match_found(self):
        points = [{"identifier": "temp", "name": "温度"}]
        commands = [{"identifier": "reboot", "name": "重启设备", "related_point_ids": []}]
        result = match_commands_to_points(commands, points)
        assert result[0]["related_point_ids"] == []


class TestServiceInitialization:
    """Verify all service singletons can be instantiated."""

    def test_product_studio_singleton(self):
        s1 = get_product_studio()
        s2 = get_product_studio()
        assert s1 is s2

    def test_debug_assistant_singleton(self):
        assert get_debug_assistant() is not None

    def test_rule_composer_singleton(self):
        assert get_rule_composer() is not None

    def test_data_explorer_singleton(self):
        assert get_data_explorer() is not None

    def test_dashboard_builder_singleton(self):
        assert get_dashboard_builder() is not None

    def test_simulator_singleton(self):
        assert get_simulator() is not None


class TestServiceWithMockedLLM:
    """Test AI services with mocked LLM responses."""

    @pytest.mark.asyncio
    async def test_product_studio_parse_with_mock(self):
        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {"protocol_guess": "modbus_rtu", "completeness": "partial"}

        with patch("app.services.product_studio.get_ai_provider", return_value=mock_llm):
            from app.services.product_studio import ProductStudioService
            service = ProductStudioService()
            service.ai = mock_llm
            result = await service.parse_documents(files=[], product_hint="test")
            assert result is not None

    @pytest.mark.asyncio
    async def test_debug_assistant_with_mock(self):
        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {
            "diagnosis": "test diagnosis",
            "possible_causes": [],
            "suggestions": [],
            "confidence": 0.9,
        }
        with patch("app.services.debug_assistant.get_ai_provider", return_value=mock_llm):
            from app.services.debug_assistant import DebugAssistantService
            service = DebugAssistantService()
            service.ai = mock_llm
            result = await service.diagnose({"name": "test"}, [], [], "")
            assert result["diagnosis"] == "test diagnosis"

    @pytest.mark.asyncio
    async def test_rule_composer_with_mock(self):
        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {"rule_name": "test", "trigger": {"metric": "temp"}}
        with patch("app.services.rule_composer.get_ai_provider", return_value=mock_llm):
            from app.services.rule_composer import RuleComposerService
            service = RuleComposerService()
            service.ai = mock_llm
            result = await service.compose("温度超过80", [{"identifier": "temp"}], [])
            assert result["rule_name"] == "test"

    @pytest.mark.asyncio
    async def test_data_explorer_with_mock(self):
        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {"intent": "query", "visualization": {"type": "line"}}
        with patch("app.services.data_explorer.get_ai_provider", return_value=mock_llm):
            from app.services.data_explorer import DataExplorerService
            service = DataExplorerService()
            service.ai = mock_llm
            result = await service.explore("查询温度", [])
            assert result["intent"] == "query"

    @pytest.mark.asyncio
    async def test_dashboard_builder_with_mock(self):
        mock_llm = AsyncMock()
        mock_llm.chat_json.return_value = {"dashboard_name": "test"}
        with patch("app.services.dashboard_builder.get_ai_provider", return_value=mock_llm):
            from app.services.dashboard_builder import DashboardBuilderService
            service = DashboardBuilderService()
            service.ai = mock_llm
            result = await service.build("监控大屏", [])
            assert result["dashboard_name"] == "test"

    @pytest.mark.asyncio
    async def test_simulator_with_mock(self):
        mock_llm = AsyncMock()
        mock_llm.chat_json.side_effect = Exception("no api")
        with patch("app.services.simulator.get_ai_provider", return_value=mock_llm):
            from app.services.simulator import SimulatorService
            service = SimulatorService()
            service.ai = mock_llm
            result = await service.generate_pattern(
                [{"identifier": "temp", "name": "温度", "range_min": -40, "range_max": 125}],
                device_count=2, interval_seconds=60, duration_seconds=600, anomaly_probability=0.1,
            )
            assert "devices" in result
