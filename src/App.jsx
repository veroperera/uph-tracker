import { useState, useEffect, useRef } from "react";

// ─── UTILIDADES ───────────────────────────────────────────────────────────────
const formatTime = (ms) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600).toString().padStart(2, "0");
  const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${h}:${m}:${sec}`;
};
const calcUPH = (unidades, ms) => {
  const h = ms / 3600000;
  return h < 0.001 ? 0 : Math.round(unidades / h);
};
const fmtHora = (ts) =>
  ts ? new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--";
const fmtFecha = (ts) =>
  ts ? new Date(ts).toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" }) : "--";

// ─── EXPORTAR CSV (abre en Excel) ─────────────────────────────────────────────
const exportarExcel = (sesiones, empleadoFiltro = null) => {
  const datos = empleadoFiltro ? sesiones.filter((s) => s.empleadoId === empleadoFiltro) : sesiones;
  if (!datos.length) return alert("No hay sesiones para exportar.");
  const header = [
    "Fecha", "No. DN", "Empleado", "BU",
    "Hora Inicio", "Hora Fin", "Tiempo Activo", "Tiempo Pausa",
    "Unidades", "UPH Real", "UPH Estándar", "Eficiencia %", "Estado",
  ];
  const rows = datos.map((s) => [
    fmtFecha(s.inicio),
    s.dn || "",
    s.empleadoNombre,
    s.unidadLabel,
    fmtHora(s.inicio),
    fmtHora(s.fin),
    formatTime(s.tiempoActivo || 0),
    formatTime(s.tiempoPausa || 0),
    s.unidades,
    s.uphReal,
    s.uphEstandar,
    s.eficiencia + "%",
    s.eficiencia >= 100 ? "Cumplido" : s.eficiencia >= 80 ? "Aceptable" : "Bajo",
  ]);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = empleadoFiltro
    ? `reporte_${datos[0]?.empleadoNombre?.replace(/\s/g, "_")}_${Date.now()}.csv`
    : `reporte_general_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── DATOS INICIALES ──────────────────────────────────────────────────────────
const AREAS_INIT = [
  { id: "cal", label: "Calzado",    icon: "👟", color: "#E87C2E", uphEstandar: 100 },
  { id: "tex", label: "Textil",     icon: "👕", color: "#4A90D9", uphEstandar: 80 },
  { id: "acc", label: "Equipo", icon: "👜", color: "#7B5EA7", uphEstandar: 120 },
];
const EMPLEADOS_INIT = [
  { id: "e1", nombre: "Jennifer Cahun",  areaId: "cal", activo: true },
  { id: "e2", nombre: "Paula Tuz",  areaId: "tex", activo: true },
  { id: "e3", nombre: "Alfredo Cedillo",  areaId: "tex", activo: true },
];
const ADMIN_PIN = "1234";

// ─── COMPONENTES ──────────────────────────────────────────────────────────────
const Tag = ({ color, children }) => (
  <span style={{
    display: "inline-block", padding: "2px 10px", fontSize: "10px",
    letterSpacing: "2px", textTransform: "uppercase",
    background: color + "22", color, border: `1px solid ${color}55`,
    fontFamily: "'IBM Plex Mono', monospace",
  }}>{children}</span>
);

