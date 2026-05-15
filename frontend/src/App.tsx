import { useState, useEffect, useCallback } from "react";

const API = "/api/v1";
const DT = ["int16","uint16","int32","uint32","float32","float64","bool","string"];
const AC = ["R","W","RW"];

type Product = { id: string; name: string; model: string; protocol: string; status: string; manufacturer?: string; description?: string };
type DataPoint = { id: string; identifier: string; name: string; data_type: string; unit: string; register: string; access: string; range_min?: number; range_max?: number; description?: string };
type Command = { id: string; identifier: string; name: string; method: string; parameters: any[]; description?: string };

function useApi() {
  return useCallback(async (method: string, url: string, body?: any) => {
    const opts: any = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${API}${url}`, opts);
    if (!r.ok && r.status !== 204) throw new Error(await r.text());
    return r.status === 204 ? null : r.json();
  }, []);
}

function Spinner() { return <div className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />; }

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = { green: "bg-green-100 text-green-700", blue: "bg-blue-100 text-blue-700", amber: "bg-amber-100 text-amber-700", red: "bg-red-100 text-red-700", gray: "bg-gray-100 text-gray-600", purple: "bg-purple-100 text-purple-700" };
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${colors[color] || colors.gray}`}>{children}</span>;
}

function InlineInput({ value, onChange, type = "text", className = "" }: { value: any; onChange: (v: string) => void; type?: string; className?: string }) {
  return <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} className={`border border-gray-300 rounded px-1.5 py-0.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`} />;
}

function InlineSelect({ value, onChange, options }: { value: any; onChange: (v: string) => void; options: string[] }) {
  return <select value={value ?? ""} onChange={e => onChange(e.target.value)} className="border border-gray-300 rounded px-1 py-0.5 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500">
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>;
}

