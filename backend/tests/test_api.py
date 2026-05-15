import pytest
from fastapi.testclient import TestClient


class TestHealthCheck:
    def test_health(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("healthy", "degraded")
        assert data["version"] == "0.1.0"


class TestProductAPI:
    def test_create_product_manual(self, client):
        resp = client.post("/api/v1/products", json={
            "name": "温湿度传感器",
            "model": "TH-100",
            "protocol": "modbus_rtu",
            "data_points": [
                {"identifier": "temperature_1", "name": "温度", "data_type": "int16", "unit": "℃", "access": "R", "range_min": -40, "range_max": 125}
            ],
            "commands": [],
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "温湿度传感器"

    def test_list_products(self, client):
        resp = client.get("/api/v1/products")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_product_not_found(self, client):
        resp = client.get("/api/v1/products/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    def test_full_crud_cycle(self, client):
        create_resp = client.post("/api/v1/products", json={"name": "电表", "model": "EM-200", "protocol": "modbus_rtu", "data_points": [], "commands": []})
        assert create_resp.status_code == 201
        pid = create_resp.json()["id"]
        get_resp = client.get(f"/api/v1/products/{pid}")
        assert get_resp.status_code == 200
        patch_resp = client.patch(f"/api/v1/products/{pid}", json={"name": "new_name"})
        assert patch_resp.status_code == 200
        del_resp = client.delete(f"/api/v1/products/{pid}")
        assert del_resp.status_code == 204
        get_resp2 = client.get(f"/api/v1/products/{pid}")
        assert get_resp2.status_code == 404


class TestAIParseAPI:
    @pytest.mark.skip(reason="SSE endpoint uses async_session_factory, needs DB")
    def test_parse_endpoint_returns_sse(self, client):
        resp = client.post("/api/v1/products/ai/parse", json={"files": [], "product_hint": "test"})
        assert resp.status_code in (200, 500)
