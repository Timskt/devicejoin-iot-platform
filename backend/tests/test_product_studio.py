import pytest

from app.services.product_studio import (
    apply_inference_rules,
    match_commands_to_points,
)


class TestInferenceRules:
    """硬规则推断引擎测试 - 不依赖 LLM"""

    def test_infer_data_type_temperature(self):
        points = [{"name": "温度传感器1", "identifier": "temp_1"}]
        result = apply_inference_rules(points)
        assert result[0]["data_type"] == "int16"

    def test_infer_data_type_humidity(self):
        points = [{"name": "湿度", "identifier": "humidity_1"}]
        result = apply_inference_rules(points)
        assert result[0]["data_type"] == "uint16"

    def test_infer_data_type_switch(self):
        points = [{"name": "开关状态", "identifier": "switch_1"}]
        result = apply_inference_rules(points)
        assert result[0]["data_type"] == "bool"

    def test_infer_data_type_voltage(self):
        points = [{"name": "A相电压", "identifier": "voltage_a"}]
        result = apply_inference_rules(points)
        assert result[0]["data_type"] == "float32"

    def test_infer_unit_temperature(self):
        points = [{"name": "温度", "identifier": "temp_1"}]
        result = apply_inference_rules(points)
        assert result[0]["unit"] == "℃"

    def test_infer_unit_humidity(self):
        points = [{"name": "湿度", "identifier": "humidity"}]
        result = apply_inference_rules(points)
        assert result[0]["unit"] == "%"

    def test_infer_unit_voltage(self):
        points = [{"name": "电压", "identifier": "voltage"}]
        result = apply_inference_rules(points)
        assert result[0]["unit"] == "V"

    def test_infer_unit_power(self):
        points = [{"name": "有功功率", "identifier": "active_power"}]
        result = apply_inference_rules(points)
        assert result[0]["unit"] == "kW"

    def test_infer_range_temperature_industrial(self):
        points = [{"name": "工业温度传感器", "identifier": "temp_ind"}]
        result = apply_inference_rules(points)
        assert result[0]["range_min"] == -40
        assert result[0]["range_max"] == 125

    def test_infer_range_humidity(self):
        points = [{"name": "环境湿度", "identifier": "env_humidity"}]
        result = apply_inference_rules(points)
        assert result[0]["range_min"] == 0
        assert result[0]["range_max"] == 100

    def test_infer_range_co2(self):
        points = [{"name": "CO2浓度", "identifier": "co2_level"}]
        result = apply_inference_rules(points)
        assert result[0]["range_min"] == 0
        assert result[0]["range_max"] == 5000

    def test_infer_access_readonly_measurement(self):
        points = [{"name": "温度测量值", "identifier": "temp_value"}]
        result = apply_inference_rules(points)
        assert result[0]["access"] == "R"

    def test_infer_access_readwrite_control(self):
        points = [{"name": "温度阈值设置", "identifier": "temp_threshold"}]
        result = apply_inference_rules(points)
        assert result[0]["access"] == "RW"

    def test_preserve_existing_fields(self):
        """已有值不应被覆盖"""
        points = [{
            "name": "温度",
            "identifier": "temp_1",
            "data_type": "float32",
            "unit": "K",
            "range_min": -50,
            "range_max": 150,
        }]
        result = apply_inference_rules(points)
        assert result[0]["data_type"] == "float32"  # 保持原值
        assert result[0]["unit"] == "K"             # 保持原值
        assert result[0]["range_min"] == -50        # 保持原值
        assert result[0]["range_max"] == 150        # 保持原值


class TestCommandPointMapping:
    """命令-点位映射测试"""

    def test_match_command_by_name(self):
        points = [
            {"identifier": "temperature_1", "name": "温度传感器1"},
            {"identifier": "humidity_1", "name": "湿度传感器"},
        ]
        commands = [
            {"identifier": "set_temp", "name": "设置温度阈值", "related_point_ids": []},
        ]
        result = match_commands_to_points(commands, points)
        assert "temperature_1" in result[0]["related_point_ids"]

    def test_no_false_match(self):
        points = [
            {"identifier": "voltage_a", "name": "A相电压"},
            {"identifier": "current_a", "name": "A相电流"},
        ]
        commands = [
            {"identifier": "read_all", "name": "读取全部数据", "related_point_ids": []},
        ]
        result = match_commands_to_points(commands, points)
        # "读取全部数据" should match both since they share "数据"?
        # Actually: "A相电压" has no common 2-char Chinese with "读取全部数据"
        # So related_point_ids should remain empty
        assert result[0]["related_point_ids"] == []

    def test_match_command_by_name_chinese(self):
        points = [
            {"identifier": "voltage_a", "name": "A相电压"},
            {"identifier": "current_a", "name": "A相电流"},
        ]
        commands = [
            {"identifier": "read_voltage", "name": "读取电压", "related_point_ids": []},
        ]
        result = match_commands_to_points(commands, points)
        assert "voltage_a" in result[0]["related_point_ids"]
        assert "current_a" not in result[0]["related_point_ids"]

    def test_preserve_existing_mapping(self):
        points = [{"identifier": "temp", "name": "温度"}]
        commands = [{"identifier": "cmd1", "name": "命令1", "related_point_ids": ["humidity"]}]
        result = match_commands_to_points(commands, points)
        assert result[0]["related_point_ids"] == ["humidity"]  # 保持已有映射


class TestProductStudioIntegration:
    @pytest.mark.asyncio
    async def test_parse_documents_without_llm(self):
        from app.services.product_studio import ProductStudioService
        service = ProductStudioService()
        assert service is not None
        assert service.ai is not None
        # 无 API Key 时仍可实例化

    def test_apply_rules_full_pipeline(self):
        """模拟 AI 返回的原始数据经过规则补全"""
        raw_points = [
            {
                "identifier": "temp_a", "name": "A相温度",
                "register": "40001", "access": "R",
                "confidence": "certain",
            },
            {
                "identifier": "temp_threshold", "name": "温度阈值",
                "register": "40002", "access": "RW",
                "confidence": "certain",
            },
            {
                "identifier": "status", "name": "运行状态",
                "register": "40003",
                "confidence": "inferred",
            },
        ]

        result = apply_inference_rules(raw_points)

        # 温度应有完整信息
        assert result[0]["data_type"] == "int16"
        assert result[0]["unit"] == "℃"
        assert result[0]["range_min"] == -20  # 普通温度, 非工业

        # 阈值设置
        assert result[1]["data_type"] == "int16"
        assert result[1]["access"] == "RW"

        # 状态
        assert result[2]["data_type"] == "uint16"
