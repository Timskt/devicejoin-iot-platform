import { useState, useEffect } from "react";

const API = "/api/v1";

/* ── inline styles ── */
const S = {
  app: { fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto", padding: 20 } as React.CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #eee", paddingBottom: 12, marginBottom: 24 } as React.CSSProperties,
  title: { margin: 0, fontSize: 24 } as React.CSSProperties,
  nav: { display: "flex", gap: 8 } as React.CSSProperties,
  btn: { padding: "8px 16px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14 } as React.CSSProperties,
  btnPrimary: { padding: "8px 16px", border: "none", borderRadius: 6, background: "#3b82f6", color: "#fff", cursor: "pointer", fontSize: 14 } as React.CSSProperties,
  card: { border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, marginBottom: 12 } as React.CSSProperties,
  input: { padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, width: "100%", boxSizing: "border-box" as const, marginBottom: 8 },
  textarea: { padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, width: "100%", boxSizing: "border-box" as const, minHeight: 80, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" } as React.CSSProperties,
  badge: (color: string) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: color, color: "#fff" }) as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 } as React.CSSProperties,
  th: { textAlign: "left" as const, padding: "8px 6px", borderBottom: "2px solid #e5e7eb", background: "#f9fafb" } as React.CSSProperties,
  td: { padding: "8px 6px", borderBottom: "1px solid #f3f4f6" } as React.CSSProperties,
  statusDot: (color: string) => ({ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 6 }) as React.CSSProperties,
  flex: { display: "flex", gap: 12, flexWrap: "wrap" as const } as React.CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 } as React.CSSProperties,
  gauge: { textAlign: "center" as const, padding: 16, border: "1px solid #e5e7eb", borderRadius: 8 } as React.CSSProperties,
};

type Product = { id: string; name: string; model: string; protocol: string; status: string };
type Tab = "products" | "ai-parse" | "dashboard";