export default function App() {
  const [tab, setTab] = useState<"products"|"parse"|"dashboard">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [health, setHealth] = useState<any>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ points: DataPoint[]; commands: Command[] } | null>(null);
  const [editingProduct, setEditingProduct] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [hint, setHint] = useState("");
  const [parseResult, setParseResult] = useState<any>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseStream, setParseStream] = useState("");
  const api = useApi();

  const loadProducts = useCallback(async () => { try { setProducts(await api("GET", "/products")); } catch {} }, [api]);
  const loadDetail = useCallback(async (pid: string) => {
    try {
      const [pts, cmds] = await Promise.all([api("GET", `/products/${pid}/points`), api("GET", `/products/${pid}/commands`)]);
      setDetail({ points: pts || [], commands: cmds || [] });
    } catch { setDetail(null); }
  }, [api]);

  useEffect(() => { loadProducts(); api("GET", "/health").then(setHealth).catch(() => {}); }, [loadProducts, api]);

  const saveProduct = async () => { if (!selected) return; await api("PATCH", `/products/${selected}`, editForm); setEditingProduct(false); loadProducts(); };
  const savePoint = async (pid: string, dp: DataPoint) => { await api("PATCH", `/products/${pid}/points/${dp.id}`, dp); };
  const addPoint = async (pid: string) => { await api("POST", `/products/${pid}/points`, { identifier: "new_point", name: "新点位", data_type: "uint16", access: "R" }); loadDetail(pid); };
  const delPoint = async (pid: string, dpid: string) => { await api("DELETE", `/products/${pid}/points/${dpid}`); loadDetail(pid); };
  const saveCmd = async (pid: string, cmd: Command) => { await api("PATCH", `/products/${pid}/commands/${cmd.id}`, cmd); };
  const addCmd = async (pid: string) => { await api("POST", `/products/${pid}/commands`, { identifier: "new_cmd", name: "新命令", parameters: [] }); loadDetail(pid); };
  const delCmd = async (pid: string, cmdid: string) => { await api("DELETE", `/products/${pid}/commands/${cmdid}`); loadDetail(pid); };
  const addParam = async (pid: string, cmd: Command) => { const np = [...(cmd.parameters || []), { name: "param", type: "int16", required: false }]; await api("PATCH", `/products/${pid}/commands/${cmd.id}`, { ...cmd, parameters: np }); loadDetail(pid); };
  const delParam = async (pid: string, cmd: Command, idx: number) => { const np = cmd.parameters.filter((_: any, i: number) => i !== idx); await api("PATCH", `/products/${pid}/commands/${cmd.id}`, { ...cmd, parameters: np }); loadDetail(pid); };
  const updateParam = async (pid: string, cmd: Command, idx: number, field: string, value: any) => { const np = [...cmd.parameters]; np[idx] = { ...np[idx], [field]: value }; await api("PATCH", `/products/${pid}/commands/${cmd.id}`, { ...cmd, parameters: np }); };

  const aiParse = async () => {
    setParseLoading(true); setParseResult(null); setParseStream("");
    try {
      const r = await fetch(`${API}/products/ai/parse`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: [], product_hint: hint || undefined }) });
      const reader = r.body?.getReader(); if (!reader) return;
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
          } catch {}
        }
        buf = buf.slice(buf.lastIndexOf("\n") + 1);
      }
    } catch (e: any) { setParseResult({ error: e.message }); }
    setParseLoading(false);
  };

  const confirmParse = async () => {
    if (!parseResult?.session_id) return;
    await api("POST", "/products/ai/review", { session_id: parseResult.session_id, product: parseResult.product || {}, data_points: parseResult.data_points || [], commands: parseResult.commands || [] });
    setParseResult(null); setHint(""); loadProducts();
  };

  const NavBtn = ({ t, label }: { t: typeof tab; label: string }) => (
    <button onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-blue-600 text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"}`}>{label}</button>
  );

  return (
    <div className="max-w-6xl mx-auto p-5 font-sans text-gray-800">
      <div className="flex justify-between items-center border-b pb-3 mb-6">
        <h1 className="text-xl font-bold">DeviceJoin IoT</h1>
        <div className="flex gap-2"><NavBtn t="products" label="产品" /><NavBtn t="parse" label="AI 接入" /><NavBtn t="dashboard" label="监控" /></div>
      </div>
      <div className="flex items-center gap-4 text-sm text-gray-500 mb-6 px-3">
        <span className={`inline-block w-2 h-2 rounded-full ${health?.status === "healthy" ? "bg-green-500" : "bg-amber-500"}`} />
        {health?.status ?? "..."} · DB: {health?.db ?? "?"} · v{health?.version ?? "?"}
      </div>

      {tab === "products" && (
        <div className="grid grid-cols-[300px_1fr] gap-6">
          <div>
            <div className="flex gap-2 mb-3">
              <button onClick={async () => { const n = prompt("产品名称"); if (n) { await api("POST", "/products", { name: n, model: n, protocol: "modbus_rtu", data_points: [], commands: [] }); loadProducts(); } }} className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">+ 创建产品</button>
              <button onClick={loadProducts} className="px-3 py-1.5 border rounded-md text-sm hover:bg-gray-50">🔄</button>
            </div>
            {products.length === 0 && <p className="text-gray-400 text-sm">暂无产品</p>}
            {products.map(p => (
              <div key={p.id} onClick={() => { setSelected(p.id); loadDetail(p.id); setEditingProduct(false); }}
                className={`p-3 mb-2 rounded-lg border cursor-pointer transition-colors ${selected === p.id ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">{p.name}</span>
                  <Badge color={p.status === "active" ? "green" : "gray"}>{p.status}</Badge>
                </div>
                <div className="text-xs text-gray-500 mt-1">{p.model} · <Badge color="purple">{p.protocol}</Badge></div>
              </div>
            ))}
          </div>
          <div>
            {selected && detail ? (
              <div className="border rounded-lg p-5">
                <div className="flex justify-between items-start mb-4">
                  {editingProduct ? (
                    <div className="flex-1 mr-3 space-y-2">
                      <input className="border rounded px-2 py-1 text-sm w-full" value={editForm.name || ""} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="产品名称" />
                      <input className="border rounded px-2 py-1 text-sm w-full" value={editForm.model || ""} onChange={e => setEditForm({ ...editForm, model: e.target.value })} placeholder="型号" />
                      <input className="border rounded px-2 py-1 text-sm w-full" value={editForm.manufacturer || ""} onChange={e => setEditForm({ ...editForm, manufacturer: e.target.value })} placeholder="厂商" />
                      <textarea className="border rounded px-2 py-1 text-sm w-full" rows={2} value={editForm.description || ""} onChange={e => setEditForm({ ...editForm, description: e.target.value })} placeholder="描述" />
                    </div>
                  ) : (
                    <div>
                      <h2 className="text-lg font-bold">{products.find(p => p.id === selected)?.name}</h2>
                      <p className="text-sm text-gray-500 mt-1">型号: {products.find(p => p.id === selected)?.model || "-"} · 协议: <Badge color="purple">{products.find(p => p.id === selected)?.protocol || "-"}</Badge></p>
                      <p className="text-sm text-gray-500">厂商: {products.find(p => p.id === selected)?.manufacturer || "-"}</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {editingProduct ? (
                      <><button onClick={() => setEditingProduct(false)} className="px-2 py-1 border rounded text-xs">取消</button><button onClick={saveProduct} className="px-2 py-1 bg-blue-600 text-white rounded text-xs">保存</button></>
                    ) : (
                      <button onClick={() => { const p = products.find(pp => pp.id === selected); if (p) { setEditForm({ name: p.name, model: p.model, manufacturer: p.manufacturer, description: p.description }); setEditingProduct(true); } }} className="px-2 py-1 border rounded text-xs hover:bg-gray-50">编辑</button>
                    )}
                    <button onClick={async () => { if (confirm("确认删除？")) { await api("DELETE", `/products/${selected}`); setSelected(null); setDetail(null); loadProducts(); } }} className="px-2 py-1 border border-red-200 text-red-600 rounded text-xs hover:bg-red-50">删除</button>
                  </div>
                </div>

                {/* Data Points */}
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-semibold">数据点位 ({detail.points.length})</h3>
                  <button onClick={() => addPoint(selected)} className="px-2 py-0.5 text-xs border border-green-200 text-green-700 rounded hover:bg-green-50">+ 添加</button>
                </div>
                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-xs border-collapse">
                    <thead><tr className="bg-gray-50 text-left">
                      <th className="p-1.5 border-b-2">名称</th><th className="p-1.5 border-b-2">标识符</th><th className="p-1.5 border-b-2">寄存器</th><th className="p-1.5 border-b-2 w-20">类型</th><th className="p-1.5 border-b-2 w-12">单位</th><th className="p-1.5 border-b-2 w-24">范围</th><th className="p-1.5 border-b-2 w-14">权限</th><th className="p-1.5 border-b-2 w-8"></th>
                    </tr></thead>
                    <tbody>
                      {detail.points.map(dp => (
                        <tr key={dp.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="p-1"><InlineInput value={dp.name} onChange={v => savePoint(selected, { ...dp, name: v })} /></td>
                          <td className="p-1"><InlineInput value={dp.identifier} onChange={v => savePoint(selected, { ...dp, identifier: v })} /></td>
                          <td className="p-1"><InlineInput value={dp.register} onChange={v => savePoint(selected, { ...dp, register: v })} /></td>
                          <td className="p-1"><InlineSelect value={dp.data_type} onChange={v => savePoint(selected, { ...dp, data_type: v })} options={DT} /></td>
                          <td className="p-1"><InlineInput value={dp.unit} onChange={v => savePoint(selected, { ...dp, unit: v })} /></td>
                          <td className="p-1 flex gap-1 items-center"><InlineInput value={dp.range_min} onChange={v => savePoint(selected, { ...dp, range_min: Number(v) || undefined })} type="number" />~<InlineInput value={dp.range_max} onChange={v => savePoint(selected, { ...dp, range_max: Number(v) || undefined })} type="number" /></td>
                          <td className="p-1"><InlineSelect value={dp.access} onChange={v => savePoint(selected, { ...dp, access: v })} options={AC} /></td>
                          <td className="p-1"><button onClick={() => delPoint(selected, dp.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Commands */}
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-sm font-semibold">命令 ({detail.commands.length})</h3>
                  <button onClick={() => addCmd(selected)} className="px-2 py-0.5 text-xs border border-green-200 text-green-700 rounded hover:bg-green-50">+ 添加</button>
                </div>
                <div className="space-y-2">
                  {detail.commands.map(cmd => (
                    <div key={cmd.id} className="border rounded-lg p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <InlineInput value={cmd.name} onChange={v => saveCmd(selected, { ...cmd, name: v })} className="flex-1 min-w-[100px]" />
                        <code className="text-[11px] text-gray-500"><InlineInput value={cmd.identifier} onChange={v => saveCmd(selected, { ...cmd, identifier: v })} className="w-28" /></code>
                        <InlineInput value={cmd.method} onChange={v => saveCmd(selected, { ...cmd, method: v })} className="w-16" />
                        <button onClick={() => delCmd(selected, cmd.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                        {(cmd.parameters || []).map((p: any, i: number) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px]">
                            <InlineInput value={p.name} onChange={v => updateParam(selected, cmd, i, "name", v)} className="w-14 border-blue-200" />
                            :
                            <InlineSelect value={p.type} onChange={v => updateParam(selected, cmd, i, "type", v)} options={DT} />
                            {p.required ? <span className="text-red-400">*</span> : null}
                            <button onClick={() => delParam(selected, cmd, i)} className="text-blue-400 hover:text-red-500 ml-1">✕</button>
                          </span>
                        ))}
                        <button onClick={() => addParam(selected, cmd)} className="px-2 py-0.5 text-[11px] border border-dashed border-gray-300 text-gray-500 rounded hover:border-green-300 hover:text-green-600">+ 参数</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="border rounded-lg p-8 text-center text-gray-400 text-sm">← 点击左侧产品查看和编辑详情</div>}
          </div>
        </div>
      )}

      {tab === "parse" && (
        <div className="max-w-2xl">
          <div className="border rounded-lg p-5 mb-4">
            <h3 className="font-semibold mb-2">AI 智能接入设备</h3>
            <p className="text-sm text-gray-500 mb-3">粘贴设备协议文档，AI 自动提取产品配置。</p>
            <textarea className="w-full border rounded-lg p-3 text-sm min-h-[120px] mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="粘贴设备协议文档内容..." value={hint} onChange={e => setHint(e.target.value)} />
            <button onClick={aiParse} disabled={parseLoading} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {parseLoading && <Spinner />}{parseLoading ? "AI 分析中..." : "🔍 AI 智能解析"}
            </button>
            {parseStream && <div className="mt-3 px-3 py-2 bg-blue-50 text-blue-700 rounded text-sm">⏳ {parseStream}</div>}
          </div>
          {parseResult && (
            <div className="border rounded-lg p-5">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold">{parseResult.product?.name || "解析结果"}</h3>
                <Badge color={parseResult.overall_confidence > 0.7 ? "green" : parseResult.overall_confidence > 0.4 ? "amber" : "red"}>置信度: {Math.round((parseResult.overall_confidence || 0) * 100)}%</Badge>
              </div>
              {parseResult.error && <div className="mb-3 px-3 py-2 bg-amber-50 text-amber-700 rounded text-sm">⚠ {parseResult.error}</div>}
              {parseResult.product?.protocol && <p className="text-sm text-gray-500 mb-3">协议: <Badge color="purple">{parseResult.product.protocol}</Badge> · 厂商: {parseResult.product.manufacturer || "-"}</p>}
              {parseResult.data_points?.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-sm font-semibold mb-2">数据点位 ({parseResult.data_points.length})</h4>
                  <table className="w-full text-xs border-collapse"><thead><tr className="bg-gray-50 text-left"><th className="p-1.5 border-b-2">名称</th><th className="p-1.5 border-b-2">寄存器</th><th className="p-1.5 border-b-2">类型</th><th className="p-1.5 border-b-2">范围</th><th className="p-1.5 border-b-2">权限</th><th className="p-1.5 border-b-2">置信度</th></tr></thead><tbody>
                    {parseResult.data_points.map((dp: any, i: number) => (
                      <tr key={i} className="border-b border-gray-100"><td className="p-1.5">{dp.name}</td><td className="p-1.5">{dp.register || "-"}</td><td className="p-1.5"><Badge color="purple">{dp.data_type}</Badge></td><td className="p-1.5">{dp.range_min != null ? `${dp.range_min}~${dp.range_max} ${dp.unit||""}` : "-"}</td><td className="p-1.5"><Badge color={dp.access === "RW" ? "amber" : "green"}>{dp.access}</Badge></td><td className="p-1.5"><Badge color={dp.confidence === "certain" ? "green" : dp.confidence === "inferred" ? "amber" : "red"}>{dp.confidence}</Badge></td></tr>
                    ))}
                  </tbody></table>
                </div>
              )}
              {parseResult.commands?.length > 0 && (
                <div className="mb-4"><h4 className="text-sm font-semibold mb-2">命令 ({parseResult.commands.length})</h4>
                  {parseResult.commands.map((cmd: any, i: number) => (
                    <div key={i} className="border rounded p-2 mb-1.5">
                      <div className="flex justify-between text-sm"><strong>{cmd.name}</strong><Badge color="purple">{cmd.method || "-"}</Badge></div>
                      <div className="text-xs text-gray-500 mt-1">{cmd.identifier}{cmd.description ? ` · ${cmd.description}` : ""}</div>
                      {cmd.parameters?.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{cmd.parameters.map((p: any, j: number) => (<span key={j} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">{p.name}: {p.type}{p.required?"*":""}{p.range?` [${p.range.min},${p.range.max}]`:""}</span>))}</div>}
                      {cmd.related_point_ids?.length > 0 && <div className="text-[10px] text-gray-400 mt-1">关联: {cmd.related_point_ids.join(", ")}</div>}
                    </div>
                  ))}
                </div>
              )}
              {parseResult.uncertainties?.length > 0 && <div className="mb-4"><h4 className="text-sm font-semibold text-amber-600 mb-2">⚠ 需确认 ({parseResult.uncertainties.length})</h4>{parseResult.uncertainties.map((u: any, i: number) => (<p key={i} className="text-xs text-amber-800 py-1 border-b border-amber-100"><b>{u.field}</b>: {u.reason}{u.suggestion ? <span className="text-blue-600 ml-2">→ {u.suggestion}</span> : null}</p>))}</div>}
              <button onClick={confirmParse} className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">✅ 确认并创建产品</button>
            </div>
          )}
        </div>
      )}

      {tab === "dashboard" && (
        <div className="grid grid-cols-3 gap-4">
          <div className="border rounded-lg p-6 text-center"><div className="text-sm text-gray-500">产品数</div><div className="text-3xl font-bold mt-1">{products.length}</div></div>
          <div className="border rounded-lg p-6 text-center"><div className="text-sm text-gray-500">数据库</div><div className={`text-xl font-semibold mt-1 ${health?.db === "connected" ? "text-green-600" : "text-red-500"}`}>{health?.db || "?"}</div></div>
          <div className="border rounded-lg p-6 text-center"><div className="text-sm text-gray-500">版本</div><div className="text-xl font-semibold mt-1">v{health?.version || "?"}</div></div>
        </div>
      )}
    </div>
  );
}
