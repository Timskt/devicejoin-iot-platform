import { useState, useEffect } from "react";

const API = "/api/v1";

const S = {
  app: { fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto", padding: 20 } as React.CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #eee", paddingBottom: 12, marginBottom: 24 } as React.CSSProperties,
  title: { margin: 0, fontSize: 24 } as React.CSSProperties,
  nav: { display: "flex", gap: 8 } as React.CSSProperties,
  btn: { padding: "8px 16px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 14 } as React.CSSProperties,
  btnSm: { padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4, background: "#fff", cursor: "pointer", fontSize: 12 } as React.CSSProperties,
  btnPrimary: { padding: "10px 20px", border: "none", borderRadius: 6, background: "#3b82f6", color: "#fff", cursor: "pointer", fontSize: 14 } as React.CSSProperties,
  btnDanger: { padding: "4px 8px", border: "1px solid #fecaca", borderRadius: 4, background: "#fef2f2", color: "#ef4444", cursor: "pointer", fontSize: 12 } as React.CSSProperties,
  card: { border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 12 } as React.CSSProperties,
  input: { padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, width: "100%", boxSizing: "border-box" as const, marginBottom: 8 },
  textarea: { padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, width: "100%", boxSizing: "border-box" as const, minHeight: 80, marginBottom: 8, fontFamily: "inherit" },
  label: { fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block", color: "#374151" } as React.CSSProperties,
  badge: (c: string) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: c, color: "#fff" }) as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 13 } as React.CSSProperties,
  th: { textAlign: "left" as const, padding: "8px 10px", borderBottom: "2px solid #e5e7eb", background: "#f9fafb", fontWeight: 600 } as React.CSSProperties,
  td: { padding: "8px 10px", borderBottom: "1px solid #f3f4f6" } as React.CSSProperties,
  statusDot: (c: string) => ({ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c, marginRight: 6 }) as React.CSSProperties,
  flex: { display: "flex", gap: 12, flexWrap: "wrap" as const } as React.CSSProperties,
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } as React.CSSProperties,
  sectionTitle: { fontSize: 15, fontWeight: 600, margin: "16px 0 8px", color: "#1f2937" } as React.CSSProperties,
  paramTag: { display: "inline-block", padding: "2px 6px", margin: "2px 4px 2px 0", background: "#eef2ff", color: "#4f46e5", borderRadius: 4, fontSize: 12 } as React.CSSProperties,
};

type Product = { id: string; name: string; model: string; protocol: string; status: string; manufacturer?: string; description?: string };
type DataPoint = { id: string; identifier: string; name: string; data_type: string; unit: string; register: string; access: string; range_min?: number; range_max?: number; description?: string };
type Command = { id: string; identifier: string; name: string; method: string; parameters: any[]; description?: string };
type Tab = "products" | "ai-parse" | "dashboard";

