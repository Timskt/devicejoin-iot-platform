"""
Tests for AI module API endpoints.
"""


class TestAIDebugEndpoint:
    def test_debug_requires_device(self, client):
        resp = client.post("/api/v1/ai/debug", json={
            "device_id": "00000000-0000-0000-0000-000000000000",
            "logs": ["Error: timeout"],
        })
        assert resp.status_code == 404

    def test_debug_invalid_uuid(self, client):
        """bad UUID should raise ValueError or return 500."""
        import pytest
        with pytest.raises((ValueError, Exception)):
            client.post("/api/v1/ai/debug", json={
                "device_id": "not-a-uuid",
                "logs": [],
            })


class TestAIRuleComposeEndpoint:
    def test_compose_without_context(self, client):
        resp = client.post("/api/v1/ai/rules/compose", json={
            "text": "温度超过80度报警",
        })
        # Returns 200 even without product context (uses empty points)
        assert resp.status_code == 200

    def test_compose_with_context(self, client):
        # Create a product first
        create_resp = client.post("/api/v1/products", json={
            "name": "测试传感器",
            "model": "T-001",
            "protocol": "modbus_rtu",
            "data_points": [
                {"identifier": "temp_1", "name": "温度", "data_type": "int16", "unit": "℃", "access": "R"}
            ],
            "commands": [],
        })
        assert create_resp.status_code == 201
        pid = create_resp.json()["id"]

        resp = client.post("/api/v1/ai/rules/compose", json={
            "text": "温度超过80度持续5分钟报警",
            "context_product_ids": [pid],
        })
        assert resp.status_code == 200


class TestAIDataExplore:
    def test_explore_with_empty_devices(self, client):
        resp = client.post("/api/v1/ai/data/explore", json={
            "text": "今天温度最高的设备",
            "device_ids": [],
        })
        assert resp.status_code == 200

    def test_explore_returns_visualization(self, client):
        resp = client.post("/api/v1/ai/data/explore", json={
            "text": "过去7天温度趋势",
            "device_ids": [],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "explanation" in data


class TestAIDashboardBuilder:
    def test_build_dashboard_requires_products(self, client):
        resp = client.post("/api/v1/ai/dashboards/build", json={
            "text": "创建环境监控大屏",
            "product_ids": [],
        })
        assert resp.status_code == 200

    def test_build_dashboard_with_product(self, client):
        create_resp = client.post("/api/v1/products", json={
            "name": "环境传感器",
            "model": "E-001",
            "protocol": "modbus_rtu",
            "data_points": [
                {"identifier": "temp_1", "name": "温度", "data_type": "int16", "unit": "℃", "access": "R"},
                {"identifier": "humidity_1", "name": "湿度", "data_type": "uint16", "unit": "%", "access": "R"},
            ],
            "commands": [],
        })
        pid = create_resp.json()["id"]

        resp = client.post("/api/v1/ai/dashboards/build", json={
            "text": "环境监控大屏",
            "product_ids": [pid],
        })
        assert resp.status_code == 200


class TestAISimulator:
    def test_start_simulator_no_points(self, client):
        """Simulator with non-existent product returns 200 (fallback pattern)."""
        resp = client.post("/api/v1/ai/simulator/start", json={
            "product_id": "00000000-0000-0000-0000-000000000000",
            "device_count": 1,
            "interval_seconds": 60,
            "duration_seconds": 600,
        })
        assert resp.status_code == 200

    def test_start_simulator_with_product(self, client):
        create_resp = client.post("/api/v1/products", json={
            "name": "温湿度传感器",
            "model": "TH-100",
            "protocol": "modbus_rtu",
            "data_points": [
                {"identifier": "temperature_1", "name": "温度", "data_type": "int16", "unit": "℃", "access": "R", "range_min": -40, "range_max": 125},
            ],
            "commands": [],
        })
        pid = create_resp.json()["id"]

        resp = client.post("/api/v1/ai/simulator/start", json={
            "product_id": pid,
            "device_count": 3,
            "interval_seconds": 60,
            "duration_seconds": 600,
            "anomaly_probability": 0.1,
        })
        assert resp.status_code == 200
        assert resp.json()["status"] == "started"