const MetricBox = ({ label, value, color = "#666", small }) => (
  <div style={{
    background: "#17191F", border: "1px solid #1E2028", padding: "16px 20px",
    position: "relative", overflow: "hidden",
  }}>
    <div style={{ position: "absolute", top: 0, left: 0, width: "3px", height: "100%", background: color }} />
    <div style={{ fontSize: "9px", color: "#555", letterSpacing: "2px", marginBottom: "6px" }}>{label}</div>
    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: small ? "28px" : "48px", color, lineHeight: 1 }}>{value}</div>
  </div>
);

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function UPHApp() {
  const [areas, setAreas] = useState(AREAS_INIT);
  const [empleados, setEmpleados] = useState(EMPLEADOS_INIT);
  const [sesiones, setSesiones] = useState([]);

  // Sesión activa
  const [sesionActiva, setSesionActiva] = useState(null);
  const [pausada, setPausada] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pauseTotal, setPauseTotal] = useState(0);
  // Snapshot: métricas congeladas — solo se muestran al pausar o terminar
  const [snapshot, setSnapshot] = useState(null);

  const startRef      = useRef(null);
  const pauseStartRef = useRef(null);
  const pauseAccRef   = useRef(0);
  const intervalRef   = useRef(null);

  // Navegación
  const [vista, setVista] = useState("inicio");
  const [adminAuth, setAdminAuth] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  // Formulario nueva sesión — SIN uphEstandar (se toma del área en admin)
  const [form, setForm] = useState({ empleadoId: "", areaId: "", unidades: "", dn: "" });

  // Admin
  const [adminVista, setAdminVista] = useState("dashboard");
  const [modalEmpleado, setModalEmpleado] = useState(null);
  const [modalArea, setModalArea] = useState(null);

  // ── Timer (solo actualiza el cronómetro) ──
  useEffect(() => {
    if (sesionActiva && !pausada) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const paused = pauseAccRef.current + (pauseStartRef.current ? now - pauseStartRef.current : 0);
        setElapsed(now - startRef.current - paused);
        setPauseTotal(paused);
      }, 500);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [sesionActiva, pausada]);

  // ── Iniciar sesión ──
  const iniciar = () => {
    const emp  = empleados.find((e) => e.id === form.empleadoId);
    const area = areas.find((a) => a.id === form.areaId);
    if (!emp || !area || !form.unidades) return;
    const now = Date.now();
    startRef.current      = now;
    pauseAccRef.current   = 0;
    pauseStartRef.current = null;
    setElapsed(0);
    setPauseTotal(0);
    setPausada(false);
    setSnapshot(null);
    setSesionActiva({
      empleadoId: emp.id, empleadoNombre: emp.nombre, dn: form.dn,
      areaId: area.id, unidadLabel: area.label, unidadColor: area.color,
      unidades: parseInt(form.unidades), uphEstandar: area.uphEstandar, inicio: now,
    });
    setVista("sesion");
  };

  // ── Pausa — genera snapshot de métricas al pausar, lo limpia al reanudar ──
  const togglePausa = () => {
    const now = Date.now();
    if (!pausada) {
      pauseStartRef.current = now;
      const elapsedSnap = now - startRef.current - pauseAccRef.current;
      const uph = calcUPH(sesionActiva.unidades, elapsedSnap);
      const ef  = sesionActiva.uphEstandar > 0 ? Math.round((uph / sesionActiva.uphEstandar) * 100) : 0;
      setSnapshot({ uphReal: uph, eficiencia: ef, elapsed: elapsedSnap, pauseAcc: pauseAccRef.current });
      setPausada(true);
    } else {
      pauseAccRef.current += now - pauseStartRef.current;
      pauseStartRef.current = null;
      setSnapshot(null);
      setPausada(false);
    }
  };

  // ── Terminar ──
  const terminar = () => {
    const uphReal    = calcUPH(sesionActiva.unidades, elapsed);
    const eficiencia = sesionActiva.uphEstandar > 0 ? Math.round((uphReal / sesionActiva.uphEstandar) * 100) : 0;
    const nueva = { ...sesionActiva, fin: Date.now(), tiempoActivo: elapsed, tiempoPausa: pauseTotal, uphReal, eficiencia };
    setSesiones((p) => [nueva, ...p]);
    setSesionActiva(null);
    setPausada(false);
    setElapsed(0);
    setPauseTotal(0);
    setSnapshot(null);
    setVista("historial");
  };

  // ── Admin auth ──
  const loginAdmin = () => {
    if (pinInput === ADMIN_PIN) {
      setAdminAuth(true); setPinInput(""); setPinError(false);
      setVista("admin"); setAdminVista("dashboard");
    } else { setPinError(true); setPinInput(""); }
  };
  const salirAdmin = () => { setAdminAuth(false); setVista("inicio"); };

  // ── Helpers ──
  const colorActual = sesionActiva?.unidadColor || "#E87C2E";
  const efColor     = (e) => e >= 100 ? "#4CAF50" : e >= 80 ? "#E8C040" : "#E84040";

  const onSelectEmpleado = (id) => {
    const emp  = empleados.find((e) => e.id === id);
    const area = emp ? areas.find((a) => a.id === emp.areaId) : null;
    setForm((f) => ({ ...f, empleadoId: id, areaId: area?.id || "" }));
  };
  const onSelectArea = (id) => setForm((f) => ({ ...f, areaId: id }));

  // ─── CSS ──────────────────────────────────────────────────────────────────
  const G = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=Bebas+Neue&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0F1014}
    ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#2a2a2a}
    input,select,button{outline:none;font-family:'IBM Plex Mono',monospace}
    select option{background:#17191F}
    .inp{width:100%;background:#17191F;border:1px solid #252830;color:#E8E6E0;padding:11px 14px;font-size:13px;transition:border .15s}
    .inp:focus{border-color:var(--ac)}
    .inp::placeholder{color:#333}
    .lbl{display:block;font-size:9px;letter-spacing:2px;color:#555;text-transform:uppercase;margin-bottom:7px}
    .btn{padding:12px 24px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;cursor:pointer;transition:all .15s;border:none}
    .btn-ac{background:var(--ac);color:#0F1014;clip-path:polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,7px 100%,0 calc(100% - 7px))}
    .btn-ac:hover{filter:brightness(1.15);transform:translateY(-1px)}
    .btn-ghost{background:transparent;border:1px solid #2a2a2a;color:#777}
    .btn-ghost:hover{border-color:#555;color:#ccc}
    .btn-danger{background:transparent;border:1px solid #c0392b44;color:#e74c3c;font-size:10px;padding:7px 14px;letter-spacing:1px;cursor:pointer;transition:all .15s}
    .btn-danger:hover{background:#c0392b22}
    .card{background:#17191F;border:1px solid #1E2028;padding:20px}
    .nav-item{background:none;border:none;color:#444;font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;padding:10px 14px;border-bottom:2px solid transparent;transition:all .15s}
    .nav-item:hover{color:#999}
    .nav-item.on{color:#E8E6E0;border-bottom-color:var(--ac)}
    .modal-bg{position:fixed;inset:0;background:#000a;display:flex;align-items:center;justify-content:center;z-index:999}
    .modal{background:#13151A;border:1px solid #252830;padding:28px;width:90%;max-width:440px}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:.5}}
    .blink{animation:blink 1.4s infinite}
    .row-hist{background:#17191F;border:1px solid #1E2028;padding:14px 18px;margin-bottom:8px;transition:border-color .15s}
    .row-hist:hover{border-color:#333}
    .area-card{background:#17191F;border:1px solid #1E2028;padding:14px 18px;cursor:pointer;transition:all .15s}
    .area-card:hover{border-color:#333}
    .area-card.sel{border-color:var(--card-ac)}
    .emp-row{background:#17191F;border:1px solid #1E2028;padding:12px 18px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between}
    .metric-placeholder{background:#17191F;border:1px dashed #252830;padding:20px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px}
  `;

  return (
    <div style={{ minHeight: "100vh", background: "#0F1014", fontFamily: "'IBM Plex Mono',monospace", color: "#E8E6E0", "--ac": colorActual }}>
      <style>{G}</style>

      {/* ── HEADER ── */}
      <div style={{ background: "#0A0B0E", borderBottom: "1px solid #1E2028", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "28px", height: "28px", background: colorActual, clipPath: "polygon(0 0,100% 0,100% 65%,65% 100%,0 100%)" }} />
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "20px", letterSpacing: "3px" }}>UPH TRACKER</div>
            <div style={{ fontSize: "9px", color: "#3a3a3a", letterSpacing: "2px" }}>CONTROL DE PRODUCTIVIDAD</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: "2px" }}>
          {!adminAuth && ["inicio", "historial"].map((v) => (
            <button key={v} className={`nav-item ${vista === v || (v === "inicio" && vista === "sesion") ? "on" : ""}`}
              style={{ "--ac": colorActual }} onClick={() => { if (!sesionActiva) setVista(v); }}>
              {v === "inicio" ? "Nueva" : "Historial"}
            </button>
          ))}
          {adminAuth
            ? <button className="btn btn-danger" style={{ fontSize: "10px" }} onClick={salirAdmin}>✕ Salir Admin</button>
            : <button className="nav-item" style={{ "--ac": "#888", color: vista === "admin" ? "#E8E6E0" : "#333" }}
                onClick={() => setVista("admin")}>⚙ Admin</button>
          }
        </nav>
      </div>

      <div style={{ maxWidth: "740px", margin: "0 auto", padding: "28px 18px", "--ac": colorActual }}>

        {/* ════════ INICIO ════════ */}
        {vista === "inicio" && (
          <div>
            <div style={{ marginBottom: "28px" }}>
              <div style={{ fontSize: "9px", color: "#3a3a3a", letterSpacing: "3px", marginBottom: "6px" }}>// Nueva sesión</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "34px", letterSpacing: "2px" }}>Registrar Empleado</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

              {/* Número de DN + Empleado */}
              <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "14px" }}>
                <div>
                  <label className="lbl">No. DN</label>
                  <input className="inp" placeholder="Ej. 001234" value={form.dn}
                    onChange={(e) => setForm((f) => ({ ...f, dn: e.target.value }))} />
                </div>
                <div>
                  <label className="lbl">Empleado</label>
                  <select className="inp" value={form.empleadoId} onChange={(e) => onSelectEmpleado(e.target.value)}>
                    <option value="">— Selecciona empleado —</option>
                    {empleados.filter((e) => e.activo).map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Unidad de Negocio */}
              <div>
                <label className="lbl">Unidad de Negocio</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px" }}>
                  {areas.map((a) => (
                    <div key={a.id} className={`area-card ${form.areaId === a.id ? "sel" : ""}`}
                      style={{ "--card-ac": a.color }} onClick={() => onSelectArea(a.id)}>
                      <div style={{ fontSize: "22px", marginBottom: "4px" }}>{a.icon}</div>
                      <div style={{ fontWeight: 700, fontSize: "12px", color: form.areaId === a.id ? a.color : "#E8E6E0" }}>{a.label}</div>
                      <div style={{ fontSize: "9px", color: "#444", marginTop: "3px" }}>Est. {a.uphEstandar} UPH</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Unidades — SIN campo UPH (se gestiona en Admin) */}
              <div style={{ maxWidth: "260px" }}>
                <label className="lbl">Unidades a Procesar</label>
                <input type="number" className="inp" placeholder="Ej. 500" min="1"
                  value={form.unidades} onChange={(e) => setForm((f) => ({ ...f, unidades: e.target.value }))} />
              </div>

              <button className="btn btn-ac"
                style={{ "--ac": areas.find((a) => a.id === form.areaId)?.color || "#E87C2E", width: "100%", marginTop: "4px" }}
                onClick={iniciar} disabled={!form.empleadoId || !form.areaId || !form.unidades}>
                ▶ &nbsp; Iniciar Sesión
              </button>
            </div>
          </div>
        )}

        {/* ════════ SESIÓN ACTIVA ════════ */}
        {vista === "sesion" && sesionActiva && (
          <div style={{ "--ac": colorActual }}>
            {/* Encabezado */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
              <div>
                <div style={{ fontSize: "9px", color: "#3a3a3a", letterSpacing: "3px", marginBottom: "4px" }}>// Sesión activa</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "26px", letterSpacing: "2px" }}>{sesionActiva.empleadoNombre}</div>
                {sesionActiva.dn && <div style={{ fontSize: "10px", color: "#555", marginTop: "2px" }}>DN: {sesionActiva.dn}</div>}
              </div>
              <Tag color={colorActual}>{sesionActiva.unidadLabel}</Tag>
            </div>

            {/* Cronómetro — siempre visible y corriendo */}
            <div style={{ textAlign: "center", background: "#17191F", border: "1px solid #1E2028", padding: "32px 20px", marginBottom: "20px" }}>
              {pausada && (
                <div className="blink" style={{ fontSize: "9px", letterSpacing: "3px", color: "#E8A040", marginBottom: "10px" }}>
                  ⏸ EN PAUSA
                </div>
              )}
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "80px", letterSpacing: "4px", color: colorActual, lineHeight: 1, textShadow: `0 0 40px ${colorActual}44` }}>
                {formatTime(elapsed)}
              </div>
              {pauseTotal > 0 && (
                <div style={{ fontSize: "10px", color: "#444", marginTop: "8px" }}>
                  Pausa acumulada: {formatTime(pauseTotal)}
                </div>
              )}
            </div>

            {/* Métricas — solo visibles cuando está pausado (snapshot) */}
            {snapshot ? (
              <div>
                <div style={{ fontSize: "9px", color: "#555", letterSpacing: "2px", marginBottom: "10px", textAlign: "center" }}>
                  — MÉTRICAS AL MOMENTO DE PAUSA —
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "16px" }}>
                  <MetricBox label="UPH REAL" value={snapshot.uphReal} color={colorActual} />
                  <MetricBox label="UPH ESTÁNDAR" value={sesionActiva.uphEstandar} color="#444" />
                  <MetricBox label="EFICIENCIA" value={`${snapshot.eficiencia}%`} color={efColor(snapshot.eficiencia)} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "22px" }}>
                  <MetricBox label="UNIDADES OBJETIVO" value={sesionActiva.unidades.toLocaleString()} color="#333" small />
                  <MetricBox label="TIEMPO ACTIVO" value={formatTime(snapshot.elapsed)} color="#333" small />
                </div>
                {/* Barra de eficiencia */}
                <div style={{ height: "4px", background: "#1E2028", marginBottom: "22px" }}>
                  <div style={{ height: "100%", width: `${Math.min(snapshot.eficiencia, 100)}%`, background: efColor(snapshot.eficiencia), transition: "width .6s" }} />
                </div>
              </div>
            ) : (
              /* Placeholder cuando está corriendo */
              <div className="metric-placeholder" style={{ marginBottom: "22px" }}>
                <div style={{ fontSize: "22px" }}>⏱</div>
                <div style={{ fontSize: "10px", color: "#3a3a3a", letterSpacing: "2px" }}>LAS MÉTRICAS SE MOSTRARÁN AL PAUSAR</div>
              </div>
            )}

            {/* Botones */}
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={togglePausa} style={{
                flex: 1, padding: "14px", fontWeight: 700, fontSize: "11px",
                letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer", transition: "all .15s",
                background: pausada ? "#2A1F10" : "#1E2028",
                border: `1px solid ${pausada ? "#E87C2E" : "#333"}`,
                color: pausada ? "#E87C2E" : "#E8E6E0",
              }}>
                {pausada ? "▶ Reanudar" : "⏸ Pausa"}
              </button>
              <button className="btn btn-ac" style={{ "--ac": colorActual, flex: 2 }} onClick={terminar}>
                ■ &nbsp;Terminar Sesión
              </button>
            </div>
            <button className="btn btn-ghost" style={{ width: "100%", marginTop: "8px" }}
              onClick={() => { setSesionActiva(null); setPausada(false); setElapsed(0); setSnapshot(null); setVista("inicio"); }}>
              Cancelar sin guardar
            </button>
          </div>
        )}

        {/* ════════ HISTORIAL ════════ */}
        {vista === "historial" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "9px", color: "#3a3a3a", letterSpacing: "3px", marginBottom: "6px" }}>// Sesiones registradas</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "34px", letterSpacing: "2px" }}>Historial</div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn btn-ghost" style={{ fontSize: "10px", padding: "10px 16px" }}
                  onClick={() => exportarExcel(sesiones)}>⬇ Excel General</button>
                <button className="btn btn-ac" style={{ "--ac": "#E87C2E", fontSize: "10px" }} onClick={() => setVista("inicio")}>+ Nueva</button>
              </div>
            </div>

            {sesiones.length === 0
              ? <div style={{ textAlign: "center", color: "#2a2a2a", padding: "80px 0", fontSize: "11px", letterSpacing: "2px" }}>
                  <div style={{ fontSize: "36px", marginBottom: "14px" }}>📋</div>Sin sesiones aún
                </div>
              : sesiones.map((s, i) => (
                <div key={i} className="row-hist">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "13px", marginBottom: "3px" }}>{s.empleadoNombre}</div>
                      {s.dn && <div style={{ fontSize: "9px", color: "#555", marginBottom: "3px" }}>DN: {s.dn}</div>}
                      <div style={{ fontSize: "10px", color: "#555" }}>{fmtFecha(s.inicio)} · {fmtHora(s.inicio)} – {fmtHora(s.fin)}</div>
                      <div style={{ marginTop: "4px" }}><Tag color={s.unidadColor}>{s.unidadLabel}</Tag></div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "36px", color: efColor(s.eficiencia), lineHeight: 1 }}>{s.eficiencia}%</div>
                      <div style={{ fontSize: "9px", color: "#444" }}>eficiencia</div>
                      <button className="btn btn-ghost" style={{ fontSize: "9px", padding: "4px 10px", marginTop: "6px" }}
                        onClick={() => exportarExcel(sesiones, s.empleadoId)}>⬇ Excel</button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginTop: "14px", paddingTop: "12px", borderTop: "1px solid #1E2028" }}>
                    {[["UPH Real", s.uphReal], ["UPH Estándar", s.uphEstandar], ["Unidades", s.unidades.toLocaleString()], ["T. Activo", formatTime(s.tiempoActivo)]].map(([l, v]) => (
                      <div key={l}>
                        <div style={{ fontSize: "8px", color: "#444", letterSpacing: "2px" }}>{l}</div>
                        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "20px", marginTop: "2px" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ height: "3px", background: "#1E2028", marginTop: "10px" }}>
                    <div style={{ height: "100%", width: `${Math.min(s.eficiencia, 100)}%`, background: efColor(s.eficiencia), transition: "width .6s" }} />
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* ════════ ADMIN: LOGIN ════════ */}
        {vista === "admin" && !adminAuth && (
          <div style={{ maxWidth: "360px", margin: "60px auto" }}>
            <div style={{ textAlign: "center", marginBottom: "32px" }}>
              <div style={{ fontSize: "36px", marginBottom: "10px" }}>🔒</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "28px", letterSpacing: "3px" }}>Panel Administrador</div>
              <div style={{ fontSize: "10px", color: "#444", marginTop: "4px", letterSpacing: "2px" }}>Ingresa el PIN de acceso</div>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <input type="password" className="inp" placeholder="PIN" maxLength={6} value={pinInput}
                onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
                onKeyDown={(e) => e.key === "Enter" && loginAdmin()}
                style={{ borderColor: pinError ? "#e74c3c" : undefined }} />
              <button className="btn btn-ac" style={{ "--ac": "#E87C2E", whiteSpace: "nowrap" }} onClick={loginAdmin}>Entrar</button>
            </div>
            {pinError && <div style={{ fontSize: "10px", color: "#e74c3c", marginTop: "8px", letterSpacing: "1px" }}>PIN incorrecto. Inténtalo de nuevo.</div>}
          </div>
        )}

        {/* ════════ ADMIN: PANEL ════════ */}
        {vista === "admin" && adminAuth && (
          <div style={{ "--ac": "#E87C2E" }}>
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "9px", color: "#3a3a3a", letterSpacing: "3px", marginBottom: "4px" }}>// Acceso restringido</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "34px", letterSpacing: "2px" }}>Panel Administrador</div>
            </div>
            <div style={{ display: "flex", gap: "2px", marginBottom: "28px", borderBottom: "1px solid #1E2028" }}>
              {[["dashboard","📊 Dashboard"],["empleados","👷 Empleados"],["areas","📦 Áreas / UPH"],["historial","📋 Historial"]].map(([v, l]) => (
                <button key={v} className={`nav-item ${adminVista === v ? "on" : ""}`}
                  style={{ "--ac": "#E87C2E" }} onClick={() => setAdminVista(v)}>{l}</button>
              ))}
            </div>

            {/* Dashboard */}
            {adminVista === "dashboard" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px", marginBottom: "24px" }}>
                  <MetricBox label="TOTAL SESIONES" value={sesiones.length} color="#E87C2E" />
                  <MetricBox label="EMPLEADOS ACTIVOS" value={empleados.filter((e) => e.activo).length} color="#4A90D9" />
                  <MetricBox label="EFIC. PROMEDIO" value={sesiones.length ? `${Math.round(sesiones.reduce((a, s) => a + s.eficiencia, 0) / sesiones.length)}%` : "—"} color="#4CAF50" />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <div style={{ fontSize: "11px", color: "#555", letterSpacing: "2px" }}>RESUMEN POR UNIDAD</div>
                  <button className="btn btn-ghost" style={{ fontSize: "9px", padding: "8px 14px" }}
                    onClick={() => exportarExcel(sesiones)}>⬇ Exportar Todo a Excel</button>
                </div>
                {areas.map((a) => {
                  const ss = sesiones.filter((s) => s.areaId === a.id);
                  const avgEf = ss.length ? Math.round(ss.reduce((x, s) => x + s.eficiencia, 0) / ss.length) : 0;
                  return (
                    <div key={a.id} className="card" style={{ marginBottom: "10px", borderLeft: `3px solid ${a.color}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontSize: "20px" }}>{a.icon}</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "13px" }}>{a.label}</div>
                            <div style={{ fontSize: "9px", color: "#555" }}>{ss.length} sesiones · UPH est. {a.uphEstandar}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "28px", color: efColor(avgEf) }}>{avgEf}%</div>
                          <div style={{ fontSize: "9px", color: "#444" }}>efic. promedio</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empleados admin */}
            {adminVista === "empleados" && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
                  <button className="btn btn-ac" style={{ "--ac": "#E87C2E", fontSize: "10px" }}
                    onClick={() => setModalEmpleado({ id: null, nombre: "", areaId: areas[0]?.id || "", activo: true })}>
                    + Agregar Empleado
                  </button>
                </div>
                {empleados.map((e) => {
                  const area = areas.find((a) => a.id === e.areaId);
                  return (
                    <div key={e.id} className="emp-row">
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "13px", color: e.activo ? "#E8E6E0" : "#444" }}>{e.nombre}</div>
                        <div style={{ fontSize: "9px", color: "#555", marginTop: "3px" }}>{area?.icon} {area?.label || "Sin área"} · {e.activo ? "Activo" : "Inactivo"}</div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button className="btn btn-ghost" style={{ fontSize: "9px", padding: "7px 12px" }}
                          onClick={() => setModalEmpleado({ ...e })}>Editar</button>
                        <button className="btn btn-danger"
                          onClick={() => setEmpleados((p) => p.map((x) => x.id === e.id ? { ...x, activo: !x.activo } : x))}>
                          {e.activo ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Áreas admin */}
            {adminVista === "areas" && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
                  <button className="btn btn-ac" style={{ "--ac": "#E87C2E", fontSize: "10px" }}
                    onClick={() => setModalArea({ id: null, label: "", icon: "📦", color: "#E87C2E", uphEstandar: 100 })}>
                    + Nueva Área
                  </button>
                </div>
                {areas.map((a) => (
                  <div key={a.id} className="emp-row" style={{ borderLeft: `3px solid ${a.color}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ fontSize: "22px" }}>{a.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "13px" }}>{a.label}</div>
                        <div style={{ fontSize: "9px", color: "#555" }}>UPH Estándar: <span style={{ color: a.color }}>{a.uphEstandar}</span></div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button className="btn btn-ghost" style={{ fontSize: "9px", padding: "7px 12px" }}
                        onClick={() => setModalArea({ ...a })}>Editar</button>
                      <button className="btn btn-danger"
                        onClick={() => { if (areas.length > 1) setAreas((p) => p.filter((x) => x.id !== a.id)); }}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Historial admin */}
            {adminVista === "historial" && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
                  <button className="btn btn-ghost" style={{ fontSize: "9px", padding: "10px 16px" }}
                    onClick={() => exportarExcel(sesiones)}>⬇ Exportar Todo a Excel</button>
                </div>
                {sesiones.length === 0
                  ? <div style={{ textAlign: "center", color: "#2a2a2a", padding: "60px 0", fontSize: "11px", letterSpacing: "2px" }}>Sin sesiones registradas</div>
                  : sesiones.map((s, i) => (
                    <div key={i} className="row-hist">
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "13px" }}>{s.empleadoNombre}</div>
                          {s.dn && <div style={{ fontSize: "9px", color: "#555", marginBottom: "2px" }}>DN: {s.dn}</div>}
                          <div style={{ fontSize: "9px", color: "#555" }}>{fmtFecha(s.inicio)} · {fmtHora(s.inicio)} – {fmtHora(s.fin)}</div>
                          <div style={{ marginTop: "4px" }}><Tag color={s.unidadColor}>{s.unidadLabel}</Tag></div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "32px", color: efColor(s.eficiencia), lineHeight: 1 }}>{s.eficiencia}%</div>
                          <button className="btn btn-ghost" style={{ fontSize: "9px", padding: "4px 10px", marginTop: "4px" }}
                            onClick={() => exportarExcel(sesiones, s.empleadoId)}>⬇ Excel empleado</button>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "8px", marginTop: "12px", paddingTop: "10px", borderTop: "1px solid #1E2028" }}>
                        {[["UPH Real", s.uphReal], ["Estándar", s.uphEstandar], ["Unidades", s.unidades], ["T. Activo", formatTime(s.tiempoActivo)], ["T. Pausa", formatTime(s.tiempoPausa)]].map(([l, v]) => (
                          <div key={l}>
                            <div style={{ fontSize: "8px", color: "#444", letterSpacing: "1px" }}>{l}</div>
                            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "18px", marginTop: "2px" }}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}
      </div>

      {/* ════════ MODAL EMPLEADO ════════ */}
      {modalEmpleado && (
        <div className="modal-bg" onClick={() => setModalEmpleado(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "22px", letterSpacing: "2px", marginBottom: "20px" }}>
              {modalEmpleado.id ? "Editar Empleado" : "Nuevo Empleado"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label className="lbl">Nombre completo</label>
                <input className="inp" value={modalEmpleado.nombre}
                  onChange={(e) => setModalEmpleado((m) => ({ ...m, nombre: e.target.value }))} placeholder="Nombre del empleado" />
              </div>
              <div>
                <label className="lbl">Área / Unidad de Negocio</label>
                <select className="inp" value={modalEmpleado.areaId}
                  onChange={(e) => setModalEmpleado((m) => ({ ...m, areaId: e.target.value }))}>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.label}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setModalEmpleado(null)}>Cancelar</button>
                <button className="btn btn-ac" style={{ "--ac": "#E87C2E", flex: 2 }} onClick={() => {
                  if (!modalEmpleado.nombre.trim()) return;
                  if (modalEmpleado.id) {
                    setEmpleados((p) => p.map((e) => e.id === modalEmpleado.id ? { ...modalEmpleado } : e));
                  } else {
                    setEmpleados((p) => [...p, { ...modalEmpleado, id: "e" + Date.now(), activo: true }]);
                  }
                  setModalEmpleado(null);
                }}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════ MODAL ÁREA ════════ */}
      {modalArea && (
        <div className="modal-bg" onClick={() => setModalArea(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "22px", letterSpacing: "2px", marginBottom: "20px" }}>
              {modalArea.id ? "Editar Área" : "Nueva Área"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: "10px" }}>
                <div>
                  <label className="lbl">Nombre del área</label>
                  <input className="inp" value={modalArea.label}
                    onChange={(e) => setModalArea((m) => ({ ...m, label: e.target.value }))} placeholder="Ej. Electrónica" />
                </div>
                <div>
                  <label className="lbl">Ícono</label>
                  <input className="inp" value={modalArea.icon}
                    onChange={(e) => setModalArea((m) => ({ ...m, icon: e.target.value }))} placeholder="📦" maxLength={2}
                    style={{ textAlign: "center", fontSize: "20px" }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label className="lbl">UPH Estándar</label>
                  <input type="number" className="inp" value={modalArea.uphEstandar} min="1"
                    onChange={(e) => setModalArea((m) => ({ ...m, uphEstandar: parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="lbl">Color</label>
                  <input type="color" value={modalArea.color}
                    onChange={(e) => setModalArea((m) => ({ ...m, color: e.target.value }))}
                    style={{ width: "100%", height: "42px", background: "#17191F", border: "1px solid #252830", cursor: "pointer", padding: "4px" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setModalArea(null)}>Cancelar</button>
                <button className="btn btn-ac" style={{ "--ac": "#E87C2E", flex: 2 }} onClick={() => {
                  if (!modalArea.label.trim()) return;
                  if (modalArea.id) {
                    setAreas((p) => p.map((a) => a.id === modalArea.id ? { ...modalArea } : a));
                  } else {
                    setAreas((p) => [...p, { ...modalArea, id: "a" + Date.now() }]);
                  }
                  setModalArea(null);
                }}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