export default function App() {
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<any>({});

  // Product detail
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [productDetail, setProductDetail] = useState<{ points: DataPoint[]; commands: Command[] } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Product>>({});

  // AI Parse
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

  const createProduct = async () => {
    const name = prompt("产品名称");
    if (!name) return;
    await fetch(`${API}/products`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, model: name, protocol: "modbus_rtu", data_points: [], commands: [] }),
    });
    fetchProducts();
  };

  const selectProduct = async (pid: string) => {
    setSelectedProduct(pid);
    setEditMode(false);
    try {
      const [pres, cres] = await Promise.all([
        fetch(`${API}/products/${pid}/points`),
        fetch(`${API}/products/${pid}/commands`),
      ]);
      setProductDetail({ points: await pres.json(), commands: await cres.json() });
    } catch { setProductDetail(null); }
  };

  const startEdit = () => {
    const p = products.find(pp => pp.id === selectedProduct);
    if (p) setEditForm({ name: p.name, model: p.model, manufacturer: p.manufacturer, description: p.description });
    setEditMode(true);
  };

  const saveEdit = async () => {
    if (!selectedProduct) return;
    await fetch(`${API}/products/${selectedProduct}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditMode(false);
    fetchProducts();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("确认删除？")) return;
    await fetch(`${API}/products/${id}`, { method: "DELETE" });
    setSelectedProduct(null);
    setProductDetail(null);
    fetchProducts();
  };

  // ── AI Parse (SSE streaming) ──
  const aiParse = async () => {
    setParseLoading(true);
    setParseResult(null);
    setParseStream("");
    try {
      const r = await fetch(`${API}/products/ai/parse`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: [], product_hint: parseHint || undefined }),
      });
      const reader = r.body?.getReader();
      if (!reader) throw new Error("No body");
      const decoder = new TextDecoder();
      let buf = "", eventType = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        for (const line of buf.split("\n")) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim();
          else if (line.startsWith("data: "))
            try {
              const d = JSON.parse(line.slice(6));
              if (eventType === "stage") setParseStream(d.message || "");
              else if (eventType === "result") { setParseResult(d); setParseStream(""); }
              else if (eventType === "error") { setParseResult({ error: d.message || d.error }); setParseStream(""); }
              else if (eventType === "done") setParseStream("");
            } catch { /* */ }
        }
        const nl = buf.lastIndexOf("\n");
        buf = nl >= 0 ? buf.slice(nl + 1) : buf;
      }
    } catch (e: any) { setParseResult({ error: e.message }); }
    setParseLoading(false);
  };

  const confirmParseAndCreate = async () => {
    if (!parseResult?.session_id) return;
    const r = await fetch(`${API}/products/ai/review`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: parseResult.session_id, product: parseResult.product || {}, data_points: parseResult.data_points || [], commands: parseResult.commands || [] }),
    });
    if (r.ok) { alert("产品创建成功！"); setParseResult(null); setParseHint(""); fetchProducts(); }
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
      <div style={{ ...S.card, marginBottom: 20, display: "flex", gap: 16, alignItems: "center", fontSize: 13, padding: "8px 20px" }}>
        <span style={S.statusDot(health?.status === "healthy" ? "#22c55e" : "#f59e0b")} />
        {health?.status ?? "loading"} · DB: {health?.db ?? "?"} · v{health?.version ?? "?"}
      </div>

      {/* ── Tab: Products ── */}
      {tab === "products" && (
        <div style={S.grid2}>
          {/* Left: Product list */}
          <div>
            <div style={{ ...S.flex, marginBottom: 12 }}>
              <button style={S.btnPrimary} onClick={createProduct}>+ 创建产品</button>
              <button style={S.btn} onClick={fetchProducts} disabled={loading}>🔄</button>
            </div>
            {products.length === 0 ? (
              <div style={S.card}><p style={{ color: "#9ca3af" }}>暂无产品</p></div>
            ) : (
              products.map(p => (
                <div key={p.id} style={{ ...S.card, padding: 12, cursor: "pointer", borderColor: selectedProduct === p.id ? "#3b82f6" : "#e5e7eb", background: selectedProduct === p.id ? "#f0f7ff" : "#fff" }} onClick={() => selectProduct(p.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ fontSize: 14 }}>{p.name}</strong>
                    <span style={S.badge(p.status === "active" ? "#22c55e" : "#9ca3af")}>{p.status}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    {p.model} · <span style={S.badge("#6366f1")}>{p.protocol}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Right: Product detail */}
          <div>
            {selectedProduct && productDetail ? (
              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ margin: 0 }}>
                    {editMode ? (
                      <input style={S.input} value={editForm.name || ""} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="产品名称" />
                    ) : (
                      products.find(p => p.id === selectedProduct)?.name
                    )}
                  </h3>
                  <div style={{ display: "flex", gap: 6 }}>
                    {editMode ? (
                      <><button style={S.btnSm} onClick={() => setEditMode(false)}>取消</button><button style={{ ...S.btnSm, background: "#3b82f6", color: "#fff", border: "none" }} onClick={saveEdit}>保存</button></>
                    ) : (
                      <button style={S.btnSm} onClick={startEdit}>编辑</button>
                    )}
                    <button style={S.btnDanger} onClick={() => deleteProduct(selectedProduct)}>删除</button>
                  </div>
                </div>

                {editMode ? (
                  <div>
                    <label style={S.label}>型号</label>
                    <input style={S.input} value={editForm.model || ""} onChange={e => setEditForm({ ...editForm, model: e.target.value })} />
                    <label style={S.label}>厂商</label>
                    <input style={S.input} value={editForm.manufacturer || ""} onChange={e => setEditForm({ ...editForm, manufacturer: e.target.value })} />
                    <label style={S.label}>描述</label>
                    <textarea style={S.textarea} value={editForm.description || ""} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                  </div>
                ) : (
                  <div style={{ fontSize: 13 }}>
                    {(() => { const p = products.find(pp => pp.id === selectedProduct); return p ? (
                      <div style={{ color: "#4b5563", lineHeight: 1.8 }}>
                        <div><b>型号：</b>{p.model || "-"}</div>
                        <div><b>协议：</b>{p.protocol}</div>
                        <div><b>厂商：</b>{p.manufacturer || "-"}</div>
                        {p.description && <div><b>描述：</b>{p.description}</div>}
                      </div>
                    ) : null; })()}
                  </div>
                )}

                {/* Data Points */}
                <h4 style={S.sectionTitle}>数据点位 ({productDetail.points.length})</h4>
                {productDetail.points.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#9ca3af" }}>暂无数据点位</p>
                ) : (
                  <table style={S.table}>
                    <thead><tr>
                      <th style={S.th}>名称</th><th style={S.th}>标识符</th><th style={S.th}>寄存器</th><th style={S.th}>类型</th><th style={S.th}>范围</th><th style={S.th}>权限</th>
                    </tr></thead>
                    <tbody>
                      {productDetail.points.map(dp => (
                        <tr key={dp.id}>
                          <td style={S.td}>{dp.name}</td>
                          <td style={S.td}><code style={{ fontSize: 11 }}>{dp.identifier}</code></td>
                          <td style={S.td}>{dp.register || "-"}</td>
                          <td style={S.td}><span style={S.badge("#8b5cf6")}>{dp.data_type}</span></td>
                          <td style={S.td}>{dp.range_min != null ? `${dp.range_min}~${dp.range_max} ${dp.unit || ""}` : "-"}</td>
                          <td style={S.td}><span style={S.badge(dp.access === "RW" ? "#f59e0b" : "#22c55e")}>{dp.access}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* Commands */}
                <h4 style={S.sectionTitle}>命令 ({productDetail.commands.length})</h4>
                {productDetail.commands.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#9ca3af" }}>暂无命令</p>
                ) : (
                  <div>
                    {productDetail.commands.map(cmd => (
                      <div key={cmd.id} style={{ ...S.card, padding: 12, marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong style={{ fontSize: 14 }}>{cmd.name}</strong>
                          <span style={S.badge("#8b5cf6")}>{cmd.method || "无功能码"}</span>
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                          标识符: <code>{cmd.identifier}</code>
                        </div>
                        {cmd.parameters && cmd.parameters.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <span style={{ fontSize: 12, color: "#6b7280" }}>参数: </span>
                            {cmd.parameters.map((p: any, i: number) => (
                              <span key={i} style={S.paramTag}>
                                {p.name}: {p.type}{p.required ? "*" : ""}
                                {p.range ? ` [${p.range.min},${p.range.max}]` : ""}
                              </span>
                            ))}
                          </div>
                        )}
                        {cmd.description && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>{cmd.description}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={S.card}><p style={{ color: "#9ca3af", textAlign: "center" }}>← 点击左侧产品查看详情</p></div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: AI Parse ── */}
      {tab === "ai-parse" && (
        <div style={{ maxWidth: 800 }}>
          <div style={S.card}>
            <h3 style={{ margin: "0 0 8px" }}>AI 智能接入设备</h3>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              粘贴设备协议文档或直接描述设备信息，AI 自动提取产品配置（数据点位、命令及其参数关联）。
            </p>
            <textarea style={{ ...S.textarea, minHeight: 120 }} placeholder="例：这是一个工业温湿度传感器，Modbus RTU 协议...&#10;&#10;或粘贴完整的设备协议文档内容..."
              value={parseHint} onChange={e => setParseHint(e.target.value)} />
            <button style={S.btnPrimary} onClick={aiParse} disabled={parseLoading}>
              {parseLoading ? "AI 分析中..." : "🔍 AI 智能解析"}
            </button>
            {parseStream && (
              <div style={{ marginTop: 12, padding: "8px 16px", background: "#f0f9ff", borderRadius: 6, fontSize: 13, color: "#0369a1" }}>
                ⏳ {parseStream}
              </div>
            )}
          </div>

          {parseResult && (
            <div style={S.card}>
              <div style={{ ...S.flex, justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>
                  {parseResult.product?.name || "解析结果"}
                  {parseResult.product?.model && <span style={{ fontSize: 13, fontWeight: 400, color: "#6b7280", marginLeft: 8 }}>{parseResult.product.model}</span>}
                </h3>
                <span style={S.badge(parseResult.overall_confidence > 0.7 ? "#22c55e" : parseResult.overall_confidence > 0.4 ? "#f59e0b" : "#ef4444")}>
                  置信度: {Math.round((parseResult.overall_confidence || 0) * 100)}%
                </span>
              </div>

              {parseResult.error && <p style={{ color: "#f59e0b", fontSize: 13, padding: 8, background: "#fefce8", borderRadius: 4 }}>⚠ {parseResult.error}</p>}

              {parseResult.product?.protocol && <p style={{ fontSize: 13, color: "#4b5563", margin: "4px 0" }}>协议: <span style={S.badge("#6366f1")}>{parseResult.product.protocol}</span> · 厂商: {parseResult.product.manufacturer || "-"}</p>}

              {/* Data Points Table */}
              {parseResult.data_points?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={S.sectionTitle}>数据点位 ({parseResult.data_points.length})</h4>
                  <div style={{ overflowX: "auto" }}>
                    <table style={S.table}>
                      <thead><tr>
                        <th style={S.th}>名称</th><th style={S.th}>标识符</th><th style={S.th}>寄存器</th><th style={S.th}>类型</th><th style={S.th}>单位</th><th style={S.th}>范围</th><th style={S.th}>权限</th><th style={S.th}>置信度</th>
                      </tr></thead>
                      <tbody>
                        {parseResult.data_points.map((dp: any, i: number) => (
                          <tr key={i}>
                            <td style={S.td}>{dp.name}</td>
                            <td style={S.td}><code style={{ fontSize: 11 }}>{dp.identifier}</code></td>
                            <td style={S.td}>{dp.register || "-"}</td>
                            <td style={S.td}><span style={S.badge("#8b5cf6")}>{dp.data_type}</span></td>
                            <td style={S.td}>{dp.unit || "-"}</td>
                            <td style={S.td}>{dp.range_min != null ? `${dp.range_min}~${dp.range_max}` : "-"}</td>
                            <td style={S.td}><span style={S.badge(dp.access === "RW" ? "#f59e0b" : "#22c55e")}>{dp.access}</span></td>
                            <td style={S.td}><span style={S.badge(dp.confidence === "certain" ? "#22c55e" : dp.confidence === "inferred" ? "#f59e0b" : "#ef4444")}>{dp.confidence}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Commands */}
              {parseResult.commands?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={S.sectionTitle}>命令 ({parseResult.commands.length})</h4>
                  {parseResult.commands.map((cmd: any, i: number) => (
                    <div key={i} style={{ ...S.card, padding: 12, marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong>{cmd.name}</strong>
                        <span style={S.badge("#8b5cf6")}>{cmd.method || "-"}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                        标识符: <code>{cmd.identifier}</code>
                        {cmd.description && <span> · {cmd.description}</span>}
                      </div>
                      {/* Parameters */}
                      {cmd.parameters && cmd.parameters.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>参数: </span>
                          {cmd.parameters.map((p: any, j: number) => (
                            <span key={j} style={S.paramTag}>
                              {p.name}: {p.type}{p.required ? "*" : ""}
                              {p.range ? ` [${p.range.min},${p.range.max}]` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Related points */}
                      {cmd.related_point_ids?.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>关联点位: </span>
                          {cmd.related_point_ids.map((rid: string) => (
                            <span key={rid} style={{ ...S.badge("#e0e7ff"), color: "#4338ca", fontSize: 10, marginRight: 4 }}>{rid}</span>
                          ))}
                        </div>
                      )}
                      <div style={{ marginTop: 6 }}>
                        <span style={S.badge(cmd.confidence === "certain" ? "#22c55e" : cmd.confidence === "inferred" ? "#f59e0b" : "#ef4444")}>{cmd.confidence || "unknown"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Uncertainties */}
              {parseResult.uncertainties?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ ...S.sectionTitle, color: "#f59e0b" }}>⚠ 需确认 ({parseResult.uncertainties.length})</h4>
                  {parseResult.uncertainties.map((u: any, i: number) => (
                    <div key={i} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid #fef3c7" }}>
                      <span style={{ color: "#92400e" }}>{u.field}</span>: {u.reason}
                      {u.suggestion && <span style={{ color: "#0369a1", marginLeft: 8 }}>→ {u.suggestion}</span>}
                    </div>
                  ))}
                </div>
              )}

              <button style={{ ...S.btnPrimary, marginTop: 20 }} onClick={confirmParseAndCreate}>
                ✅ 确认并创建产品
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Dashboard ── */}
      {tab === "dashboard" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
          <div style={{ textAlign: "center", padding: 24, border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>产品数</div>
            <div style={{ fontSize: 40, fontWeight: 700 }}>{products.length}</div>
          </div>
          <div style={{ textAlign: "center", padding: 24, border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>数据库</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: health?.db === "connected" ? "#22c55e" : "#ef4444" }}>{health?.db || "?"}</div>
          </div>
          <div style={{ textAlign: "center", padding: 24, border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>版本</div>
            <div style={{ fontSize: 24, fontWeight: 600 }}>v{health?.version || "?"}</div>
          </div>
        </div>
      )}
    </div>
  );
}
