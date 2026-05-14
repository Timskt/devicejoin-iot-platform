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
                {
                    "identifier": "temperature_1",
                    "name": "温度",
                    "data_type": "int16",
                    "unit": "℃",
                    "access": "R",
                    "range_min": -40,
                    "range_max": 125,
                }
            ],
            "commands": [],
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "温湿度传感器"
        assert data["model"] == "TH-100"

    def test_list_products(self, client):
        resp = client.get("/api/v1/products")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_get_product_not_found(self, client):
        resp = client.get("/api/v1/products/00000000-0000-0000-0000-000000000000")
        assert resp.status_code == 404

    def test_full_crud_cycle(self, client):
        # Create
        create_resp = client.post("/api/v1/products", json={
            "name": "电表",
            "model": "EM-200",
            "protocol": "modbus_rtu",
            "data_points": [],
            "commands": [],
        })
        assert create_resp.status_code == 201
        pid = create_resp.json()["id"]

        # Get
        get_resp = client.get(f"/api/v1/products/{pid}")
        assert get_resp.status_code == 200
        assert get_resp.json()["name"] == "电表"

        # Update
        patch_resp = client.patch(f"/api/v1/products/{pid}", json={"name": "new_name"})
        assert patch_resp.status_code == 200
        assert patch_resp.json()["name"] == "new_name"

        # Delete
        del_resp = client.delete(f"/api/v1/products/{pid}")
        assert del_resp.status_code == 204

        # Verify deleted
        get_resp2 = client.get(f"/api/v1/products/{pid}")
        assert get_resp2.status_code == 404


class TestAIParseAPI:
    def test_parse_endpoint_accessible(self, client):
        resp = client.post("/api/v1/products/ai/parse", json={
            "files": [],
            "product_hint": "这是一个温湿度传感器",
        })
        # 即使没有文件，接口应该返回 200 (AI 可能失败但接口正常)
        assert resp.status_code == 200
        assert "session_id" in resp.json()
