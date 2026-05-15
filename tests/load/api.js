import http from "k6/http";
import { check, sleep } from "k6";

// k6 run tests/load/api.js

export const options = {
  stages: [
    { duration: "10s", target: 5 },   // ramp up to 5 users
    { duration: "20s", target: 20 },  // ramp up to 20 users
    { duration: "10s", target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.05"],
  },
};

const BASE = "http://localhost:8000";

export default function () {
  // Health check
  const health = http.get(`${BASE}/health`);
  check(health, { "health ok": (r) => r.status === 200 });

  // List products
  const products = http.get(`${BASE}/api/v1/products`);
  check(products, { "products ok": (r) => r.status === 200 });

  // Create product
  const create = http.post(
    `${BASE}/api/v1/products`,
    JSON.stringify({
      name: `load-test-${__VU}`,
      model: "LT-001",
      protocol: "modbus_rtu",
      data_points: [],
      commands: [],
    }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(create, { "create ok": (r) => r.status === 201 });

  // Metrics
  http.get(`${BASE}/metrics`);

  sleep(1);
}
