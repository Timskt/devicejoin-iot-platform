from app.core.config import Settings
from app.models.schemas import (
    AIParseResponse,
    CommandCreate,
    CommandParam,
    DashboardCreate,
    DataPointCreate,
    ProductCreate,
    RuleCreate,
)
from app.services.ai_provider import AIProvider, OpenAIProvider, get_ai_provider, reset_ai_provider


class TestSettings:
    def test_default_values(self):
        settings = Settings()
        assert settings.app_name == "DeviceJoin IOT Platform"
        assert settings.max_upload_size_mb == 50
        assert settings.vector_top_k == 5

    def test_env_override(self, monkeypatch):
        monkeypatch.setenv("LLM_MODEL", "gpt-4-turbo")
        settings = Settings()
        assert settings.llm_model == "gpt-4-turbo"


class TestSchemas:
    def test_product_create_valid(self):
        data = ProductCreate(
            name="测试产品",
            model="TEST-001",
            protocol="modbus_rtu",
        )
        assert data.name == "测试产品"
        assert data.data_points == []

    def test_product_create_with_points(self):
        dp = DataPointCreate(
            identifier="temp_1",
            name="温度",
            data_type="int16",
            unit="℃",
            range_min=-40,
            range_max=125,
        )
        data = ProductCreate(
            name="测试产品",
            model="TEST-002",
            protocol="modbus_rtu",
            data_points=[dp],
        )
        assert len(data.data_points) == 1
        assert data.data_points[0].identifier == "temp_1"

    def test_command_create(self):
        cmd = CommandCreate(
            identifier="set_temp",
            name="设置温度",
            parameters=[
                CommandParam(name="value", type="int16", required=True,
                            range={"min": -40, "max": 125}),
            ],
        )
        assert len(cmd.parameters) == 1
        assert cmd.parameters[0].name == "value"

    def test_ai_parse_response(self):
        resp = AIParseResponse(
            session_id="test-session",
            status="reviewing",
            data_points=[],
            commands=[],
            uncertainties=[],
            overall_confidence=0.85,
        )
        assert resp.session_id == "test-session"
        assert resp.overall_confidence == 0.85

    def test_rule_create(self):
        rule = RuleCreate(
            name="高温告警",
            rule_type="alert",
            trigger={"metric": "temperature", "operator": "gt", "value": 80},
            actions=[{"type": "notify", "channels": ["sms"]}],
            natural_language="温度超过80度报警",
        )
        assert rule.rule_type == "alert"
        assert rule.natural_language == "温度超过80度报警"

    def test_dashboard_create(self):
        dash = DashboardCreate(
            name="环境监控",
            layout=[{"type": "gauge", "title": "温度", "point_id": "xxx"}],
            ai_generated=True,
            ai_prompt="创建温湿度监控面板",
        )
        assert dash.ai_generated is True
        assert len(dash.layout) == 1


class TestAIProvider:
    def test_provider_interface(self):
        assert hasattr(AIProvider, 'chat')
        assert hasattr(AIProvider, 'chat_json')

    def test_get_provider_returns_instance(self):
        reset_ai_provider()
        provider = get_ai_provider()
        assert isinstance(provider, AIProvider)

    def test_openai_provider_no_key(self):
        provider = OpenAIProvider()
        assert provider._no_key is True  # 无有效 key 时自动降级

    def test_openai_provider_clean_json(self):
        provider = OpenAIProvider()
        assert provider._clean_json('```json\n{"a":1}\n```') == '{"a":1}'
        assert provider._clean_json('{"a":1}') == '{"a":1}'
        assert provider._clean_json('  {"a":1}  ') == '{"a":1}'
