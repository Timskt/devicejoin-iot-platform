import { useState, useEffect, useCallback, useRef, useTransition, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════
   Constants & Types
   ═══════════════════════════════════════════════════════════════ */

const API = "/api/v1";
const DT = ["int16","uint16","int32","uint32","float32","float64","bool","string"];
const AC = ["R","W","RW"];
const REGISTERS = ["holding","input","coil","discrete"];
const PROTOCOLS = ["modbus_rtu","modbus_tcp","mqtt","http","bacnet","opc_ua","custom_serial"];

type Product = { id: string; name: string; model: string; protocol: string; status: string; manufacturer?: string; description?: string };
type DataPoint = { id: string; identifier: string; name: string; data_type: string; unit: string; register: string; access: string; range_min?: number; range_max?: number; description?: string };
type Command = { id: string; identifier: string; name: string; method: string; parameters: any[]; description?: string };

/* ═══════════════════════════════════════════════════════════════
   Hooks
   ═══════════════════════════════════════════════════════════════ */

function useApi() {
  return useCallback(async (method: string, url: string, body?: any) => {
    const opts: any = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${API}${url}`, opts);
    if (!r.ok && r.status !== 204) throw new Error(await r.text());
    return r.status === 204 ? null : r.json();
  }, []);
}

function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue];
}

function useKeyboardShortcuts(handlers: Record<string, () => void>) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const key = e.key.toLowerCase();
      if (handlers[key]) { e.preventDefault(); handlers[key](); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlers]);
}

/* ═══════════════════════════════════════════════════════════════
   UI Primitives
   ═══════════════════════════════════════════════════════════════ */

function Spinner({ size = "w-4 h-4" }: { size?: string }) {
  return <div className={`inline-block ${size} border-2 border-current border-t-transparent rounded-full animate-spin`} />;
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-500/20",
    blue: "bg-blue-50 text-blue-700 ring-1 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-500/20",
    amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-500/20",
    red: "bg-red-50 text-red-700 ring-1 ring-red-600/20 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-500/20",
    gray: "bg-gray-50 text-gray-600 ring-1 ring-gray-500/20 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-600/20",
    purple: "bg-violet-50 text-violet-700 ring-1 ring-violet-600/20 dark:bg-violet-900/30 dark:text-violet-400 dark:ring-violet-500/20",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${colors[color] || colors.gray}`}>{children}</span>;
}

function InlineInput({ value, onChange, type = "text", className = "", placeholder, maxLength }: { value: any; onChange: (v: string) => void; type?: string; className?: string; placeholder?: string; maxLength?: number }) {
  return <input type={type} value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} className={`border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-xs w-full bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors ${className}`} />;
}

function InlineSelect({ value, onChange, options }: { value: any; onChange: (v: string) => void; options: string[] }) {
  return <select value={value ?? ""} onChange={e => onChange(e.target.value)} className="border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-xs w-full bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-colors">
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>;
}

function Tooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex ml-1 cursor-help" role="tooltip">
      <svg className="w-3.5 h-3.5 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-[10px] rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50" role="tooltip">{text}</span>
    </span>
  );
}

