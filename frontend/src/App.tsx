import { useState, useEffect } from "react";

const API = "/api/v1";

const S: any = {
  app: { fontFamily: "system-ui, sans-serif", maxWidth: 1100, margin: "0 auto", padding: 20 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px solid #eee", paddingBottom: 12, marginBottom: 24 },
  title: { margin: 0, fontSize: 24 },
  nav: { display: "flex", gap: 8 },
  btn: { padding: "6px 14px", border: "1px solid #ccc", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 13 },
  btnSm: { padding: "3px 8px", border: "1px solid #ccc", borderRadius: 4, background: "#fff", cursor: "pointer", fontSize: 11 },
  btnPrimary: { padding: "10px 20px", border: "none", borderRadius: 6, background: "#3b82f6", color: "#fff", cursor: "pointer", fontSize: 14 },
  btnDanger: { padding: "3px 8px", border: "1px solid #fecaca", borderRadius: 4, background: "#fef2f2", color: "#ef4444", cursor: "pointer", fontSize: 11 },
  btnGreen: { padding: "3px 8px", border: "1px solid #bbf7d0", borderRadius: 4, background: "#f0fdf4", color: "#16a34a", cursor: "pointer", fontSize: 11 },
  card: { border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 12 },
  inputSm: { padding: "3px 6px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 12, width: "100%", boxSizing: "border-box" } as React.CSSProperties,
  input: { padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, width: "100%", boxSizing: "border-box", marginBottom: 8 } as React.CSSProperties,
  textarea: { padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, width: "100%", boxSizing: "border-box", minHeight: 80, marginBottom: 8, fontFamily: "inherit" } as React.CSSProperties,
  label: { fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block", color: "#374151" } as React.CSSProperties,
  badge: (c: string) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: c, color: "#fff" }),
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 } as React.CSSProperties,
  th: { textAlign: "left", padding: "6px 8px", borderBottom: "2px solid #e5e7eb", background: "#f9fafb", fontWeight: 600 } as React.CSSProperties,
  td: { padding: "4px 6px", borderBottom: "1px solid #f3f4f6" } as React.CSSProperties,
  statusDot: (c: string) => ({ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c, marginRight: 6 }),
  flex: { display: "flex", gap: 12, flexWrap: "wrap" } as React.CSSProperties,
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } as React.CSSProperties,
  sectionTitle: { fontSize: 14, fontWeight: 600, margin: "16px 0 8px", color: "#1f2937", display: "flex", justifyContent: "space-between", alignItems: "center" } as React.CSSProperties,
  paramTag: { display: "inline-block", padding: "2px 6px", margin: "2px 4px 2px 0", background: "#eef2ff", color: "#4f46e5", borderRadius: 4, fontSize: 11 },
  selectSm: { padding: "3px 4px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 11 },
};

const DATA_TYPES = ["int16","uint16","int32","uint32","float32","float64","bool","string"];
const ACCESS_TYPES = ["R","W","RW"];

type Product = { id: string; name: string; model: string; protocol: string; status: string; manufacturer?: string; description?: string };
type DataPoint = { id: string; identifier: string; name: string; data_type: string; unit: string; register: string; access: string; range_min?: number; range_max?: number; description?: string };
type Command = { id: string; identifier: string; name: string; method: string; parameters: any[]; description?: string };
type Tab = "products" | "ai-parse" | "dashboard";

const newPoint = (): Partial<DataPoint> => ({ identifier: "", name: "", register: "", data_type: "uint16", unit: "", access: "R" });
const newCommand = (): Partial<Command> => ({ identifier: "", name: "", method: "", parameters: [] });