export default function App() {
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<any>({});

  // AI Parse state
  const [parseHint, setParseHint] = useState("");
  const [parseResult, setParseResult] = useState<any>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseStream, setParseStream] = useState("");

  const fetchProducts = async () => {
    setLoading(true);
    try { const r = await fetch(`${API}/products`); setProducts(await r.json()); } catch { /* */ }
    setLoading(false);
  };
  const fetchHealth = async () => { try { const r = await fetch("/health"); setHealth(await r.json()); } catch { /* */ } };
  useEffect(() => { fetchProducts(); fetchHealth(); }, []);

  const aiParse = async () => {
    setParseLoading(true);
    setParseResult(null);
    setParseStream("");
    try {
      const r = await fetch(`${API}/products/ai/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: [], product_hint: parseHint || undefined }),
      });
      const reader = r.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // Parse SSE events
        for (const line of buf.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (line.includes("event: stage")) {
                setParseStream(data.message || "");
              } else if (line.includes("event: result")) {
                setParseResult(data);
                setParseStream("");
              } else if (line.includes("event: error")) {
                setParseResult({ error: data.message });
                setParseStream("");
              } else if (line.includes("event: done")) {
                setParseStream("");
              }
            } catch { /* partial chunk */ }
          }
        }
        buf = buf.includes("\n\n") ? buf.slice(buf.lastIndexOf("\n\n") + 2) : buf;
      }
    } catch (e: any) {
      setParseResult({ error: e.message });
    }
    setParseLoading(false);
  };

  const createProduct = async () => {
    const name = prompt("产品名称");
    if (!name) return;
    await fetch(`${API}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, model: name, protocol: "modbus_rtu", data_points: [], commands: [] }),
    });
    fetchProducts();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("确认删除？")) return;
    await fetch(`${API}/products/${id}`, { method: "DELETE" });
    fetchProducts();
  };

  const confirmParseAndCreate = async () => {
    if (!parseResult?.session_id) return;
    const r = await fetch(`${API}/products/ai/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: parseResult.session_id,
        product: parseResult.product || {},
        data_points: parseResult.data_points || [],
        commands: parseResult.commands || [],
      }),
    });
    if (r.ok) {
      alert("产品创建成功！");
      setParseResult(null);
      setParseHint("");
      fetchProducts();
    }
  };

  return (
    <div style={S.app}>
      {/* Header */}
      <div style={S.header}>
        <h1 style={S.title}>DeviceJoin IoT</h1>
        <div style={S.nav}>
          <button style={tab === "products" ? S.btnPrimary : S.btn} onClick={() => setTab("products")}>产品</button>
          <button style={tab === "ai-parse" ? S.btnPrimary : S.btn} onClick={() => setTab("ai-parse")}>AI 接入</button>
          <button style={tab === "dashboard" ? S.btnPrimary : S.btn} onClick={() => setTab("dashboard")}>监控</button>
        </div>
      </div>

      {/* Status bar */}
      <div style={{ ...S.card, marginBottom: 20, display: "flex", gap: 16, alignItems: "center", fontSize: 13 }}>
        <span style={S.statusDot(health?.status === "healthy" ? "#22c55e" : "#f59e0b")} />
        {health?.status ?? "loading"} · DB: {health?.db ?? "?"} · v{health?.version ?? "?"}
      </div>

      {/* Tab: Products */}
      {tab === "products" && (
        <div>
          <div style={{ ...S.flex, marginBottom: 16 }}>
            <button style={S.btnPrimary} onClick={createProduct}>+ 手动创建产品</button>
            <button style={S.btn} onClick={fetchProducts} disabled={loading}>🔄 刷新</button>
          </div>

          {loading ? (
            <p>加载中...</p>
          ) : products.length === 0 ? (
            <div style={S.card}><p style={{color:"#9ca3af"}}>暂无产品。点击「+ 手动创建产品」或切换到「AI 接入」标签页。</p></div>
          ) : (
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>名称</th>
                  <th style={S.th}>型号</th>
                  <th style={S.th}>协议</th>
                  <th style={S.th}>状态</th>
                  <th style={S.th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td style={S.td}>{p.name}</td>
                    <td style={S.td}>{p.model}</td>
                    <td style={S.td}><span style={S.badge("#6366f1")}>{p.protocol}</span></td>
                    <td style={S.td}><span style={S.badge(p.status === "active" ? "#22c55e" : "#9ca3af")}>{p.status}</span></td>
                    <td style={S.td}>
                      <button style={{ ...S.btn, fontSize: 12, padding: "4px 8px", color: "#ef4444" }} onClick={() => deleteProduct(p.id)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab: AI Parse */}
      {tab === "ai-parse" && (
        <div>
          <div style={S.card}>
            <h3 style={{ margin: "0 0 12px" }}>AI 智能接入设备</h3>
            <p style={{ fontSize: 13, color: "#6b7280" }}>
              描述你的设备，AI 会自动提取产品配置（点位、命令、协议等）。支持粘贴文档内容或直接描述。
            </p>
            <textarea
              style={S.textarea}
              placeholder="例：这是一个工业温湿度传感器，Modbus RTU 协议，温度寄存器 40001（int16，单位℃，范围-40~125），湿度寄存器 40002（uint16，单位%，范围0-100）..."
              value={parseHint}
              onChange={(e) => setParseHint(e.target.value)}
            />
            <button style={S.btnPrimary} onClick={aiParse} disabled={parseLoading}>
              {parseLoading ? "AI 分析中..." : "🔍 AI 智能解析"}
            </button>
            {parseStream && (
              <div style={{ marginTop: 12, padding: 12, background: "#f0f9ff", borderRadius: 6, fontSize: 13, color: "#0369a1" }}>
                <span style={{ marginRight: 8 }}>⏳</span>{parseStream}
              </div>
            )}
          </div>

          {parseResult && (
            <div style={S.card}>
              <div style={{ ...S.flex, justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>解析结果</h3>
                <span style={S.badge(parseResult.overall_confidence > 0.7 ? "#22c55e" : parseResult.overall_confidence > 0.4 ? "#f59e0b" : "#ef4444")}>
                  置信度: {Math.round((parseResult.overall_confidence || 0) * 100)}%
                </span>
              </div>

              {parseResult.error && (
                <p style={{ color: "#f59e0b", fontSize: 13 }}>⚠ {parseResult.error}</p>
              )}

              {parseResult.data_points?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <h4 style={{ fontSize: 14, margin: "8px 0" }}>数据点位 ({parseResult.data_points.length})</h4>
                  <table style={S.table}>
                    <thead>
                      <tr>
                        <th style={S.th}>名称</th>
                        <th style={S.th}>寄存器</th>
                        <th style={S.th}>类型</th>
                        <th style={S.th}>范围</th>
                        <th style={S.th}>置信度</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parseResult.data_points.map((dp: any, i: number) => (
                        <tr key={i}>
                          <td style={S.td}>{dp.name}</td>
                          <td style={S.td}>{dp.register || "-"}</td>
                          <td style={S.td}>{dp.data_type || "?"}</td>
                          <td style={S.td}>{dp.range_min != null ? `${dp.range_min}~${dp.range_max} ${dp.unit || ""}` : "-"}</td>
                          <td style={S.td}>
                            <span style={S.badge(dp.confidence === "certain" ? "#22c55e" : dp.confidence === "inferred" ? "#f59e0b" : "#ef4444")}>
                              {dp.confidence}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button style={{ ...S.btnPrimary, marginTop: 16 }} onClick={confirmParseAndCreate}>
                ✅ 确认并创建产品
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Dashboard */}
      {tab === "dashboard" && (
        <div>
          <div style={S.grid}>
            <div style={S.gauge}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>产品数</div>
              <div style={{ fontSize: 36, fontWeight: 700 }}>{products.length}</div>
            </div>
            <div style={S.gauge}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>数据库</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: health?.db === "connected" ? "#22c55e" : "#ef4444" }}>
                {health?.db || "?"}
              </div>
            </div>
            <div style={S.gauge}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>版本</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>v{health?.version || "?"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