function Toast({ message, type = "info", onClose }: { message: string; type?: "info" | "success" | "error"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  const colors = { info: "bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:ring-blue-700", success: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/50 dark:text-emerald-300 dark:ring-emerald-700", error: "bg-red-50 text-red-800 ring-red-200 dark:bg-red-900/50 dark:text-red-300 dark:ring-red-700" };
  return (
    <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg text-sm ring-1 ${colors[type]} shadow-lg z-50`} role="alert" aria-live="polite">
      <div className="flex items-center gap-2">
        <span>{type === "success" ? "✓" : type === "error" ? "✕" : "ℹ"}</span>
        <span>{message}</span>
        <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100" aria-label="关闭通知">✕</button>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
    <span className="text-3xl mb-2" aria-hidden="true">{icon}</span>
    <p className="font-medium text-sm">{title}</p>
    <p className="text-xs mt-1">{desc}</p>
  </div>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  return (
    <button onClick={handleCopy} className="text-gray-300 hover:text-blue-500 dark:hover:text-blue-400 transition-colors p-0.5" title="复制" aria-label={`复制 ${text}`}>
      {copied ? (
        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      )}
    </button>
  );
}

/* ─── Modal (accessible) ─── */

function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
      const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 id="modal-title" className="text-base font-bold text-gray-900 dark:text-white">{title}</h2>
          <button ref={closeRef} onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="关闭对话框">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50 rounded-b-2xl flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main App
   ═══════════════════════════════════════════════════════════════ */

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
  const [, startSearchTransition] = useTransition();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", model: "", manufacturer: "", protocol: "modbus_rtu", description: "" });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const [darkMode, setDarkMode] = useLocalStorage("darkMode", false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const api = useApi();

  const notify = useCallback((message: string, type: "info" | "success" | "error" = "info") => setToast({ message, type }), []);

  /* ─── Dark mode ─── */
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  /* ─── Keyboard shortcuts ─── */
  const shortcuts = useMemo((): Record<string, () => void> => ({
    "1": () => setTab("products"),
    "2": () => setTab("parse"),
    "3": () => setTab("dashboard"),
    "n": () => setShowCreateModal(true),
    "d": () => setDarkMode(!darkMode),
  }), [setDarkMode, darkMode]);

  useKeyboardShortcuts(shortcuts);

  /* ─── Data loading ─── */
  const loadProducts = useCallback(async () => {
    try {
      const data = await api("GET", "/products");
      setProducts(Array.isArray(data) ? data : []);
    } catch { notify("加载产品失败", "error"); }
  }, [api, notify]);

  const loadDetail = useCallback(async (pid: string) => {
    setDetailLoading(true);
    try {
      const [pts, cmds] = await Promise.all([api("GET", `/products/${pid}/points`), api("GET", `/products/${pid}/commands`)]);
      setDetail({ points: Array.isArray(pts) ? pts : [], commands: Array.isArray(cmds) ? cmds : [] });
    } catch { setDetail(null); notify("加载详情失败", "error"); }
    setDetailLoading(false);
  }, [api, notify]);

  useEffect(() => {
    loadProducts();
    fetch("/health").then(r => r.json()).then(setHealth).catch(() => {}).finally(() => setHealthLoading(false));
  }, [loadProducts]);

  /* ─── Product CRUD ─── */
  const validateCreate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!createForm.name.trim()) errs.name = "产品名称不能为空";
    if (createForm.name.length > 100) errs.name = "产品名称不能超过 100 个字符";
    if (createForm.model.length > 50) errs.model = "型号不能超过 50 个字符";
    setCreateErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const createProduct = async () => {
    if (!validateCreate()) return;
    try {
      await api("POST", "/products", { ...createForm, data_points: [], commands: [] });
      setShowCreateModal(false);
      setCreateForm({ name: "", model: "", manufacturer: "", protocol: "modbus_rtu", description: "" });
      setCreateErrors({});
      loadProducts();
      notify("产品已创建", "success");
    } catch (e: any) { notify(e.message || "创建失败", "error"); }
  };

  const saveProduct = async () => {
    if (!selected) return;
    try {
      await api("PATCH", `/products/${selected}`, editForm);
      setEditingProduct(false);
      loadProducts();
      notify("产品已更新", "success");
    } catch (e: any) { notify(e.message || "更新失败", "error"); }
  };

  /* ─── DataPoint CRUD ─── */
  const savePoint = useCallback(async (pid: string, dp: DataPoint) => {
    try { await api("PATCH", `/products/${pid}/points/${dp.id}`, dp); } catch { notify("保存失败", "error"); }
  }, [api, notify]);

  const addPoint = useCallback(async (pid: string) => {
    try {
      await api("POST", `/products/${pid}/points`, { identifier: "new_point", name: "新点位", data_type: "uint16", register: "holding", access: "R", unit: "" });
      loadDetail(pid);
      notify("已添加点位", "success");
    } catch (e: any) { notify(e.message || "添加失败", "error"); }
  }, [api, loadDetail, notify]);

  const delPoint = useCallback(async (pid: string, dpid: string) => {
    if (!confirm("确认删除此点位？")) return;
    try { await api("DELETE", `/products/${pid}/points/${dpid}`); loadDetail(pid); notify("已删除", "success"); } catch (e: any) { notify(e.message, "error"); }
  }, [api, loadDetail, notify]);

  /* ─── Command CRUD ─── */
  const saveCmd = useCallback(async (pid: string, cmd: Command) => {
    try { await api("PATCH", `/products/${pid}/commands/${cmd.id}`, cmd); } catch { notify("保存失败", "error"); }
  }, [api, notify]);

  const addCmd = useCallback(async (pid: string) => {
    try {
      await api("POST", `/products/${pid}/commands`, { identifier: "new_cmd", name: "新命令", method: "GET", parameters: [] });
      loadDetail(pid);
      notify("已添加命令", "success");
    } catch (e: any) { notify(e.message || "添加失败", "error"); }
  }, [api, loadDetail, notify]);

  const delCmd = useCallback(async (pid: string, cmdid: string) => {
    if (!confirm("确认删除此命令？")) return;
    try { await api("DELETE", `/products/${pid}/commands/${cmdid}`); loadDetail(pid); notify("已删除", "success"); } catch (e: any) { notify(e.message, "error"); }
  }, [api, loadDetail, notify]);

  const addParam = useCallback(async (pid: string, cmd: Command) => {
    const np = [...(cmd.parameters || []), { name: "param", type: "int16", required: false }];
    try { await api("PATCH", `/products/${pid}/commands/${cmd.id}`, { ...cmd, parameters: np }); loadDetail(pid); } catch { notify("添加失败", "error"); }
  }, [api, loadDetail, notify]);

  const delParam = useCallback(async (pid: string, cmd: Command, idx: number) => {
    const np = cmd.parameters.filter((_: any, i: number) => i !== idx);
    try { await api("PATCH", `/products/${pid}/commands/${cmd.id}`, { ...cmd, parameters: np }); loadDetail(pid); } catch { notify("删除失败", "error"); }
  }, [api, loadDetail, notify]);

  const updateParam = useCallback(async (pid: string, cmd: Command, idx: number, field: string, value: any) => {
    const np = [...cmd.parameters];
    np[idx] = { ...np[idx], [field]: value };
    try { await api("PATCH", `/products/${pid}/commands/${cmd.id}`, { ...cmd, parameters: np }); } catch { notify("更新失败", "error"); }
  }, [api, notify]);

  /* ─── AI Parse ─── */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setParseFiles(Array.from(e.target.files));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) setParseFiles(Array.from(e.dataTransfer.files));
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

  /* ─── Computed ─── */
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  useEffect(() => {
    startSearchTransition(() => {
      setFilteredProducts(products.filter(p =>
        !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.model.toLowerCase().includes(search.toLowerCase()) || p.protocol.toLowerCase().includes(search.toLowerCase())
      ));
    });
  }, [products, search]);

  const selectedProduct = products.find(p => p.id === selected);

  /* ─── Nav ─── */
  const NavBtn = ({ t, label, icon, shortcut }: { t: typeof tab; label: string; icon: string; shortcut: string }) => (
    <button onClick={() => setTab(t)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`} aria-label={label} title={`${label} (${shortcut})`}>
      <span aria-hidden="true">{icon}</span>{label}
      <kbd className="hidden sm:inline-flex ml-1 px-1.5 py-0.5 text-[10px] rounded bg-white/20 dark:bg-gray-700/50 font-mono">{shortcut}</kbd>
    </button>
  );

  const FieldLabel = ({ label, tooltip }: { label: string; tooltip: string }) => (
    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}<Tooltip text={tooltip} /></label>
  );

  const toggleSection = (key: string) => setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950 dark:text-gray-100 transition-colors">
      {/* Skip link (a11y) */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg">跳转到主内容</a>

      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-violet-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">D</span>
              </div>
              <h1 className="text-base font-bold text-gray-900 dark:text-white">DeviceJoin IoT</h1>
            </div>
            <nav className="flex items-center gap-1" role="navigation" aria-label="主导航">
              <NavBtn t="products" label="产品" icon="📦" shortcut="1" />
              <NavBtn t="parse" label="AI 接入" icon="🤖" shortcut="2" />
              <NavBtn t="dashboard" label="监控" icon="📊" shortcut="3" />
              <button onClick={() => setDarkMode(!darkMode)} className="ml-2 p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" aria-label={darkMode ? "切换到亮色模式" : "切换到暗色模式"} title={darkMode ? "亮色模式 (D)" : "暗色模式 (D)"}>
                {darkMode ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                )}
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Status Bar */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-1.5 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          {healthLoading ? (
            <span className="flex items-center gap-1.5"><Spinner size="w-3 h-3" />加载状态...</span>
          ) : (
            <>
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${health?.status === "healthy" ? "bg-emerald-500" : health?.status === "degraded" ? "bg-amber-500" : "bg-red-500"}`} />
                {health?.status === "healthy" ? "运行正常" : health?.status === "degraded" ? "部分异常" : "离线"}
              </span>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span>数据库: <span className={health?.db === "connected" ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-red-500"}>{health?.db === "connected" ? "已连接" : health?.db || "未知"}</span></span>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span>v{health?.version || "0.1.0"}</span>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {tab === "products" && (
          <div className="grid grid-cols-[280px_1fr] gap-6">
            {/* Sidebar */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <button onClick={() => setShowCreateModal(true)} className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">+ 创建产品</button>
                <button onClick={loadProducts} className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" title="刷新" aria-label="刷新产品列表">🔄</button>
              </div>
              <input type="text" placeholder="搜索产品..." value={search} onChange={e => setSearch(e.target.value)} className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400" aria-label="搜索产品" />
              <div className="space-y-1">
                {filteredProducts.length === 0 && (
                  <EmptyState icon="📦" title={search ? "无匹配产品" : "暂无产品"} desc={search ? "尝试其他关键词" : "点击上方按钮创建第一个产品"} />
                )}
                {filteredProducts.map(p => (
                  <div key={p.id} onClick={() => { setSelected(p.id); loadDetail(p.id); setEditingProduct(false); }}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${selected === p.id ? "border-blue-300 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-900/20 shadow-sm" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm bg-white dark:bg-gray-900"}`}
                    role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && setSelected(p.id)}
                    aria-label={`产品: ${p.name}`} aria-selected={selected === p.id}>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm text-gray-900 dark:text-white truncate">{p.name}</span>
                      <Badge color={p.status === "active" ? "green" : "gray"}>{p.status === "active" ? "启用" : "停用"}</Badge>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      <span className="truncate">{p.model}</span>
                      <span className="text-gray-300 dark:text-gray-600">·</span>
                      <Badge color="purple">{p.protocol}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Detail Panel */}
            <div>
              {selected && selectedProduct ? (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                  {/* Product Header */}
                  <div className="p-5 border-b border-gray-100 dark:border-gray-800">
                    {editingProduct ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div><FieldLabel label="产品名称" tooltip="产品的显示名称" /><input className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400" value={editForm.name || ""} onChange={e => setEditForm({ ...editForm, name: e.target.value })} maxLength={100} /></div>
                          <div><FieldLabel label="型号" tooltip="设备型号标识" /><input className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400" value={editForm.model || ""} onChange={e => setEditForm({ ...editForm, model: e.target.value })} maxLength={50} /></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div><FieldLabel label="厂商" tooltip="设备制造商名称" /><input className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400" value={editForm.manufacturer || ""} onChange={e => setEditForm({ ...editForm, manufacturer: e.target.value })} /></div>
                          <div><FieldLabel label="通信协议" tooltip="设备使用的通信协议" /><select className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400" value={editForm.protocol || "modbus_rtu"} onChange={e => setEditForm({ ...editForm, protocol: e.target.value })}>{PROTOCOLS.map(p => <option key={p} value={p}>{p}</option>)}</select></div>
                        </div>
                        <div><FieldLabel label="描述" tooltip="产品功能说明" /><textarea className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400" rows={2} value={editForm.description || ""} onChange={e => setEditForm({ ...editForm, description: e.target.value })} /></div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingProduct(false)} className="px-4 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-800">取消</button>
                          <button onClick={saveProduct} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">保存</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start">
                        <div>
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedProduct.name}</h2>
                          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-gray-500 dark:text-gray-400">
                            <span>型号: {selectedProduct.model || "-"}</span>
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <span>厂商: {selectedProduct.manufacturer || "-"}</span>
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <Badge color="purple">{selectedProduct.protocol}</Badge>
                          </div>
                          {selectedProduct.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{selectedProduct.description}</p>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditForm({ name: selectedProduct.name, model: selectedProduct.model, manufacturer: selectedProduct.manufacturer, description: selectedProduct.description, protocol: selectedProduct.protocol }); setEditingProduct(true); }} className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800">编辑</button>
                          <button onClick={async () => { if (confirm("确认删除此产品？此操作不可撤销。")) { await api("DELETE", `/products/${selected}`); setSelected(null); setDetail(null); loadProducts(); notify("已删除", "success"); } }} className="px-3 py-1.5 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg text-xs font-medium hover:bg-red-50 dark:hover:bg-red-900/20">删除</button>
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
                          <button onClick={() => toggleSection("points")} className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 rounded-lg px-1 py-0.5" aria-expanded={!collapsedSections.points}>
                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${collapsedSections.points ? "" : "rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            <div className="text-left">
                              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">📍 数据点位 <span className="text-xs font-normal text-gray-400">({detail.points.length})</span></h3>
                              {!collapsedSections.points && <p className="text-[11px] text-gray-400 mt-0.5">定义设备可读取或写入的传感器/执行器数据</p>}
                            </div>
                          </button>
                          {!collapsedSections.points && <button onClick={() => addPoint(selected)} className="px-3 py-1.5 text-xs font-medium border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">+ 添加点位</button>}
                        </div>
                        {!collapsedSections.points && (
                          detail.points.length === 0 ? (
                            <EmptyState icon="📍" title="暂无数据点位" desc="点击上方按钮添加或等待 AI 解析" />
                          ) : (
                            <div>
                              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-t-lg border border-gray-200 dark:border-gray-700 border-b-0 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                                <div className="col-span-2">名称 <Tooltip text="点位的中文显示名称" /></div>
                                <div className="col-span-2">标识符 <Tooltip text="英文唯一标识，用于 API 和代码引用" /></div>
                                <div className="col-span-1">寄存器 <Tooltip text="Modbus 寄存器类型：holding/input/coil/discrete" /></div>
                                <div className="col-span-1">类型 <Tooltip text="数据格式：int16/uint16/float32/bool 等" /></div>
                                <div className="col-span-1">单位 <Tooltip text="物理量单位：℃/%/V/A/kW 等" /></div>
                                <div className="col-span-3">范围 <Tooltip text="有效取值范围，超出可能表示异常" /></div>
                                <div className="col-span-1">权限 <Tooltip text="R=只读, W=只写, RW=读写" /></div>
                                <div className="col-span-1"></div>
                              </div>
                              <div className="border border-gray-200 dark:border-gray-700 rounded-b-lg divide-y divide-gray-100 dark:divide-gray-800">
                                {detail.points.map(dp => (
                                  <div key={dp.id} className="grid grid-cols-12 gap-2 px-3 py-2 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors items-center">
                                    <div className="col-span-2"><InlineInput value={dp.name} onChange={v => savePoint(selected, { ...dp, name: v })} placeholder="温度" maxLength={50} /></div>
                                    <div className="col-span-2 flex items-center gap-1">
                                      <InlineInput value={dp.identifier} onChange={v => savePoint(selected, { ...dp, identifier: v })} placeholder="temperature_1" maxLength={50} className="font-mono" />
                                      <CopyButton text={dp.identifier} />
                                    </div>
                                    <div className="col-span-1"><InlineSelect value={dp.register || "holding"} onChange={v => savePoint(selected, { ...dp, register: v })} options={REGISTERS} /></div>
                                    <div className="col-span-1"><InlineSelect value={dp.data_type} onChange={v => savePoint(selected, { ...dp, data_type: v })} options={DT} /></div>
                                    <div className="col-span-1"><InlineInput value={dp.unit} onChange={v => savePoint(selected, { ...dp, unit: v })} placeholder="℃" /></div>
                                    <div className="col-span-3 flex items-center gap-1"><InlineInput value={dp.range_min ?? ""} onChange={v => savePoint(selected, { ...dp, range_min: v ? Number(v) : undefined })} type="number" placeholder="min" /><span className="text-gray-300 dark:text-gray-600 text-xs">~</span><InlineInput value={dp.range_max ?? ""} onChange={v => savePoint(selected, { ...dp, range_max: v ? Number(v) : undefined })} type="number" placeholder="max" /></div>
                                    <div className="col-span-1"><InlineSelect value={dp.access} onChange={v => savePoint(selected, { ...dp, access: v })} options={AC} /></div>
                                    <div className="col-span-1 flex justify-end"><button onClick={() => delPoint(selected, dp.id)} className="text-gray-300 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1" title="删除" aria-label={`删除点位 ${dp.name}`}>
                                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button></div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        )}
                      </div>

                      {/* Commands */}
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <button onClick={() => toggleSection("commands")} className="flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40 rounded-lg px-1 py-0.5" aria-expanded={!collapsedSections.commands}>
                            <svg className={`w-4 h-4 text-gray-400 transition-transform ${collapsedSections.commands ? "" : "rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            <div className="text-left">
                              <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">⚡ 命令 <span className="text-xs font-normal text-gray-400">({detail.commands.length})</span></h3>
                              {!collapsedSections.commands && <p className="text-[11px] text-gray-400 mt-0.5">向设备发送的控制指令，如重启、校准、参数设置</p>}
                            </div>
                          </button>
                          {!collapsedSections.commands && <button onClick={() => addCmd(selected)} className="px-3 py-1.5 text-xs font-medium border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">+ 添加命令</button>}
                        </div>
                        {!collapsedSections.commands && (
                          detail.commands.length === 0 ? (
                            <EmptyState icon="⚡" title="暂无命令" desc="添加设备控制命令" />
                          ) : (
                            <div>
                              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-t-lg border border-gray-200 dark:border-gray-700 border-b-0 text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                                <div className="col-span-4">命令名称 <Tooltip text="命令的中文显示名称" /></div>
                                <div className="col-span-3">标识符 <Tooltip text="英文唯一标识，用于 API 调用" /></div>
                                <div className="col-span-2">方法 <Tooltip text="Modbus 功能码或 HTTP 方法（GET/POST/03/06 等）" /></div>
                                <div className="col-span-3">参数 <Tooltip text="命令携带的参数列表" /></div>
                              </div>
                              <div className="border border-gray-200 dark:border-gray-700 rounded-b-lg divide-y divide-gray-100 dark:divide-gray-800">
                                {detail.commands.map(cmd => (
                                  <div key={cmd.id} className="px-4 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                    <div className="grid grid-cols-12 gap-2 items-center">
                                      <div className="col-span-4"><InlineInput value={cmd.name} onChange={v => saveCmd(selected, { ...cmd, name: v })} placeholder="读取温度" maxLength={50} /></div>
                                      <div className="col-span-3 flex items-center gap-1">
                                        <InlineInput value={cmd.identifier} onChange={v => saveCmd(selected, { ...cmd, identifier: v })} placeholder="read_temp" className="font-mono" maxLength={50} />
                                        <CopyButton text={cmd.identifier} />
                                      </div>
                                      <div className="col-span-2"><InlineInput value={cmd.method || "GET"} onChange={v => saveCmd(selected, { ...cmd, method: v })} placeholder="03" /></div>
                                      <div className="col-span-2 flex items-center gap-1">
                                        <button onClick={() => delCmd(selected, cmd.id)} className="text-gray-300 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1" title="删除命令" aria-label={`删除命令 ${cmd.name}`}>
                                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                      </div>
                                    </div>
                                    <div className="mt-2 pl-1">
                                      <div className="flex flex-wrap gap-1.5 items-center">
                                        {(cmd.parameters || []).map((p: any, i: number) => (
                                          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-md text-[11px] ring-1 ring-blue-100 dark:ring-blue-800">
                                            <InlineInput value={p.name} onChange={v => updateParam(selected, cmd, i, "name", v)} className="w-14 border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800" placeholder="name" maxLength={30} />
                                            <span className="text-blue-300 dark:text-blue-500">:</span>
                                            <InlineSelect value={p.type} onChange={v => updateParam(selected, cmd, i, "type", v)} options={DT} />
                                            {p.required && <span className="text-red-400 font-bold">*</span>}
                                            <button onClick={() => delParam(selected, cmd, i)} className="text-blue-300 hover:text-red-500 dark:hover:text-red-400 ml-0.5 transition-colors" aria-label={`删除参数 ${p.name}`}>✕</button>
                                          </span>
                                        ))}
                                        <button onClick={() => addParam(selected, cmd)} className="px-2 py-1 text-[11px] border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 rounded-md hover:border-green-300 dark:hover:border-green-700 hover:text-green-600 dark:hover:text-green-400 transition-colors">+ 参数</button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  ) : (
                    <EmptyState icon="⚠️" title="加载失败" desc="请重试" />
                  )}
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-12">
                  <EmptyState icon="👈" title="选择产品" desc="从左侧列表选择一个产品查看详情和编辑" />
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "parse" && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl" aria-hidden="true">🤖</span>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">AI 智能接入设备</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">粘贴设备协议文档或上传文件，AI 将自动提取产品配置、数据点位和命令。</p>

              <div className="space-y-3">
                <textarea className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-xl p-4 text-sm min-h-[140px] focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 resize-y font-mono" placeholder="粘贴设备协议文档内容（Modbus, OPC-UA, MQTT...）" value={hint} onChange={e => setHint(e.target.value)} aria-label="协议文档内容" />

                {/* Drop zone */}
                <div
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${dragOver ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  role="region"
                  aria-label="文件拖放区域"
                >
                  <input ref={fileInputRef} type="file" multiple accept=".txt,.pdf,.md,.csv,.json,.xml" onChange={handleFileChange} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2 mx-auto">
                    📎 选择文件
                  </button>
                  <p className="text-xs text-gray-400 mt-2">或拖拽文件到此处 · 支持 .txt .pdf .md .csv .json .xml</p>
                  {parseFiles.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 justify-center">
                      {parseFiles.map((f, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-md text-xs">
                          📄 {f.name} <span className="text-gray-400">({(f.size / 1024).toFixed(1)} KB)</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={aiParse} disabled={parseLoading} className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm">
                  {parseLoading && <Spinner />}{parseLoading ? "AI 分析中..." : "🔍 AI 智能解析"}
                </button>
              </div>

              {parseStream && (
                <div className="mt-4 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-xl text-sm flex items-center gap-2" role="status" aria-live="polite">
                  <Spinner size="w-3.5 h-3.5" /> {parseStream}
                </div>
              )}
            </div>

            {parseResult && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">{parseResult.product?.name || "解析结果"}</h3>
                  <Badge color={parseResult.overall_confidence > 0.7 ? "green" : parseResult.overall_confidence > 0.4 ? "amber" : "red"}>置信度 {Math.round((parseResult.overall_confidence || 0) * 100)}%</Badge>
                </div>

                {parseResult.error && (
                  <div className="mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-xl text-sm ring-1 ring-amber-200 dark:ring-amber-800" role="alert">⚠️ {parseResult.error}</div>
                )}

                {parseResult.product?.protocol && (
                  <div className="flex flex-wrap gap-2 mb-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>协议: <Badge color="purple">{parseResult.product.protocol}</Badge></span>
                    <span>厂商: {parseResult.product.manufacturer || "-"}</span>
                  </div>
                )}

                {parseResult.data_points?.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">📍 数据点位 ({parseResult.data_points.length})</h4>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500 dark:text-gray-400 font-medium">
                          <th className="p-2.5 border-b dark:border-gray-700">名称</th><th className="p-2.5 border-b dark:border-gray-700">寄存器</th><th className="p-2.5 border-b dark:border-gray-700">类型</th><th className="p-2.5 border-b dark:border-gray-700">范围</th><th className="p-2.5 border-b dark:border-gray-700">权限</th><th className="p-2.5 border-b dark:border-gray-700">置信度</th>
                        </tr></thead>
                        <tbody>
                          {parseResult.data_points.map((dp: any, i: number) => (
                            <tr key={i} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
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
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">⚡ 命令 ({parseResult.commands.length})</h4>
                    <div className="space-y-2">
                      {parseResult.commands.map((cmd: any, i: number) => (
                        <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                          <div className="flex justify-between items-center text-sm">
                            <strong className="text-gray-900 dark:text-white">{cmd.name}</strong>
                            <Badge color="purple">{cmd.method || "-"}</Badge>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{cmd.identifier}{cmd.description ? ` · ${cmd.description}` : ""}</div>
                          {cmd.parameters?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {cmd.parameters.map((p: any, j: number) => (
                                <span key={j} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-md text-[11px] ring-1 ring-blue-100 dark:ring-blue-800">
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
                    <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-2">⚠️ 需确认 ({parseResult.uncertainties.length})</h4>
                    <div className="space-y-1">
                      {parseResult.uncertainties.map((u: any, i: number) => (
                        <div key={i} className="text-xs text-amber-800 dark:text-amber-300 py-2 px-3 bg-amber-50/50 dark:bg-amber-900/20 rounded-lg">
                          <b>{u.field}</b>: {u.reason}
                          {u.suggestion && <span className="text-blue-600 dark:text-blue-400 ml-2">→ {u.suggestion}</span>}
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
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">产品总数</div>
                <div className="text-3xl font-bold mt-2 text-gray-900 dark:text-white">{products.length}</div>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">数据点位</div>
                <div className="text-3xl font-bold mt-2 text-blue-600 dark:text-blue-400">{detail?.points.length ?? "-"}</div>
                <div className="text-xs text-gray-400 mt-1">当前选中产品</div>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">命令数</div>
                <div className="text-3xl font-bold mt-2 text-violet-600 dark:text-violet-400">{detail?.commands.length ?? "-"}</div>
                <div className="text-xs text-gray-400 mt-1">当前选中产品</div>
              </div>
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">数据库状态</div>
                <div className={`text-xl font-bold mt-2 ${health?.db === "connected" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{health?.db === "connected" ? "已连接" : health?.db || "未知"}</div>
              </div>
            </div>

            {products.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">协议分布</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(products.reduce((acc: Record<string, number>, p) => { acc[p.protocol] = (acc[p.protocol] || 0) + 1; return acc; }, {})).map(([proto, count]) => (
                    <div key={proto} className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <Badge color="purple">{proto}</Badge>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {products.length > 0 && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">产品列表</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-gray-500 dark:text-gray-400 font-medium border-b dark:border-gray-700">
                      <th className="p-2.5">名称</th><th className="p-2.5">型号</th><th className="p-2.5">协议</th><th className="p-2.5">厂商</th><th className="p-2.5">状态</th>
                    </tr></thead>
                    <tbody>
                      {products.map(p => (
                        <tr key={p.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => { setSelected(p.id); loadDetail(p.id); setTab("products"); }}>
                          <td className="p-2.5 font-medium text-gray-900 dark:text-white">{p.name}</td>
                          <td className="p-2.5 text-gray-500 dark:text-gray-400">{p.model}</td>
                          <td className="p-2.5"><Badge color="purple">{p.protocol}</Badge></td>
                          <td className="p-2.5 text-gray-500 dark:text-gray-400">{p.manufacturer || "-"}</td>
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

      {/* Create Product Modal */}
      <Modal open={showCreateModal} onClose={() => { setShowCreateModal(false); setCreateErrors({}); }} title="创建新产品"
        footer={<>
          <button onClick={() => { setShowCreateModal(false); setCreateErrors({}); }} className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">取消</button>
          <button onClick={createProduct} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">创建产品</button>
        </>}>
        <div className="space-y-4">
          <div>
            <FieldLabel label="产品名称" tooltip="产品的显示名称，如「温湿度传感器」" />
            <input className={`border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 dark:bg-gray-800 dark:text-gray-100 ${createErrors.name ? "border-red-300 dark:border-red-700" : "border-gray-200 dark:border-gray-700"}`} value={createForm.name} onChange={e => { setCreateForm({ ...createForm, name: e.target.value }); setCreateErrors(prev => ({ ...prev, name: "" })); }} placeholder="例如：温湿度传感器 SHT30" maxLength={100} aria-invalid={!!createErrors.name} aria-describedby={createErrors.name ? "name-error" : undefined} />
            {createErrors.name && <p id="name-error" className="text-xs text-red-500 mt-1" role="alert">{createErrors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel label="型号" tooltip="设备型号标识" />
              <input className={`border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 dark:bg-gray-800 dark:text-gray-100 ${createErrors.model ? "border-red-300 dark:border-red-700" : "border-gray-200 dark:border-gray-700"}`} value={createForm.model} onChange={e => { setCreateForm({ ...createForm, model: e.target.value }); setCreateErrors(prev => ({ ...prev, model: "" })); }} placeholder="例如：SHT30" maxLength={50} />
              {createErrors.model && <p className="text-xs text-red-500 mt-1" role="alert">{createErrors.model}</p>}
            </div>
            <div>
              <FieldLabel label="厂商" tooltip="设备制造商名称" />
              <input className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 dark:bg-gray-800 dark:text-gray-100" value={createForm.manufacturer} onChange={e => setCreateForm({ ...createForm, manufacturer: e.target.value })} placeholder="例如：Sensirion" />
            </div>
          </div>
          <div>
            <FieldLabel label="通信协议" tooltip="设备使用的通信协议类型" />
            <select className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 bg-white dark:bg-gray-800 dark:text-gray-100" value={createForm.protocol} onChange={e => setCreateForm({ ...createForm, protocol: e.target.value })}>
              {PROTOCOLS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel label="描述" tooltip="产品功能说明（可选）" />
            <textarea className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 resize-none dark:bg-gray-800 dark:text-gray-100" rows={3} value={createForm.description} onChange={e => setCreateForm({ ...createForm, description: e.target.value })} placeholder="简要描述设备功能和用途..." />
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-400">
            <p className="font-medium mb-1">💡 提示</p>
            <p>创建后可以手动添加数据点位和命令，也可以使用「AI 接入」自动解析协议文档生成配置。</p>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