export default function App() {
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [health, setHealth] = useState<any>({});
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [productDetail, setProductDetail] = useState<{ points: DataPoint[]; commands: Command[] } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [parseHint, setParseHint] = useState("");
  const [parseResult, setParseResult] = useState<any>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseStream, setParseStream] = useState("");

  const fetchProducts = async () => {
    try { const r = await fetch(`${API}/products`); setProducts(await r.json()); } catch { }
  };
  useEffect(() => { fetchProducts(); fetch("/health").then(r => r.json()).then(setHealth).catch(() => {}); }, []);

  const api = async (method: string, url: string, body?: any) => {
    const opts: any = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(`${API}${url}`, opts);
  };

  const selectProduct = async (pid: string) => {
    setSelectedProduct(pid); setEditMode(false);
    try {
      const [pr, cr] = await Promise.all([fetch(`${API}/products/${pid}/points`), fetch(`${API}/products/${pid}/commands`)]);
      setProductDetail({ points: await pr.json(), commands: await cr.json() });
    } catch { setProductDetail(null); }
  };

  const saveEdit = async () => { if (!selectedProduct) return; await api("PATCH", `/products/${selectedProduct}`, editForm); setEditMode(false); fetchProducts(); };

  // ── DataPoint mutations ──
  const updatePoint = async (pid: string, dp: DataPoint) => { await api("PATCH", `/products/${pid}/points/${dp.id}`, dp); selectProduct(pid); };
  const deletePoint = async (pid: string, dpid: string) => { await api("DELETE", `/products/${pid}/points/${dpid}`); selectProduct(pid); };
  const addPoint = async (pid: string) => { await api("POST", `/products/${pid}/points`, newPoint()); selectProduct(pid); };

  // ── Command mutations ──
  const updateCmd = async (pid: string, cmd: Command) => { await api("PATCH", `/products/${pid}/commands/${cmd.id}`, cmd); selectProduct(pid); };
  const deleteCmd = async (pid: string, cmdid: string) => { await api("DELETE", `/products/${pid}/commands/${cmdid}`); selectProduct(pid); };
  const addCmd = async (pid: string) => { await api("POST", `/products/${pid}/commands`, newCommand()); selectProduct(pid); };

  // ── AI Parse ──
  const aiParse = async () => {
    setParseLoading(true); setParseResult(null); setParseStream("");
    try {
      const r = await fetch(`${API}/products/ai/parse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: [], product_hint: parseHint || undefined }) });
      const reader = r.body?.getReader(); if (!reader) throw new Error("No body");
      const decoder = new TextDecoder(); let buf = "", ev = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += decoder.decode(value, { stream: true });
        for (const line of buf.split("\n")) {
          if (line.startsWith("event: ")) ev = line.slice(7).trim();
          else if (line.startsWith("data: ")) try { const d = JSON.parse(line.slice(6));
            if (ev === "stage") setParseStream(d.message || "");
            else if (ev === "result") { setParseResult(d); setParseStream(""); }
            else if (ev === "error") { setParseResult({ error: d.message || d.error }); setParseStream(""); }
            else if (ev === "done") setParseStream("");
          } catch { }
        }
        const nl = buf.lastIndexOf("\n"); buf = nl >= 0 ? buf.slice(nl + 1) : buf;
      }
    } catch (e: any) { setParseResult({ error: e.message }); }
    setParseLoading(false);
  };

  const confirmParse = async () => {
    if (!parseResult?.session_id) return;
    const r = await api("POST", "/products/ai/review", { session_id: parseResult.session_id, product: parseResult.product || {}, data_points: parseResult.data_points || [], commands: parseResult.commands || [] });
    if (r.ok) { alert("产品创建成功！"); setParseResult(null); setParseHint(""); fetchProducts(); }
  };

  // ── inline editable cell ──
  const Ed = ({ value, onChange, style, as }: { value: any; onChange: (v: string) => void; style?: any; as?: string }) =>
    as === "select" ? <select style={{ ...S.inputSm, ...style }} value={value || ""} onChange={e => onChange(e.target.value)}>{DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
    : as === "access" ? <select style={{ ...S.inputSm, ...style }} value={value || ""} onChange={e => onChange(e.target.value)}>{ACCESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
    : <input style={{ ...S.inputSm, ...style }} value={value || ""} onChange={e => onChange(e.target.value)} />;

  return (
    <div style={S.app}>
      <div style={S.header}>
        <h1 style={S.title}>DeviceJoin IoT</h1>
        <div style={S.nav}>
          {(["products","ai-parse","dashboard"] as Tab[]).map(t => (
            <button key={t} style={tab === t ? S.btnPrimary : S.btn} onClick={() => setTab(t)}>{t === "products" ? "产品" : t === "ai-parse" ? "AI 接入" : "监控"}</button>
          ))}
        </div>
      </div>
      <div style={{ ...S.card, marginBottom: 20, display: "flex", gap: 16, alignItems: "center", fontSize: 13, padding: "8px 20px" }}>
        <span style={S.statusDot(health?.status === "healthy" ? "#22c55e" : "#f59e0b")} />{health?.status ?? "?"} · DB: {health?.db ?? "?"} · v{health?.version ?? "?"}
      </div>

      {tab === "products" && (
        <div style={S.grid2}>
          <div>
            <div style={{ ...S.flex, marginBottom: 12 }}>
              <button style={S.btnPrimary} onClick={async () => { const n = prompt("产品名称"); if (n) { await api("POST", "/products", { name: n, model: n, protocol: "modbus_rtu", data_points: [], commands: [] }); fetchProducts(); } }}>+ 创建产品</button>
              <button style={S.btn} onClick={fetchProducts}>🔄</button>
            </div>
            {products.map(p => (
              <div key={p.id} onClick={() => selectProduct(p.id)} style={{ ...S.card, padding: 12, cursor: "pointer", borderColor: selectedProduct === p.id ? "#3b82f6" : "#e5e7eb", background: selectedProduct === p.id ? "#f0f7ff" : "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 14 }}>{p.name}</strong>
                  <span style={S.badge(p.status === "active" ? "#22c55e" : "#9ca3af")}>{p.status}</span>
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{p.model} · <span style={S.badge("#6366f1")}>{p.protocol}</span></div>
              </div>
            ))}
          </div>
          <div>
            {selectedProduct && productDetail ? (
              <div style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <h3 style={{ margin: 0 }}>
                    {editMode ? <input style={S.input} value={editForm.name || ""} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="产品名称" />
                    : products.find(p => p.id === selectedProduct)?.name}
                  </h3>
                  <div style={{ display: "flex", gap: 6 }}>
                    {editMode ? <><button style={S.btnSm} onClick={() => setEditMode(false)}>取消</button><button style={{ ...S.btnSm, background: "#3b82f6", color: "#fff", border: "none" }} onClick={saveEdit}>保存</button></>
                    : <button style={S.btnSm} onClick={() => { const p = products.find(pp => pp.id === selectedProduct); if (p) setEditForm({ name: p.name, model: p.model, manufacturer: p.manufacturer, description: p.description }); setEditMode(true); }}>编辑</button>}
                    <button style={S.btnDanger} onClick={async () => { if (confirm("确认删除？")) { await api("DELETE", `/products/${selectedProduct}`); setSelectedProduct(null); setProductDetail(null); fetchProducts(); } }}>删除</button>
                  </div>
                </div>
                {editMode ? (
                  <div>
                    <label style={S.label}>型号</label><input style={S.input} value={editForm.model || ""} onChange={e => setEditForm({ ...editForm, model: e.target.value })} />
                    <label style={S.label}>厂商</label><input style={S.input} value={editForm.manufacturer || ""} onChange={e => setEditForm({ ...editForm, manufacturer: e.target.value })} />
                    <label style={S.label}>描述</label><textarea style={S.textarea} value={editForm.description || ""} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.8 }}>
                    <div><b>型号：</b>{products.find(p => p.id === selectedProduct)?.model || "-"}</div>
                    <div><b>协议：</b>{products.find(p => p.id === selectedProduct)?.protocol || "-"}</div>
                    <div><b>厂商：</b>{products.find(p => p.id === selectedProduct)?.manufacturer || "-"}</div>
                  </div>
                )}

                {/* Editable Data Points */}
                <div style={S.sectionTitle as React.CSSProperties}>
                  <span>数据点位 ({productDetail.points.length})</span>
                  <button style={S.btnGreen} onClick={() => addPoint(selectedProduct)}>+ 添加</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={S.table}><thead><tr>
                    <th style={S.th}>名称</th><th style={S.th}>标识符</th><th style={S.th}>寄存器</th><th style={S.th}>类型</th><th style={S.th}>单位</th><th style={S.th}>范围</th><th style={S.th}>权限</th><th style={S.th}></th>
                  </tr></thead><tbody>
                    {productDetail.points.map(dp => (
                      <tr key={dp.id}>
                        <td style={S.td}><Ed value={dp.name} onChange={v => updatePoint(selectedProduct, { ...dp, name: v })} /></td>
                        <td style={S.td}><Ed value={dp.identifier} onChange={v => updatePoint(selectedProduct, { ...dp, identifier: v })} /></td>
                        <td style={S.td}><Ed value={dp.register} onChange={v => updatePoint(selectedProduct, { ...dp, register: v })} style={{ width: 70 }} /></td>
                        <td style={S.td}><Ed value={dp.data_type} onChange={v => updatePoint(selectedProduct, { ...dp, data_type: v })} as="select" /></td>
                        <td style={S.td}><Ed value={dp.unit} onChange={v => updatePoint(selectedProduct, { ...dp, unit: v })} style={{ width: 50 }} /></td>
                        <td style={S.td}><Ed value={dp.range_min} onChange={v => updatePoint(selectedProduct, { ...dp, range_min: Number(v) || undefined })} style={{ width: 45 }} />~<Ed value={dp.range_max} onChange={v => updatePoint(selectedProduct, { ...dp, range_max: Number(v) || undefined })} style={{ width: 45, marginLeft: 2 }} /></td>
                        <td style={S.td}><Ed value={dp.access} onChange={v => updatePoint(selectedProduct, { ...dp, access: v })} as="access" /></td>
                        <td style={S.td}><button style={S.btnDanger} onClick={() => deletePoint(selectedProduct, dp.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>

                {/* Editable Commands */}
                <div style={S.sectionTitle as React.CSSProperties}>
                  <span>命令 ({productDetail.commands.length})</span>
                  <button style={S.btnGreen} onClick={() => addCmd(selectedProduct)}>+ 添加</button>
                </div>
                {productDetail.commands.map(cmd => (
                  <div key={cmd.id} style={{ ...S.card, padding: 10, marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <Ed value={cmd.name} onChange={v => updateCmd(selectedProduct, { ...cmd, name: v })} style={{ flex: 1, minWidth: 100 }} />
                      <code style={{ fontSize: 11, color: "#6b7280" }}>
                        <Ed value={cmd.identifier} onChange={v => updateCmd(selectedProduct, { ...cmd, identifier: v })} style={{ width: 120 }} />
                      </code>
                      <Ed value={cmd.method} onChange={v => updateCmd(selectedProduct, { ...cmd, method: v })} style={{ width: 70 }} />
                      <button style={S.btnDanger} onClick={() => deleteCmd(selectedProduct, cmd.id)}>✕</button>
                    </div>
                    {/* Editable Parameters */}
                    <div style={{ marginTop: 6 }}>
                      {cmd.parameters?.map((p: any, pi: number) => (
                        <span key={pi} style={{ ...S.paramTag, display: "inline-flex", gap: 4, alignItems: "center", margin: 2 }}>
                          <Ed value={p.name} onChange={v => { const np = [...cmd.parameters]; np[pi] = { ...np[pi], name: v }; updateCmd(selectedProduct, { ...cmd, parameters: np }); }} style={{ width: 60, border: "none", background: "transparent", padding: 0 }} />:
                          <Ed value={p.type} onChange={v => { const np = [...cmd.parameters]; np[pi] = { ...np[pi], type: v }; updateCmd(selectedProduct, { ...cmd, parameters: np }); }} as="select" style={{ width: 60, border: "none", background: "transparent", padding: 0, fontSize: 10 }} />
                          {p.required ? "*" : ""}
                          <button style={{ ...S.btnDanger, fontSize: 9, padding: "1px 4px" }} onClick={() => { const np = cmd.parameters.filter((_: any, j: number) => j !== pi); updateCmd(selectedProduct, { ...cmd, parameters: np }); }}>✕</button>
                        </span>
                      ))}
                      <button style={{ ...S.btnGreen, fontSize: 10, padding: "2px 6px", margin: 2 }} onClick={() => { const np = [...(cmd.parameters || []), { name: "param", type: "int16", required: false }]; updateCmd(selectedProduct, { ...cmd, parameters: np }); }}>+参数</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : <div style={S.card}><p style={{ color: "#9ca3af", textAlign: "center" }}>← 点击左侧产品查看详情</p></div>}
          </div>
        </div>
      )}

      {tab === "ai-parse" && (
        <div style={{ maxWidth: 800 }}>
          <div style={S.card}>
            <h3 style={{ margin: "0 0 8px" }}>AI 智能接入设备</h3>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>粘贴设备协议文档，AI 自动提取产品配置。</p>
            <textarea style={{ ...S.textarea, minHeight: 120 }} placeholder="粘贴设备协议文档内容..." value={parseHint} onChange={e => setParseHint(e.target.value)} />
            <button style={S.btnPrimary} onClick={aiParse} disabled={parseLoading}>{parseLoading ? "AI 分析中..." : "🔍 AI 智能解析"}</button>
            {parseStream && <div style={{ marginTop: 12, padding: "8px 16px", background: "#f0f9ff", borderRadius: 6, fontSize: 13, color: "#0369a1" }}>⏳ {parseStream}</div>}
          </div>
          {parseResult && (
            <div style={S.card}>
              <div style={{ ...S.flex, justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>{parseResult.product?.name || "解析结果"}</h3>
                <span style={S.badge(parseResult.overall_confidence > 0.7 ? "#22c55e" : parseResult.overall_confidence > 0.4 ? "#f59e0b" : "#ef4444")}>置信度: {Math.round((parseResult.overall_confidence || 0) * 100)}%</span>
              </div>
              {parseResult.error && <p style={{ color: "#f59e0b", fontSize: 13, padding: 8, background: "#fefce8", borderRadius: 4 }}>⚠ {parseResult.error}</p>}
              {parseResult.product?.protocol && <p style={{ fontSize: 13, color: "#4b5563" }}>协议: <span style={S.badge("#6366f1")}>{parseResult.product.protocol}</span> · {parseResult.product.manufacturer || ""}</p>}

              {parseResult.data_points?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={S.sectionTitle}>数据点位 ({parseResult.data_points.length})</div>
                  <table style={S.table}><thead><tr><th style={S.th}>名称</th><th style={S.th}>标识符</th><th style={S.th}>寄存器</th><th style={S.th}>类型</th><th style={S.th}>单位</th><th style={S.th}>范围</th><th style={S.th}>权限</th><th style={S.th}>置信度</th></tr></thead><tbody>
                    {parseResult.data_points.map((dp: any, i: number) => (
                      <tr key={i}>
                        <td style={S.td}>{dp.name}</td><td style={S.td}><code style={{ fontSize: 11 }}>{dp.identifier}</code></td><td style={S.td}>{dp.register || "-"}</td>
                        <td style={S.td}><span style={S.badge("#8b5cf6")}>{dp.data_type}</span></td><td style={S.td}>{dp.unit || "-"}</td>
                        <td style={S.td}>{dp.range_min != null ? `${dp.range_min}~${dp.range_max}` : "-"}</td>
                        <td style={S.td}><span style={S.badge(dp.access === "RW" ? "#f59e0b" : "#22c55e")}>{dp.access}</span></td>
                        <td style={S.td}><span style={S.badge(dp.confidence === "certain" ? "#22c55e" : dp.confidence === "inferred" ? "#f59e0b" : "#ef4444")}>{dp.confidence}</span></td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              )}

              {parseResult.commands?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={S.sectionTitle}>命令 ({parseResult.commands.length})</div>
                  {parseResult.commands.map((cmd: any, i: number) => (
                    <div key={i} style={{ ...S.card, padding: 10, marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong>{cmd.name}</strong><span style={S.badge("#8b5cf6")}>{cmd.method || "-"}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}><code>{cmd.identifier}</code>{cmd.description ? ` · ${cmd.description}` : ""}</div>
                      {cmd.parameters?.length > 0 && <div style={{ marginTop: 6 }}>{cmd.parameters.map((p: any, j: number) => (<span key={j} style={S.paramTag}>{p.name}: {p.type}{p.required ? "*" : ""}{p.range ? ` [${p.range.min},${p.range.max}]` : ""}</span>))}</div>}
                      {cmd.related_point_ids?.length > 0 && <div style={{ marginTop: 6, fontSize: 11, color: "#9ca3af" }}>关联点位: {cmd.related_point_ids.map((rid: string) => <span key={rid} style={{ ...S.badge("#e0e7ff"), color: "#4338ca", fontSize: 10, marginRight: 4 }}>{rid}</span>)}</div>}
                    </div>
                  ))}
                </div>
              )}
              {parseResult.uncertainties?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ ...S.sectionTitle, color: "#f59e0b" } as React.CSSProperties}>⚠ 需确认 ({parseResult.uncertainties.length})</div>
                  {parseResult.uncertainties.map((u: any, i: number) => (<div key={i} style={{ fontSize: 13, padding: "4px 0", borderBottom: "1px solid #fef3c7" }}><span style={{ color: "#92400e" }}>{u.field}</span>: {u.reason}{u.suggestion ? <span style={{ color: "#0369a1", marginLeft: 8 }}>→ {u.suggestion}</span> : null}</div>))}
                </div>
              )}
              <button style={{ ...S.btnPrimary, marginTop: 20 }} onClick={confirmParse}>✅ 确认并创建产品</button>
            </div>
          )}
        </div>
      )}

      {tab === "dashboard" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
          <div style={{ textAlign: "center", padding: 24, border: "1px solid #e5e7eb", borderRadius: 8 }}><div style={{ fontSize: 13, color: "#6b7280" }}>产品数</div><div style={{ fontSize: 40, fontWeight: 700 }}>{products.length}</div></div>
          <div style={{ textAlign: "center", padding: 24, border: "1px solid #e5e7eb", borderRadius: 8 }}><div style={{ fontSize: 13, color: "#6b7280" }}>数据库</div><div style={{ fontSize: 24, fontWeight: 600, color: health?.db === "connected" ? "#22c55e" : "#ef4444" }}>{health?.db || "?"}</div></div>
          <div style={{ textAlign: "center", padding: 24, border: "1px solid #e5e7eb", borderRadius: 8 }}><div style={{ fontSize: 13, color: "#6b7280" }}>版本</div><div style={{ fontSize: 24, fontWeight: 600 }}>v{health?.version || "?"}</div></div>
        </div>
      )}
    </div>
  );
}
