import { useState, useEffect, useCallback, useRef } from "react";

const API = "/api/v1";
const DT = ["int16","uint16","int32","uint32","float32","float64","bool","string"];
const AC = ["R","W","RW"];
const REGISTERS = ["holding","input","coil","discrete"];

type Product = { id: string; name: string; model: string; protocol: string; status: string; manufacturer?: string; description?: string };
type DataPoint = { id: string; identifier: string; name: string; data_type: string; unit: string; register: string; access: string; range_min?: number; range_max?: number; description?: string };
type Command = { id: string; identifier: string; name: string; method: string; parameters: any[]; description?: string };

function useApi() {
  return useCallback(async (method: string, url: string, body?: any) => {
    const opts: any = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${API}${url}`, opts);
    if (!r.ok && r.status !== 204) {
      const text = await r.text();
      throw new Error(text);
    }
    return r.status === 204 ? null : r.json();
  }, []);
}

function Spinner({ size = "w-4 h-4" }: { size?: string }) {
  return <div className={`inline-block ${size} border-2 border-current border-t-transparent rounded-full animate-spin`} />;
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20",
    blue: "bg-blue-50 text-blue-700 ring-1 ring-blue-600/20",
    amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20",
    red: "bg-red-50 text-red-700 ring-1 ring-red-600/20",
    gray: "bg-gray-50 text-gray-600 ring-1 ring-gray-500/20",
    purple: "bg-violet-50 text-violet-700 ring-1 ring-violet-600/20",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${colors[color] || colors.gray}`}>{children}</span>;
}

function InlineInput({ value, onChange, type = "text", className = "", placeholder }: { value: any; onChange: (v: string) => void; type?: string; className?: string; placeholder?: string }) {
  return <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={`border border-gray-200 rounded-md px-2 py-1 text-xs w-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors ${className}`} />;
}

function InlineSelect({ value, onChange, options }: { value: any; onChange: (v: string) => void; options: string[] }) {
  return <select value={value ?? ""} onChange={e => onChange(e.target.value)} className="border border-gray-200 rounded-md px-2 py-1 text-xs w-full bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors">
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>;
}

function Toast({ message, type = "info", onClose }: { message: string; type?: "info" | "success" | "error"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  const colors = { info: "bg-blue-50 text-blue-800 ring-blue-200", success: "bg-emerald-50 text-emerald-800 ring-emerald-200", error: "bg-red-50 text-red-800 ring-red-200" };
  return <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg text-sm ring-1 ${colors[type]} shadow-lg z-50 animate-in`}>{message}</div>;
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return <div className="flex flex-col items-center justify-center py-12 text-gray-400">
    <span className="text-3xl mb-2">{icon}</span>
    <p className="font-medium text-sm">{title}</p>
    <p className="text-xs mt-1">{desc}</p>
  </div>;
}

export default function App() {
  const [tab, setTab] = useState<"products"|"parse"|"dashboard">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ points: DataPoint[]; commands: Command[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [hint, setHint] = useState("");
  const [parseResult, setParseResult] = useState<any>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseStream, setParseStream] = useState("");
  const [parseFiles, setParseFiles] = useState<File[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "info" | "success" | "error" } | null>(null);
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const api = useApi();

  const notify = (message: string, type: "info" | "success" | "error" = "info") => setToast({ message, type });

  const loadProducts = useCallback(async () => {
    try {
      const data = await api("GET", "/products");
      setProducts(Array.isArray(data) ? data : []);
    } catch { notify("加载产品失败", "error"); }
  }, [api]);

  const loadDetail = useCallback(async (pid: string) => {
    setDetailLoading(true);
    try {
      const [pts, cmds] = await Promise.all([api("GET", `/products/${pid}/points`), api("GET", `/products/${pid}/commands`)]);
      setDetail({ points: Array.isArray(pts) ? pts : [], commands: Array.isArray(cmds) ? cmds : [] });
    } catch { setDetail(null); notify("加载详情失败", "error"); }
    setDetailLoading(false);
  }, [api]);

  useEffect(() => {
    loadProducts();
    fetch("/health").then(r => r.json()).then(setHealth).catch(() => {}).finally(() => setHealthLoading(false));
  }, [loadProducts]);

  const saveProduct = async () => {
    if (!selected) return;
    try {
      await api("PATCH", `/products/${selected}`, editForm);
      setEditingProduct(false);
      loadProducts();
      notify("产品已更新", "success");
    } catch (e: any) { notify(e.message || "更新失败", "error"); }
  };

  const savePoint = async (pid: string, dp: DataPoint) => {
    try { await api("PATCH", `/products/${pid}/points/${dp.id}`, dp); } catch { notify("保存失败", "error"); }
  };

  const addPoint = async (pid: string) => {
    try {
      await api("POST", `/products/${pid}/points`, { identifier: "new_point", name: "新点位", data_type: "uint16", register: "holding", access: "R", unit: "" });
      loadDetail(pid);
      notify("已添加点位", "success");
    } catch (e: any) { notify(e.message || "添加失败", "error"); }
  };

  const delPoint = async (pid: string, dpid: string) => {
    if (!confirm("确认删除此点位？")) return;
    try { await api("DELETE", `/products/${pid}/points/${dpid}`); loadDetail(pid); notify("已删除", "success"); } catch (e: any) { notify(e.message, "error"); }
  };

  const saveCmd = async (pid: string, cmd: Command) => {
    try { await api("PATCH", `/products/${pid}/commands/${cmd.id}`, cmd); } catch { notify("保存失败", "error"); }
  };

  const addCmd = async (pid: string) => {
    try {
      await api("POST", `/products/${pid}/commands`, { identifier: "new_cmd", name: "新命令", method: "GET", parameters: [] });
      loadDetail(pid);
      notify("已添加命令", "success");
    } catch (e: any) { notify(e.message || "添加失败", "error"); }
  };

  const delCmd = async (pid: string, cmdid: string) => {
    if (!confirm("确认删除此命令？")) return;
    try { await api("DELETE", `/products/${pid}/commands/${cmdid}`); loadDetail(pid); notify("已删除", "success"); } catch (e: any) { notify(e.message, "error"); }
  };

  const addParam = async (pid: string, cmd: Command) => {
    const np = [...(cmd.parameters || []), { name: "param", type: "int16", required: false }];
    try { await api("PATCH", `/products/${pid}/commands/${cmd.id}`, { ...cmd, parameters: np }); loadDetail(pid); } catch { notify("添加失败", "error"); }
  };

  const delParam = async (pid: string, cmd: Command, idx: number) => {
    const np = cmd.parameters.filter((_: any, i: number) => i !== idx);
    try { await api("PATCH", `/products/${pid}/commands/${cmd.id}`, { ...cmd, parameters: np }); loadDetail(pid); } catch { notify("删除失败", "error"); }
  };

  const updateParam = async (pid: string, cmd: Command, idx: number, field: string, value: any) => {
    const np = [...cmd.parameters];
    np[idx] = { ...np[idx], [field]: value };
    try { await api("PATCH", `/products/${pid}/commands/${cmd.id}`, { ...cmd, parameters: np }); } catch { notify("更新失败", "error"); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setParseFiles(Array.from(e.target.files));
  };

  const readFilesAsText = async (files: File[]): Promise<string> => {
    const texts = await Promise.all(files.map(f => f.text()));
    return texts.join("\n\n");
  };

  const aiParse = async () => {
    let content = hint;
    if (parseFiles.length > 0) {
      const fileContent = await readFilesAsText(parseFiles);
      content = content ? `${content}\n\n${fileContent}` : fileContent;
    }
    if (!content.trim()) { notify("请输入协议文档内容或上传文件", "error"); return; }

    setParseLoading(true); setParseResult(null); setParseStream("");
    try {
      const r = await fetch(`${API}/products/ai/parse`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: [], product_hint: content }),
      });
      const reader = r.body?.getReader(); if (!reader) throw new Error("SSE not supported");
      const decoder = new TextDecoder(); let buf = "", ev = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += decoder.decode(value, { stream: true });
        for (const line of buf.split("\n")) {
          if (line.startsWith("event: ")) ev = line.slice(7).trim();
          else if (line.startsWith("data: ")) try {
            const d = JSON.parse(line.slice(6));
            if (ev === "stage") setParseStream(d.message || "");
            else if (ev === "result") { setParseResult(d); setParseStream(""); }
            else if (ev === "error") { setParseResult({ error: d.message || d.error }); setParseStream(""); notify("解析出错", "error"); }
          } catch {}
        }
        buf = buf.slice(buf.lastIndexOf("\n") + 1);
      }
    } catch (e: any) { setParseResult({ error: e.message }); notify("解析失败", "error"); }
    setParseLoading(false);
  };

  const confirmParse = async () => {
    if (!parseResult?.session_id) return;
    try {
      await api("POST", "/products/ai/review", {
        session_id: parseResult.session_id,
        product: parseResult.product || {},
        data_points: parseResult.data_points || [],
        commands: parseResult.commands || [],
      });
      setParseResult(null); setHint(""); setParseFiles([]);
      loadProducts();
      notify("产品创建成功", "success");
      setTab("products");
    } catch (e: any) { notify(e.message || "创建失败", "error"); }
  };

  const filteredProducts = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.model.toLowerCase().includes(search.toLowerCase()) || p.protocol.toLowerCase().includes(search.toLowerCase())
  );

  const selectedProduct = products.find(p => p.id === selected);

  const NavBtn = ({ t, label, icon }: { t: typeof tab; label: string; icon: string }) => (
    <button onClick={() => setTab(t)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
      <span>{icon}</span>{label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">D</span>
              </div>
              <h1 className="text-base font-bold text-gray-900">DeviceJoin IoT</h1>
            </div>
            <nav className="flex items-center gap-1">
              <NavBtn t="products" label="产品" icon="📦" />
              <NavBtn t="parse" label="AI 接入" icon="🤖" />
              <NavBtn t="dashboard" label="监控" icon="📊" />
            </nav>
          </div>
        </div>
      </header>

      {/* Status Bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-3 text-xs text-gray-500">
          {healthLoading ? (
            <span className="flex items-center gap-1.5"><Spinner size="w-3 h-3" />加载状态...</span>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${health?.status === "healthy" ? "bg-emerald-500" : health?.status === "degraded" ? "bg-amber-500" : "bg-red-500"}`} />
                {health?.status === "healthy" ? "运行正常" : health?.status === "degraded" ? "部分异常" : "离线"}
              </span>
              <span className="text-gray-300">|</span>
              <span>数据库: <span className={health?.db === "connected" ? "text-emerald-600 font-medium" : "text-red-500"}>{health?.db === "connected" ? "已连接" : health?.db || "未知"}</span></span>
              <span className="text-gray-300">|</span>
              <span>v{health?.version || "0.1.0"}</span>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {tab === "products" && (
          <div className="grid grid-cols-[280px_1fr] gap-6">
            {/* Sidebar */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <button onClick={async () => {
                  const n = prompt("产品名称");
                  if (n) {
                    try {
                      await api("POST", "/products", { name: n, model: n, protocol: "modbus_rtu", data_points: [], commands: [] });
                      loadProducts();
                      notify("产品已创建", "success");
                    } catch (e: any) { notify(e.message || "创建失败", "error"); }
                  }
                }} className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">+ 创建产品</button>
                <button onClick={loadProducts} className="px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors" title="刷新">🔄</button>
              </div>
              <input type="text" placeholder="搜索产品..." value={search} onChange={e => setSearch(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400" />
              <div className="space-y-1">
                {filteredProducts.length === 0 && (
                  <EmptyState icon="📦" title={search ? "无匹配产品" : "暂无产品"} desc={search ? "尝试其他关键词" : "点击上方按钮创建第一个产品"} />
                )}
                {filteredProducts.map(p => (
                  <div key={p.id} onClick={() => { setSelected(p.id); loadDetail(p.id); setEditingProduct(false); }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${selected === p.id ? "border-blue-300 bg-blue-50/50 shadow-sm" : "border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white"}`}>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm text-gray-900 truncate">{p.name}</span>
                      <Badge color={p.status === "active" ? "green" : "gray"}>{p.status === "active" ? "启用" : "停用"}</Badge>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500">
                      <span className="truncate">{p.model}</span>
                      <span className="text-gray-300">·</span>
                      <Badge color="purple">{p.protocol}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Detail Panel */}
            <div>
              {selected && selectedProduct ? (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  {/* Product Header */}
                  <div className="p-5 border-b border-gray-100">
                    {editingProduct ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-xs font-medium text-gray-500 mb-1">产品名称</label><input className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400" value={editForm.name || ""} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
                          <div><label className="block text-xs font-medium text-gray-500 mb-1">型号</label><input className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400" value={editForm.model || ""} onChange={e => setEditForm({ ...editForm, model: e.target.value })} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><label className="block text-xs font-medium text-gray-500 mb-1">厂商</label><input className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400" value={editForm.manufacturer || ""} onChange={e => setEditForm({ ...editForm, manufacturer: e.target.value })} /></div>
                          <div><label className="block text-xs font-medium text-gray-500 mb-1">协议</label><input className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400" value={editForm.protocol || ""} onChange={e => setEditForm({ ...editForm, protocol: e.target.value })} /></div>
                        </div>
                        <div><label className="block text-xs font-medium text-gray-500 mb-1">描述</label><textarea className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400" rows={2} value={editForm.description || ""} onChange={e => setEditForm({ ...editForm, description: e.target.value })} /></div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingProduct(false)} className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">取消</button>
                          <button onClick={saveProduct} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">保存</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start">
                        <div>
                          <h2 className="text-lg font-bold text-gray-900">{selectedProduct.name}</h2>
                          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-gray-500">
                            <span>型号: {selectedProduct.model || "-"}</span>
                            <span className="text-gray-300">|</span>
                            <span>厂商: {selectedProduct.manufacturer || "-"}</span>
                            <span className="text-gray-300">|</span>
                            <Badge color="purple">{selectedProduct.protocol}</Badge>
                          </div>
                          {selectedProduct.description && <p className="text-sm text-gray-500 mt-2">{selectedProduct.description}</p>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditForm({ name: selectedProduct.name, model: selectedProduct.model, manufacturer: selectedProduct.manufacturer, description: selectedProduct.description, protocol: selectedProduct.protocol }); setEditingProduct(true); }} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50">编辑</button>
                          <button onClick={async () => { if (confirm("确认删除此产品？此操作不可撤销。")) { await api("DELETE", `/products/${selected}`); setSelected(null); setDetail(null); loadProducts(); notify("已删除", "success"); } }} className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-xs font-medium hover:bg-red-50">删除</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {detailLoading ? (
                    <div className="p-8 flex justify-center"><Spinner size="w-6 h-6" /></div>
                  ) : detail ? (
                    <div className="p-5 space-y-6">
                      {/* Data Points */}
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                            📍 数据点位
                            <span className="text-xs font-normal text-gray-400">({detail.points.length})</span>
                          </h3>
                          <button onClick={() => addPoint(selected)} className="px-3 py-1.5 text-xs font-medium border border-green-200 text-green-700 rounded-lg hover:bg-green-50 transition-colors">+ 添加点位</button>
                        </div>
                        {detail.points.length === 0 ? (
                          <EmptyState icon="📍" title="暂无数据点位" desc="点击上方按钮添加或等待 AI 解析" />
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full text-xs">
                              <thead><tr className="bg-gray-50/80 text-left text-gray-500 font-medium">
                                <th className="p-2.5 border-b">名称</th><th className="p-2.5 border-b">标识符</th><th className="p-2.5 border-b">寄存器</th><th className="p-2.5 border-b w-24">类型</th><th className="p-2.5 border-b w-16">单位</th><th className="p-2.5 border-b">范围</th><th className="p-2.5 border-b w-16">权限</th><th className="p-2.5 border-b w-8"></th>
                              </tr></thead>
                              <tbody>
                                {detail.points.map(dp => (
                                  <tr key={dp.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                                    <td className="p-1.5"><InlineInput value={dp.name} onChange={v => savePoint(selected, { ...dp, name: v })} placeholder="名称" /></td>
                                    <td className="p-1.5"><InlineInput value={dp.identifier} onChange={v => savePoint(selected, { ...dp, identifier: v })} placeholder="identifier" /></td>
                                    <td className="p-1.5"><InlineSelect value={dp.register || "holding"} onChange={v => savePoint(selected, { ...dp, register: v })} options={REGISTERS} /></td>
                                    <td className="p-1.5"><InlineSelect value={dp.data_type} onChange={v => savePoint(selected, { ...dp, data_type: v })} options={DT} /></td>
                                    <td className="p-1.5"><InlineInput value={dp.unit} onChange={v => savePoint(selected, { ...dp, unit: v })} placeholder="°C" /></td>
                                    <td className="p-1.5"><div className="flex items-center gap-1"><InlineInput value={dp.range_min ?? ""} onChange={v => savePoint(selected, { ...dp, range_min: v ? Number(v) : undefined })} type="number" placeholder="min" /><span className="text-gray-300">~</span><InlineInput value={dp.range_max ?? ""} onChange={v => savePoint(selected, { ...dp, range_max: v ? Number(v) : undefined })} type="number" placeholder="max" /></div></td>
                                    <td className="p-1.5"><InlineSelect value={dp.access} onChange={v => savePoint(selected, { ...dp, access: v })} options={AC} /></td>
                                    <td className="p-1.5"><button onClick={() => delPoint(selected, dp.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1" title="删除">✕</button></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Commands */}
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                            ⚡ 命令
                            <span className="text-xs font-normal text-gray-400">({detail.commands.length})</span>
                          </h3>
                          <button onClick={() => addCmd(selected)} className="px-3 py-1.5 text-xs font-medium border border-green-200 text-green-700 rounded-lg hover:bg-green-50 transition-colors">+ 添加命令</button>
                        </div>
                        {detail.commands.length === 0 ? (
                          <EmptyState icon="⚡" title="暂无命令" desc="添加设备控制命令" />
                        ) : (
                          <div className="space-y-2">
                            {detail.commands.map(cmd => (
                              <div key={cmd.id} className="border border-gray-200 rounded-xl p-3 hover:border-gray-300 transition-colors">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <InlineInput value={cmd.name} onChange={v => saveCmd(selected, { ...cmd, name: v })} className="flex-1 min-w-[120px]" placeholder="命令名称" />
                                  <code className="text-[11px] text-gray-400"><InlineInput value={cmd.identifier} onChange={v => saveCmd(selected, { ...cmd, identifier: v })} className="w-28 font-mono" placeholder="identifier" /></code>
                                  <InlineInput value={cmd.method || "GET"} onChange={v => saveCmd(selected, { ...cmd, method: v })} className="w-16" placeholder="GET" />
                                  <button onClick={() => delCmd(selected, cmd.id)} className="text-gray-300 hover:text-red-500 transition-colors p-1" title="删除">✕</button>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                                  {(cmd.parameters || []).map((p: any, i: number) => (
                                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-[11px] ring-1 ring-blue-100">
                                      <InlineInput value={p.name} onChange={v => updateParam(selected, cmd, i, "name", v)} className="w-14 border-blue-200 bg-white" placeholder="name" />
                                      <span className="text-blue-300">:</span>
                                      <InlineSelect value={p.type} onChange={v => updateParam(selected, cmd, i, "type", v)} options={DT} />
                                      {p.required && <span className="text-red-400 font-bold">*</span>}
                                      <button onClick={() => delParam(selected, cmd, i)} className="text-blue-300 hover:text-red-500 ml-0.5 transition-colors">✕</button>
                                    </span>
                                  ))}
                                  <button onClick={() => addParam(selected, cmd)} className="px-2 py-1 text-[11px] border border-dashed border-gray-300 text-gray-400 rounded-md hover:border-green-300 hover:text-green-600 transition-colors">+ 参数</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <EmptyState icon="⚠️" title="加载失败" desc="请重试" />
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12">
                  <EmptyState icon="👈" title="选择产品" desc="从左侧列表选择一个产品查看详情和编辑" />
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "parse" && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🤖</span>
                <h3 className="text-base font-bold text-gray-900">AI 智能接入设备</h3>
              </div>
              <p className="text-sm text-gray-500 mb-4">粘贴设备协议文档或上传文件，AI 将自动提取产品配置、数据点位和命令。</p>

              <div className="space-y-3">
                <textarea className="w-full border border-gray-200 rounded-xl p-4 text-sm min-h-[140px] focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 resize-y font-mono" placeholder="粘贴设备协议文档内容（Modbus, OPC-UA, MQTT...）" value={hint} onChange={e => setHint(e.target.value)} />

                <div className="flex items-center gap-3">
                  <input ref={fileInputRef} type="file" multiple accept=".txt,.pdf,.md,.csv,.json,.xml" onChange={handleFileChange} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2">
                    📎 上传文件
                  </button>
                  {parseFiles.length > 0 && (
                    <span className="text-xs text-gray-500">{parseFiles.length} 个文件已选择: {parseFiles.map(f => f.name).join(", ")}</span>
                  )}
                </div>

                <button onClick={aiParse} disabled={parseLoading} className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm">
                  {parseLoading && <Spinner />}
                  {parseLoading ? "AI 分析中..." : "🔍 AI 智能解析"}
                </button>
              </div>

              {parseStream && (
                <div className="mt-4 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl text-sm flex items-center gap-2">
                  <Spinner size="w-3.5 h-3.5" /> {parseStream}
                </div>
              )}
            </div>

            {parseResult && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base font-bold text-gray-900">{parseResult.product?.name || "解析结果"}</h3>
                  <Badge color={parseResult.overall_confidence > 0.7 ? "green" : parseResult.overall_confidence > 0.4 ? "amber" : "red"}>置信度 {Math.round((parseResult.overall_confidence || 0) * 100)}%</Badge>
                </div>

                {parseResult.error && (
                  <div className="mb-4 px-4 py-3 bg-amber-50 text-amber-700 rounded-xl text-sm ring-1 ring-amber-200">⚠️ {parseResult.error}</div>
                )}

                {parseResult.product?.protocol && (
                  <div className="flex flex-wrap gap-2 mb-4 text-sm text-gray-500">
                    <span>协议: <Badge color="purple">{parseResult.product.protocol}</Badge></span>
                    <span>厂商: {parseResult.product.manufacturer || "-"}</span>
                  </div>
                )}

                {parseResult.data_points?.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">📍 数据点位 ({parseResult.data_points.length})</h4>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-gray-50/80 text-left text-gray-500 font-medium">
                          <th className="p-2.5 border-b">名称</th><th className="p-2.5 border-b">寄存器</th><th className="p-2.5 border-b">类型</th><th className="p-2.5 border-b">范围</th><th className="p-2.5 border-b">权限</th><th className="p-2.5 border-b">置信度</th>
                        </tr></thead>
                        <tbody>
                          {parseResult.data_points.map((dp: any, i: number) => (
                            <tr key={i} className="border-b border-gray-50 last:border-0">
                              <td className="p-2.5 font-medium">{dp.name}</td>
                              <td className="p-2.5">{dp.register || "-"}</td>
                              <td className="p-2.5"><Badge color="purple">{dp.data_type}</Badge></td>
                              <td className="p-2.5">{dp.range_min != null ? `${dp.range_min} ~ ${dp.range_max} ${dp.unit || ""}` : "-"}</td>
                              <td className="p-2.5"><Badge color={dp.access === "RW" ? "amber" : "green"}>{dp.access}</Badge></td>
                              <td className="p-2.5"><Badge color={dp.confidence === "certain" ? "green" : dp.confidence === "inferred" ? "amber" : "red"}>{dp.confidence || "unknown"}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {parseResult.commands?.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">⚡ 命令 ({parseResult.commands.length})</h4>
                    <div className="space-y-2">
                      {parseResult.commands.map((cmd: any, i: number) => (
                        <div key={i} className="border border-gray-200 rounded-xl p-3">
                          <div className="flex justify-between items-center text-sm">
                            <strong className="text-gray-900">{cmd.name}</strong>
                            <Badge color="purple">{cmd.method || "-"}</Badge>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{cmd.identifier}{cmd.description ? ` · ${cmd.description}` : ""}</div>
                          {cmd.parameters?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {cmd.parameters.map((p: any, j: number) => (
                                <span key={j} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[11px] ring-1 ring-blue-100">
                                  {p.name}: {p.type}{p.required ? "*" : ""}{p.range ? ` [${p.range.min}, ${p.range.max}]` : ""}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {parseResult.uncertainties?.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-amber-600 mb-2 flex items-center gap-2">⚠️ 需确认 ({parseResult.uncertainties.length})</h4>
                    <div className="space-y-1">
                      {parseResult.uncertainties.map((u: any, i: number) => (
                        <div key={i} className="text-xs text-amber-800 py-2 px-3 bg-amber-50/50 rounded-lg">
                          <b>{u.field}</b>: {u.reason}
                          {u.suggestion && <span className="text-blue-600 ml-2">→ {u.suggestion}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={confirmParse} className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm">✅ 确认并创建产品</button>
              </div>
            )}
          </div>
        )}

        {tab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">产品总数</div>
                <div className="text-3xl font-bold mt-2 text-gray-900">{products.length}</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">数据点位</div>
                <div className="text-3xl font-bold mt-2 text-blue-600">{detail?.points.length ?? "-"}</div>
                <div className="text-xs text-gray-400 mt-1">当前选中产品</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">命令数</div>
                <div className="text-3xl font-bold mt-2 text-violet-600">{detail?.commands.length ?? "-"}</div>
                <div className="text-xs text-gray-400 mt-1">当前选中产品</div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">数据库状态</div>
                <div className={`text-xl font-bold mt-2 ${health?.db === "connected" ? "text-emerald-600" : "text-red-500"}`}>{health?.db === "connected" ? "已连接" : health?.db || "未知"}</div>
              </div>
            </div>

            {/* Protocol Distribution */}
            {products.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">协议分布</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(products.reduce((acc: Record<string, number>, p) => { acc[p.protocol] = (acc[p.protocol] || 0) + 1; return acc; }, {})).map(([proto, count]) => (
                    <div key={proto} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                      <Badge color="purple">{proto}</Badge>
                      <span className="text-sm font-medium text-gray-700">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Products */}
            {products.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">产品列表</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-gray-500 font-medium border-b">
                      <th className="p-2.5">名称</th><th className="p-2.5">型号</th><th className="p-2.5">协议</th><th className="p-2.5">厂商</th><th className="p-2.5">状态</th>
                    </tr></thead>
                    <tbody>
                      {products.map(p => (
                        <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 cursor-pointer" onClick={() => { setSelected(p.id); loadDetail(p.id); setTab("products"); }}>
                          <td className="p-2.5 font-medium text-gray-900">{p.name}</td>
                          <td className="p-2.5 text-gray-500">{p.model}</td>
                          <td className="p-2.5"><Badge color="purple">{p.protocol}</Badge></td>
                          <td className="p-2.5 text-gray-500">{p.manufacturer || "-"}</td>
                          <td className="p-2.5"><Badge color={p.status === "active" ? "green" : "gray"}>{p.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
