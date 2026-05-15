import { useState, useEffect, useRef } from "react";

// ─── EXPORTAR EXCEL REAL (.xlsx via CSV con BOM) ──────────────────────────────
const exportarExcel = (sesiones, filtros = {}) => {
  let datos = [...sesiones];
  if (filtros.empleadoId) datos = datos.filter(s => s.empleadoId === filtros.empleadoId);
  if (filtros.areaId)     datos = datos.filter(s => s.areaId     === filtros.areaId);
  if (filtros.fechaInicio) {
    const ini = new Date(filtros.fechaInicio); ini.setHours(0,0,0,0);
    datos = datos.filter(s => new Date(s.inicio) >= ini);
  }
  if (filtros.fechaFin) {
    const fin = new Date(filtros.fechaFin); fin.setHours(23,59,59,999);
    datos = datos.filter(s => new Date(s.inicio) <= fin);
  }
  if (!datos.length) return alert("No hay sesiones con esos filtros.");

  const header = ["Fecha","No DN","Empleado","Área","Hora Inicio","Hora Fin",
    "Tiempo Activo","Tiempo Pausa","Unidades","UPH Real","UPH Estándar","Eficiencia %","Estado"];
  const rows = datos.map(s => [
    fmtFecha(s.inicio), s.dn||"", s.empleadoNombre, s.unidadLabel,
    fmtHora(s.inicio), fmtHora(s.fin),
    fmtT(s.tiempoActivo||0), fmtT(s.tiempoPausa||0),
    s.unidades, s.uphReal, s.uphEstandar,
    s.eficiencia+"%",
    s.eficiencia>=100?"Cumplido":s.eficiencia>=80?"Aceptable":"Bajo",
  ]);
  const csv = [header,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  const nombreEmp = filtros.empleadoId ? datos[0]?.empleadoNombre?.replace(/\s/g,"_")+"_" : "";
  const hoy       = new Date().toLocaleDateString("es-MX").replace(/\//g,"-");
  a.download = `UPH_${nombreEmp}${hoy}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmtT = (ms) => {
  const s=Math.floor(ms/1000);
  return `${Math.floor(s/3600).toString().padStart(2,"0")}:${Math.floor((s%3600)/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;
};
const calcUPH  = (u,ms) => { const h=ms/3600000; return h<0.001?0:Math.round(u/h); };
const fmtHora  = (ts) => ts?new Date(ts).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"--";
const fmtFecha = (ts) => ts?new Date(ts).toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"numeric"}):"--";
const toInputDate = (ts) => ts?new Date(ts).toISOString().split("T")[0]:"";

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const AREAS_DEFAULT = [
  {id:"cal",label:"Calzado",    icon:"👟",color:"#E87C2E",uphEstandar:120},
  {id:"tex",label:"Textil",     icon:"👕",color:"#E87C2E",uphEstandar:200},
  {id:"acc",label:"Accesorios", icon:"👜",color:"#E87C2E",uphEstandar:150},
];
const CONFIG_DEFAULT = {
  colorFondo:"#FFFFFF", colorAcento:"#E87C2E", colorTexto:"#111111",
  nombreEmpresa:"Nike", subtitulo:"Control de Productividad · NVS Cancun",
  mostrarSubtitulo:true, mostrarBtnAdmin:true,
  mostrarDN:true, mostrarUnidades:true, mostrarAreas:true,
  mostrarPausa:true, mostrarMetricas:true, mostrarPauseAcum:true, mostrarMsgMetricas:true,
  mostrarHistorial:true, mostrarColTiempo:true, mostrarColUPHEst:true,
};
const ADMIN_PIN = "1234";
const load = (k,fb) => { try{const v=localStorage.getItem(k);return v?JSON.parse(v):fb;}catch{return fb;} };
const save = (k,v)  => { try{localStorage.setItem(k,JSON.stringify(v));}catch{} };

// ─── SWITCH ───────────────────────────────────────────────────────────────────
const Switch = ({label,desc,value,onChange,ac}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #f0f0f0"}}>
    <div>
      <div style={{fontSize:"12px",fontWeight:600}}>{label}</div>
      {desc&&<div style={{fontSize:"10px",color:"#888",marginTop:"2px"}}>{desc}</div>}
    </div>
    <div onClick={()=>onChange(!value)} style={{width:"42px",height:"24px",borderRadius:"12px",cursor:"pointer",transition:"all .2s",background:value?ac:"#ddd",position:"relative",flexShrink:0,marginLeft:"16px"}}>
      <div style={{position:"absolute",top:"3px",left:value?"20px":"3px",width:"18px",height:"18px",borderRadius:"50%",background:"#fff",transition:"left .2s",boxShadow:"0 1px 4px #0003"}}/>
    </div>
  </div>
);

// ─── APP ──────────────────────────────────────────────────────────────────────
export default function UPHApp() {
  const [areas,     setAreas]     = useState(()=>load("uph_areas",    AREAS_DEFAULT));
  const [empleados, setEmpleados] = useState(()=>load("uph_empleados",[]));
  const [sesiones,  setSesiones]  = useState(()=>load("uph_sesiones", []));
  const [cfg,       setCfg]       = useState(()=>load("uph_config",   CONFIG_DEFAULT));

  useEffect(()=>save("uph_areas",    areas),    [areas]);
  useEffect(()=>save("uph_empleados",empleados),[empleados]);
  useEffect(()=>save("uph_sesiones", sesiones), [sesiones]);
  useEffect(()=>save("uph_config",   cfg),      [cfg]);

  const updCfg = (k,v) => setCfg(c=>({...c,[k]:v}));

  // Sesión activa
  const [sesionActiva,setSesionActiva]=useState(null);
  const [pausada,setPausada]=useState(false);
  const [elapsed,setElapsed]=useState(0);
  const [pauseTotal,setPauseTotal]=useState(0);
  const [snapshot,setSnapshot]=useState(null);
  const [guardando,setGuardando]=useState(false);
  const [toast,setToast]=useState(null);
  const startRef=useRef(null),pauseStartRef=useRef(null),pauseAccRef=useRef(0),intervalRef=useRef(null);

  // Nav
  const [vista,setVista]=useState("inicio");
  const [adminAuth,setAdminAuth]=useState(false);
  const [pinInput,setPinInput]=useState("");
  const [pinError,setPinError]=useState(false);
  const [adminVista,setAdminVista]=useState("dashboard");
  const [form,setForm]=useState({empleadoId:"",areaId:"",unidades:"",dn:""});
  const [modalEmp,setModalEmp]=useState(null);
  const [modalArea,setModalArea]=useState(null);

  // Filtros resumen
  const [resEmp,setResEmp]=useState("");
  const [resFecIni,setResFecIni]=useState("");
  const [resFecFin,setResFecFin]=useState("");

  // Filtros exportar
  const [expEmp,setExpEmp]=useState("");
  const [expArea,setExpArea]=useState("");
  const [expFecIni,setExpFecIni]=useState("");
  const [expFecFin,setExpFecFin]=useState("");

  const showToast=(msg,ok=true)=>{setToast({msg,ok});setTimeout(()=>setToast(null),3500);};

  useEffect(()=>{
    if(sesionActiva&&!pausada){
      intervalRef.current=setInterval(()=>{
        const now=Date.now();
        const p=pauseAccRef.current+(pauseStartRef.current?now-pauseStartRef.current:0);
        setElapsed(now-startRef.current-p); setPauseTotal(p);
      },500);
    } else clearInterval(intervalRef.current);
    return ()=>clearInterval(intervalRef.current);
  },[sesionActiva,pausada]);

  const iniciar=()=>{
    const emp=empleados.find(e=>e.id===form.empleadoId);
    const area=areas.find(a=>a.id===form.areaId);
    if(!emp||!area||!form.unidades) return;
    const now=Date.now();
    startRef.current=now; pauseAccRef.current=0; pauseStartRef.current=null;
    setElapsed(0); setPauseTotal(0); setPausada(false); setSnapshot(null);
    setSesionActiva({empleadoId:emp.id,empleadoNombre:emp.nombre,dn:form.dn,areaId:area.id,unidadLabel:area.label,unidadColor:area.color,unidades:parseInt(form.unidades),uphEstandar:area.uphEstandar,inicio:now});
    setVista("sesion");
  };

  const togglePausa=()=>{
    const now=Date.now();
    if(!pausada){
      pauseStartRef.current=now;
      const es=now-startRef.current-pauseAccRef.current;
      const uph=calcUPH(sesionActiva.unidades,es);
      const ef=sesionActiva.uphEstandar>0?Math.round((uph/sesionActiva.uphEstandar)*100):0;
      setSnapshot({uphReal:uph,eficiencia:ef,elapsed:es});
      setPausada(true);
    } else {
      pauseAccRef.current+=now-pauseStartRef.current;
      pauseStartRef.current=null; setSnapshot(null); setPausada(false);
    }
  };

  const terminar=async()=>{
    setGuardando(true);
    const uphReal=calcUPH(sesionActiva.unidades,elapsed);
    const eficiencia=sesionActiva.uphEstandar>0?Math.round((uphReal/sesionActiva.uphEstandar)*100):0;
    const nueva={...sesionActiva,id:Date.now().toString(),fin:Date.now(),tiempoActivo:elapsed,tiempoPausa:pauseTotal,uphReal,eficiencia};
    setSesiones(p=>{const u=[nueva,...p];save("uph_sesiones",u);return u;});
    setGuardando(false);
    showToast("✓ Sesión guardada correctamente");
    setSesionActiva(null); setPausada(false); setElapsed(0); setPauseTotal(0); setSnapshot(null);
    setVista("historial");
  };

  const loginAdmin=()=>{
    if(pinInput===ADMIN_PIN){setAdminAuth(true);setPinInput("");setPinError(false);setVista("admin");setAdminVista("dashboard");}
    else{setPinError(true);setPinInput("");}
  };
  const salirAdmin=()=>{setAdminAuth(false);setVista("inicio");};

  // Métricas por empleado con filtros
  const getSesionesEmp=(empId,fecIni,fecFin)=>{
    let s=sesiones.filter(s=>s.empleadoId===empId);
    if(fecIni){const d=new Date(fecIni);d.setHours(0,0,0,0);s=s.filter(x=>new Date(x.inicio)>=d);}
    if(fecFin){const d=new Date(fecFin);d.setHours(23,59,59,999);s=s.filter(x=>new Date(x.inicio)<=d);}
    return s;
  };

  const empSeleccionado = empleados.find(e=>e.id===resEmp);
  const sesEmp = resEmp ? getSesionesEmp(resEmp,resFecIni,resFecFin) : [];
  const metricasEmp = sesEmp.length ? {
    totalSesiones: sesEmp.length,
    eficProm: Math.round(sesEmp.reduce((a,s)=>a+s.eficiencia,0)/sesEmp.length),
    uphPromReal: Math.round(sesEmp.reduce((a,s)=>a+s.uphReal,0)/sesEmp.length),
    totalUnidades: sesEmp.reduce((a,s)=>a+s.unidades,0),
    tiempoTotal: sesEmp.reduce((a,s)=>a+(s.tiempoActivo||0),0),
    porArea: areas.map(a=>{
      const ss=sesEmp.filter(s=>s.areaId===a.id);
      return ss.length?{
        area:a, sesiones:ss.length,
        eficProm:Math.round(ss.reduce((x,s)=>x+s.eficiencia,0)/ss.length),
        uphProm:Math.round(ss.reduce((x,s)=>x+s.uphReal,0)/ss.length),
        unidades:ss.reduce((x,s)=>x+s.unidades,0),
      }:null;
    }).filter(Boolean),
  } : null;

  // Tema
  const BG=cfg.colorFondo, TX=cfg.colorTexto, AC=cfg.colorAcento;
  const CARD=BG==="#FFFFFF"?"#F7F7F7":"#1e1e1e";
  const BDR=BG==="#FFFFFF"?"#E8E8E8":"#2a2a2a";
  const TX2=BG==="#FFFFFF"?"#888":"#666";
  const efC=(e)=>e>=100?"#22a355":e>=80?"#f0a500":"#e03030";

  const G=`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}body{background:${BG};font-family:'Inter',sans-serif}
    ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${BDR}}
    input,select,button{outline:none;font-family:'Inter',sans-serif}
    select option{background:${CARD}}
    .inp{width:100%;background:${CARD};border:1.5px solid ${BDR};color:${TX};padding:11px 14px;font-size:13px;border-radius:8px;transition:border .15s}
    .inp:focus{border-color:${AC}}.inp::placeholder{color:${TX2}}
    .lbl{display:block;font-size:10px;font-weight:600;letter-spacing:.5px;color:${TX2};text-transform:uppercase;margin-bottom:6px}
    .btn-ac{background:${AC};color:#fff;border:none;padding:12px 22px;font-size:12px;font-weight:700;border-radius:8px;cursor:pointer;transition:all .15s}
    .btn-ac:hover{filter:brightness(1.1);transform:translateY(-1px)}.btn-ac:disabled{opacity:.5;cursor:not-allowed;transform:none}
    .btn-ghost{background:transparent;border:1.5px solid ${BDR};color:${TX2};padding:10px 18px;font-size:12px;font-weight:600;border-radius:8px;cursor:pointer;transition:all .15s}
    .btn-ghost:hover{border-color:${AC};color:${AC}}
    .btn-sm{background:${CARD};border:1.5px solid ${BDR};color:${TX2};padding:7px 14px;font-size:11px;font-weight:600;border-radius:6px;cursor:pointer;transition:all .15s}
    .btn-sm:hover{border-color:${AC};color:${AC}}
    .btn-danger{background:transparent;border:1px solid #fcc;color:#e03030;font-size:11px;padding:7px 12px;border-radius:6px;cursor:pointer;transition:all .15s}
    .btn-danger:hover{background:#fff0f0}
    .nav-item{background:none;border:none;border-bottom:2px solid transparent;color:${TX2};font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;padding:10px 12px;transition:all .15s}
    .nav-item:hover{color:${TX}}.nav-item.on{color:${AC};border-bottom-color:${AC}}
    .card{background:${CARD};border:1.5px solid ${BDR};border-radius:12px;padding:20px}
    .modal-bg{position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;z-index:999}
    .modal{background:${BG};border:1.5px solid ${BDR};border-radius:16px;padding:28px;width:90%;max-width:460px;max-height:90vh;overflow-y:auto}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}.blink{animation:blink 1.4s infinite}
    .row-hist{background:${CARD};border:1.5px solid ${BDR};border-radius:12px;padding:16px 20px;margin-bottom:10px;transition:border-color .15s}
    .row-hist:hover{border-color:${AC}}
    .area-card{background:${CARD};border:2px solid ${BDR};border-radius:12px;padding:16px;cursor:pointer;transition:all .15s;text-align:center}
    .area-card:hover{border-color:${AC}}.area-card.sel{border-color:${AC};background:${AC}15}
    .emp-row{background:${CARD};border:1.5px solid ${BDR};border-radius:10px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between}
    .mpholder{background:${CARD};border:2px dashed ${BDR};border-radius:12px;padding:32px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px}
    .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 24px;font-size:12px;font-weight:600;border-radius:50px;z-index:9999;white-space:nowrap;box-shadow:0 4px 20px #0002}
    .mbox{background:${CARD};border:1.5px solid ${BDR};border-radius:12px;padding:16px 18px;position:relative;overflow:hidden}
    .mbox-bar{position:absolute;top:0;left:0;width:3px;height:100%;border-radius:3px 0 0 3px}
    .tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700}
    .filtro-box{background:${CARD};border:1.5px solid ${BDR};border-radius:12px;padding:16px 20px;margin-bottom:20px}
    .section-label{font-size:10px;font-weight:700;letter-spacing:1px;color:${TX2};text-transform:uppercase;margin-bottom:14px}
    .color-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid ${BDR}}
  `;

  return (
    <div style={{minHeight:"100vh",background:BG,color:TX}}>
      <style>{G}</style>

      {toast&&<div className="toast" style={{background:toast.ok?"#e6f9ee":"#fce8e8",color:toast.ok?"#22a355":"#e03030",border:`1px solid ${toast.ok?"#b7ebd0":"#f5b8b8"}`}}>{toast.msg}</div>}

      {/* HEADER */}
      <div style={{background:BG,borderBottom:`1.5px solid ${BDR}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"12px 0"}}>
          <svg width="36" height="14" viewBox="0 0 36 14" fill={AC}>
            <path d="M3.627 13.397L36 1.03c.44-.165.522-.44.181-.617-.34-.176-.959-.132-1.398.033L7.56 10.523c-.88.33-1.694.242-2.09-.22L0 3.3l3.627 10.097z"/>
          </svg>
          <div>
            <div style={{fontSize:"16px",fontWeight:900,letterSpacing:"-.5px",color:TX}}>{cfg.nombreEmpresa}</div>
            {cfg.mostrarSubtitulo&&<div style={{fontSize:"9px",color:TX2,letterSpacing:"1px",textTransform:"uppercase"}}>{cfg.subtitulo}</div>}
          </div>
        </div>
        <nav style={{display:"flex",gap:"2px"}}>
          {!adminAuth&&["inicio","historial"].map(v=>(
            (!cfg.mostrarHistorial&&v==="historial")?null:
            <button key={v} className={`nav-item ${vista===v||(v==="inicio"&&vista==="sesion")?"on":""}`}
              onClick={()=>{if(!sesionActiva)setVista(v);}}>
              {v==="inicio"?"Nueva":"Historial"}
            </button>
          ))}
          {(cfg.mostrarBtnAdmin||adminAuth)&&(
            adminAuth
              ?<button className="btn-danger" style={{marginLeft:"4px"}} onClick={salirAdmin}>✕ Salir</button>
              :<button className="nav-item" style={{color:vista==="admin"?AC:TX2}} onClick={()=>setVista("admin")}>⚙</button>
          )}
        </nav>
      </div>

      <div style={{maxWidth:"740px",margin:"0 auto",padding:"28px 18px"}}>

        {/* ══ INICIO ══ */}
        {vista==="inicio"&&(
          <div>
            <div style={{marginBottom:"28px"}}>
              <div style={{fontSize:"11px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:"6px"}}>Nueva sesión</div>
              <div style={{fontSize:"28px",fontWeight:900,letterSpacing:"-.5px"}}>Registrar Empleado</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"18px"}}>
              <div style={{display:"grid",gridTemplateColumns:cfg.mostrarDN?"150px 1fr":"1fr",gap:"14px"}}>
                {cfg.mostrarDN&&(
                  <div><label className="lbl">No. DN</label>
                    <input className="inp" placeholder="Ej. 001234" value={form.dn} onChange={e=>setForm(f=>({...f,dn:e.target.value}))}/>
                  </div>
                )}
                <div><label className="lbl">Empleado</label>
                  <select className="inp" value={form.empleadoId} onChange={e=>{
                    const emp=empleados.find(x=>x.id===e.target.value);
                    const area=emp?areas.find(a=>a.id===emp.areaId):null;
                    setForm(f=>({...f,empleadoId:e.target.value,areaId:area?.id||""}));
                  }}>
                    <option value="">— Selecciona empleado —</option>
                    {empleados.filter(e=>e.activo).map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                </div>
              </div>
              {cfg.mostrarAreas&&(
                <div><label className="lbl">Unidad de Negocio</label>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px"}}>
                    {areas.map(a=>(
                      <div key={a.id} className={`area-card ${form.areaId===a.id?"sel":""}`} onClick={()=>setForm(f=>({...f,areaId:a.id}))}>
                        <div style={{fontSize:"24px",marginBottom:"6px"}}>{a.icon}</div>
                        <div style={{fontWeight:700,fontSize:"12px",color:form.areaId===a.id?AC:TX}}>{a.label}</div>
                        <div style={{fontSize:"10px",color:TX2,marginTop:"3px"}}>Est. {a.uphEstandar} UPH</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {cfg.mostrarUnidades&&(
                <div style={{maxWidth:"260px"}}><label className="lbl">Unidades a Procesar</label>
                  <input type="number" className="inp" placeholder="Ej. 500" min="1"
                    value={form.unidades} onChange={e=>setForm(f=>({...f,unidades:e.target.value}))}/>
                </div>
              )}
              <button className="btn-ac" style={{width:"100%",marginTop:"4px",fontSize:"14px",padding:"15px"}}
                onClick={iniciar} disabled={!form.empleadoId||(!cfg.mostrarAreas?false:!form.areaId)||(!cfg.mostrarUnidades?false:!form.unidades)}>
                ▶ &nbsp;Iniciar Sesión
              </button>
            </div>
          </div>
        )}

        {/* ══ SESIÓN ACTIVA ══ */}
        {vista==="sesion"&&sesionActiva&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"24px"}}>
              <div>
                <div style={{fontSize:"11px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:"4px"}}>Sesión activa</div>
                <div style={{fontSize:"24px",fontWeight:900}}>{sesionActiva.empleadoNombre}</div>
                {sesionActiva.dn&&cfg.mostrarDN&&<div style={{fontSize:"11px",color:TX2,marginTop:"2px"}}>DN: {sesionActiva.dn}</div>}
              </div>
              <span className="tag" style={{background:AC+"18",color:AC,border:`1px solid ${AC}44`}}>{sesionActiva.unidadLabel}</span>
            </div>
            <div style={{textAlign:"center",background:CARD,border:`1.5px solid ${BDR}`,borderRadius:"16px",padding:"36px 20px",marginBottom:"20px"}}>
              {pausada&&<div className="blink" style={{fontSize:"10px",fontWeight:700,letterSpacing:"2px",color:AC,marginBottom:"12px"}}>⏸ EN PAUSA</div>}
              <div style={{fontSize:"72px",fontWeight:900,color:AC,lineHeight:1,letterSpacing:"-2px",fontVariantNumeric:"tabular-nums"}}>{fmtT(elapsed)}</div>
              {cfg.mostrarPauseAcum&&pauseTotal>0&&<div style={{fontSize:"11px",color:TX2,marginTop:"10px"}}>Pausa acumulada: {fmtT(pauseTotal)}</div>}
            </div>
            {cfg.mostrarMetricas&&(
              snapshot?(
                <div style={{marginBottom:"20px"}}>
                  <div style={{fontSize:"10px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:"12px",textAlign:"center"}}>— Métricas al pausar —</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px",marginBottom:"12px"}}>
                    {[["UPH Real",snapshot.uphReal,AC],["UPH Estándar",sesionActiva.uphEstandar,TX2],["Eficiencia",`${snapshot.eficiencia}%`,efC(snapshot.eficiencia)]].map(([l,v,c])=>(
                      <div key={l} className="mbox"><div className="mbox-bar" style={{background:c}}/>
                        <div style={{fontSize:"9px",fontWeight:700,color:TX2,letterSpacing:"1px",marginBottom:"6px",textTransform:"uppercase"}}>{l}</div>
                        <div style={{fontSize:"28px",fontWeight:900,color:c,lineHeight:1}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"12px"}}>
                    {[["Unidades Objetivo",sesionActiva.unidades.toLocaleString()],["Tiempo Activo",fmtT(snapshot.elapsed)]].map(([l,v])=>(
                      <div key={l} className="mbox">
                        <div style={{fontSize:"9px",fontWeight:700,color:TX2,letterSpacing:"1px",marginBottom:"6px",textTransform:"uppercase"}}>{l}</div>
                        <div style={{fontSize:"22px",fontWeight:900,lineHeight:1}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{height:"6px",background:BDR,borderRadius:"3px"}}>
                    <div style={{height:"100%",width:`${Math.min(snapshot.eficiencia,100)}%`,background:efC(snapshot.eficiencia),borderRadius:"3px",transition:"width .6s"}}/>
                  </div>
                </div>
              ):(
                cfg.mostrarMsgMetricas&&(
                  <div className="mpholder" style={{marginBottom:"20px"}}>
                    <div style={{fontSize:"28px"}}>⏱</div>
                    <div style={{fontSize:"11px",fontWeight:600,color:TX2,textAlign:"center"}}>Las métricas se mostrarán al pausar</div>
                  </div>
                )
              )
            )}
            <div style={{display:"flex",gap:"10px"}}>
              {cfg.mostrarPausa&&(
                <button onClick={togglePausa} style={{flex:1,padding:"14px",fontWeight:700,fontSize:"12px",textTransform:"uppercase",cursor:"pointer",transition:"all .15s",borderRadius:"8px",background:pausada?AC+"18":"transparent",border:`1.5px solid ${pausada?AC:BDR}`,color:pausada?AC:TX2}}>
                  {pausada?"▶ Reanudar":"⏸ Pausa"}
                </button>
              )}
              <button className="btn-ac" style={{flex:2,fontSize:"13px",padding:"14px"}} onClick={terminar} disabled={guardando}>
                {guardando?"⏳ Guardando...":"■ Terminar Sesión"}
              </button>
            </div>
            <button className="btn-ghost" style={{width:"100%",marginTop:"8px"}}
              onClick={()=>{setSesionActiva(null);setPausada(false);setElapsed(0);setSnapshot(null);setVista("inicio");}}>
              Cancelar sin guardar
            </button>
          </div>
        )}

        {/* ══ HISTORIAL ══ */}
        {vista==="historial"&&cfg.mostrarHistorial&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:"24px",flexWrap:"wrap",gap:"12px"}}>
              <div>
                <div style={{fontSize:"11px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:"6px"}}>Sesiones registradas</div>
                <div style={{fontSize:"28px",fontWeight:900,letterSpacing:"-.5px"}}>Historial</div>
              </div>
              <button className="btn-ac" style={{fontSize:"11px"}} onClick={()=>setVista("inicio")}>+ Nueva</button>
            </div>
            {sesiones.length===0
              ?<div style={{textAlign:"center",color:TX2,padding:"80px 0",fontSize:"12px"}}>
                <div style={{fontSize:"40px",marginBottom:"12px"}}>📋</div>Sin sesiones aún
              </div>
              :sesiones.map((s,i)=>(
                <div key={s.id||i} className="row-hist">
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:"8px"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:"14px",marginBottom:"3px"}}>{s.empleadoNombre}</div>
                      {s.dn&&cfg.mostrarDN&&<div style={{fontSize:"10px",color:TX2,marginBottom:"2px"}}>DN: {s.dn}</div>}
                      <div style={{fontSize:"11px",color:TX2}}>{fmtFecha(s.inicio)} · {fmtHora(s.inicio)} – {fmtHora(s.fin)}</div>
                      <span className="tag" style={{marginTop:"6px",background:AC+"18",color:AC,border:`1px solid ${AC}44`}}>{s.unidadLabel}</span>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:"36px",fontWeight:900,color:efC(s.eficiencia),lineHeight:1}}>{s.eficiencia}%</div>
                      <div style={{fontSize:"10px",color:TX2}}>eficiencia</div>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${BDR}`}}>
                    {[["UPH Real",s.uphReal],["UPH Estándar",s.uphEstandar],["Unidades",s.unidades?.toLocaleString()],["T. Activo",fmtT(s.tiempoActivo)]].map(([l,v])=>(
                      <div key={l}>
                        <div style={{fontSize:"9px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase"}}>{l}</div>
                        <div style={{fontSize:"18px",fontWeight:900,marginTop:"2px"}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{height:"4px",background:BDR,borderRadius:"2px",marginTop:"12px"}}>
                    <div style={{height:"100%",width:`${Math.min(s.eficiencia,100)}%`,background:efC(s.eficiencia),borderRadius:"2px",transition:"width .6s"}}/>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {/* ══ ADMIN LOGIN ══ */}
        {vista==="admin"&&!adminAuth&&(
          <div style={{maxWidth:"360px",margin:"60px auto"}}>
            <div style={{textAlign:"center",marginBottom:"32px"}}>
              <div style={{fontSize:"40px",marginBottom:"10px"}}>🔒</div>
              <div style={{fontSize:"24px",fontWeight:900,marginBottom:"6px"}}>Panel Administrador</div>
              <div style={{fontSize:"12px",color:TX2}}>Ingresa el PIN de acceso</div>
            </div>
            <div style={{display:"flex",gap:"10px"}}>
              <input type="password" className="inp" placeholder="PIN" maxLength={6} value={pinInput}
                onChange={e=>{setPinInput(e.target.value);setPinError(false);}}
                onKeyDown={e=>e.key==="Enter"&&loginAdmin()}
                style={{borderColor:pinError?"#e03030":undefined}}/>
              <button className="btn-ac" style={{whiteSpace:"nowrap"}} onClick={loginAdmin}>Entrar</button>
            </div>
            {pinError&&<div style={{fontSize:"11px",color:"#e03030",marginTop:"8px",fontWeight:600}}>PIN incorrecto.</div>}
          </div>
        )}

        {/* ══ ADMIN PANEL ══ */}
        {vista==="admin"&&adminAuth&&(
          <div>
            <div style={{marginBottom:"24px"}}>
              <div style={{fontSize:"11px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:"4px"}}>Acceso restringido</div>
              <div style={{fontSize:"28px",fontWeight:900,letterSpacing:"-.5px"}}>Panel Administrador</div>
            </div>
            <div style={{display:"flex",gap:"0",marginBottom:"28px",borderBottom:`1.5px solid ${BDR}`,overflowX:"auto"}}>
              {[["dashboard","📊 Resumen"],["empleados","👷 Empleados"],["areas","📦 Áreas"],["exportar","⬇ Exportar"],["historial","📋 Historial"],["config","🎨 Personalizar"]].map(([v,l])=>(
                <button key={v} className={`nav-item ${adminVista===v?"on":""}`} onClick={()=>setAdminVista(v)}>{l}</button>
              ))}
            </div>

            {/* ── DASHBOARD / RESUMEN ── */}
            {adminVista==="dashboard"&&(
              <div>
                {/* Métricas globales */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px",marginBottom:"24px"}}>
                  {[
                    ["Sesiones Hoy", sesiones.filter(s=>fmtFecha(s.inicio)===fmtFecha(Date.now())).length, AC],
                    ["Empleados Activos", empleados.filter(e=>e.activo).length, "#4A90D9"],
                    ["Efic. Promedio Global", sesiones.length?`${Math.round(sesiones.reduce((a,s)=>a+s.eficiencia,0)/sesiones.length)}%`:"—", "#22a355"],
                  ].map(([l,v,c])=>(
                    <div key={l} className="card" style={{borderTop:`3px solid ${c}`}}>
                      <div style={{fontSize:"10px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:"8px"}}>{l}</div>
                      <div style={{fontSize:"30px",fontWeight:900,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>

                {/* Resumen por área */}
                <div style={{marginBottom:"8px",fontSize:"11px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase"}}>Resumen por Área</div>
                {areas.map(a=>{
                  const ss=sesiones.filter(s=>s.areaId===a.id);
                  const avgEf=ss.length?Math.round(ss.reduce((x,s)=>x+s.eficiencia,0)/ss.length):0;
                  return(
                    <div key={a.id} className="card" style={{marginBottom:"10px",borderLeft:`4px solid ${a.color}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
                          <span style={{fontSize:"22px"}}>{a.icon}</span>
                          <div>
                            <div style={{fontWeight:700,fontSize:"14px"}}>{a.label}</div>
                            <div style={{fontSize:"10px",color:TX2}}>{ss.length} sesiones · UPH est. {a.uphEstandar}</div>
                          </div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:"28px",fontWeight:900,color:efC(avgEf)}}>{avgEf}%</div>
                          <div style={{fontSize:"10px",color:TX2}}>efic. promedio</div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* ── RESUMEN POR EMPLEADO ── */}
                <div style={{marginTop:"28px",marginBottom:"14px",fontSize:"11px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase"}}>Resumen Individual por Empleado</div>

                {/* Filtros */}
                <div className="filtro-box">
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px"}}>
                    <div>
                      <label className="lbl">Empleado</label>
                      <select className="inp" value={resEmp} onChange={e=>setResEmp(e.target.value)}>
                        <option value="">— Seleccionar —</option>
                        {empleados.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="lbl">Fecha Inicio</label>
                      <input type="date" className="inp" value={resFecIni} onChange={e=>setResFecIni(e.target.value)}/>
                    </div>
                    <div>
                      <label className="lbl">Fecha Fin</label>
                      <input type="date" className="inp" value={resFecFin} onChange={e=>setResFecFin(e.target.value)}/>
                    </div>
                  </div>
                  {(resFecIni||resFecFin||resEmp)&&(
                    <button className="btn-sm" style={{marginTop:"10px"}} onClick={()=>{setResEmp("");setResFecIni("");setResFecFin("");}}>✕ Limpiar filtros</button>
                  )}
                </div>

                {/* Resultados empleado */}
                {!resEmp
                  ?<div style={{textAlign:"center",color:TX2,padding:"32px 0",fontSize:"12px"}}>Selecciona un empleado para ver sus métricas</div>
                  :!metricasEmp
                    ?<div style={{textAlign:"center",color:TX2,padding:"32px 0",fontSize:"12px"}}>Sin sesiones en el rango seleccionado</div>
                    :(
                      <div>
                        {/* Encabezado empleado */}
                        <div className="card" style={{marginBottom:"14px",borderLeft:`4px solid ${AC}`}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
                            <div>
                              <div style={{fontSize:"16px",fontWeight:900}}>{empSeleccionado?.nombre}</div>
                              <div style={{fontSize:"11px",color:TX2,marginTop:"2px"}}>{metricasEmp.totalSesiones} sesiones · {resFecIni&&resFecFin?`${fmtFecha(new Date(resFecIni))} – ${fmtFecha(new Date(resFecFin))}`:resFecIni?`Desde ${fmtFecha(new Date(resFecIni))}`:resFecFin?`Hasta ${fmtFecha(new Date(resFecFin))}`:"Todas las fechas"}</div>
                            </div>
                            <div style={{fontSize:"32px",fontWeight:900,color:efC(metricasEmp.eficProm)}}>{metricasEmp.eficProm}%</div>
                          </div>
                        </div>
                        {/* Métricas globales del empleado */}
                        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px",marginBottom:"16px"}}>
                          {[
                            ["UPH Prom. Real",metricasEmp.uphPromReal,AC],
                            ["Efic. Promedio",`${metricasEmp.eficProm}%`,efC(metricasEmp.eficProm)],
                            ["Total Unidades",metricasEmp.totalUnidades.toLocaleString(),"#4A90D9"],
                            ["Tiempo Total",fmtT(metricasEmp.tiempoTotal),"#7B5EA7"],
                          ].map(([l,v,c])=>(
                            <div key={l} className="mbox"><div className="mbox-bar" style={{background:c}}/>
                              <div style={{fontSize:"9px",fontWeight:700,color:TX2,letterSpacing:"1px",marginBottom:"6px",textTransform:"uppercase"}}>{l}</div>
                              <div style={{fontSize:"20px",fontWeight:900,color:c,lineHeight:1}}>{v}</div>
                            </div>
                          ))}
                        </div>
                        {/* Por área */}
                        {metricasEmp.porArea.length>0&&(
                          <div>
                            <div style={{fontSize:"10px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:"10px"}}>Desglose por Área</div>
                            {metricasEmp.porArea.map(({area,sesiones:ns,eficProm:ef,uphProm,unidades})=>(
                              <div key={area.id} className="card" style={{marginBottom:"8px",borderLeft:`3px solid ${area.color}`}}>
                                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                                    <span style={{fontSize:"18px"}}>{area.icon}</span>
                                    <div>
                                      <div style={{fontWeight:700,fontSize:"13px"}}>{area.label}</div>
                                      <div style={{fontSize:"10px",color:TX2}}>{ns} sesiones · {unidades.toLocaleString()} unidades</div>
                                    </div>
                                  </div>
                                  <div style={{display:"flex",gap:"16px",alignItems:"center"}}>
                                    <div style={{textAlign:"center"}}>
                                      <div style={{fontSize:"11px",color:TX2}}>UPH Real</div>
                                      <div style={{fontSize:"18px",fontWeight:900,color:AC}}>{uphProm}</div>
                                    </div>
                                    <div style={{textAlign:"center"}}>
                                      <div style={{fontSize:"11px",color:TX2}}>Efic.</div>
                                      <div style={{fontSize:"18px",fontWeight:900,color:efC(ef)}}>{ef}%</div>
                                    </div>
                                  </div>
                                </div>
                                <div style={{height:"4px",background:BDR,borderRadius:"2px",marginTop:"10px"}}>
                                  <div style={{height:"100%",width:`${Math.min(ef,100)}%`,background:efC(ef),borderRadius:"2px"}}/>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Sesiones individuales */}
                        <div style={{marginTop:"16px"}}>
                          <div style={{fontSize:"10px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:"10px"}}>Sesiones del Período</div>
                          {sesEmp.map((s,i)=>(
                            <div key={s.id||i} className="row-hist" style={{padding:"12px 16px"}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"6px"}}>
                                <div>
                                  <div style={{fontSize:"11px",color:TX2}}>{fmtFecha(s.inicio)} · {fmtHora(s.inicio)} – {fmtHora(s.fin)}</div>
                                  <span className="tag" style={{marginTop:"4px",background:AC+"18",color:AC,border:`1px solid ${AC}44`,fontSize:"9px"}}>{s.unidadLabel}</span>
                                </div>
                                <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
                                  <div style={{textAlign:"center"}}>
                                    <div style={{fontSize:"9px",color:TX2}}>UPH</div>
                                    <div style={{fontSize:"16px",fontWeight:900,color:AC}}>{s.uphReal}</div>
                                  </div>
                                  <div style={{textAlign:"center"}}>
                                    <div style={{fontSize:"9px",color:TX2}}>Efic.</div>
                                    <div style={{fontSize:"16px",fontWeight:900,color:efC(s.eficiencia)}}>{s.eficiencia}%</div>
                                  </div>
                                  <div style={{textAlign:"center"}}>
                                    <div style={{fontSize:"9px",color:TX2}}>Unid.</div>
                                    <div style={{fontSize:"16px",fontWeight:900}}>{s.unidades}</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                }
              </div>
            )}

            {/* ── EMPLEADOS ── */}
            {adminVista==="empleados"&&(
              <div>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:"16px"}}>
                  <button className="btn-ac" style={{fontSize:"11px"}} onClick={()=>setModalEmp({id:null,nombre:"",areaId:areas[0]?.id||"",activo:true})}>+ Agregar Empleado</button>
                </div>
                {empleados.length===0
                  ?<div style={{textAlign:"center",color:TX2,padding:"40px 0",fontSize:"12px"}}>Sin empleados. Agrega el primero.</div>
                  :empleados.map(e=>{
                    const area=areas.find(a=>a.id===e.areaId);
                    return(
                      <div key={e.id} className="emp-row">
                        <div>
                          <div style={{fontWeight:700,fontSize:"13px",color:e.activo?TX:"#aaa"}}>{e.nombre}</div>
                          <div style={{fontSize:"10px",color:TX2,marginTop:"2px"}}>{area?.icon} {area?.label||"Sin área"} · {e.activo?"Activo":"Inactivo"}</div>
                        </div>
                        <div style={{display:"flex",gap:"8px"}}>
                          <button className="btn-sm" onClick={()=>setModalEmp({...e})}>Editar</button>
                          <button className="btn-danger" onClick={()=>setEmpleados(p=>p.map(x=>x.id===e.id?{...x,activo:!x.activo}:x))}>{e.activo?"Desactivar":"Activar"}</button>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            )}

            {/* ── ÁREAS ── */}
            {adminVista==="areas"&&(
              <div>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:"16px"}}>
                  <button className="btn-ac" style={{fontSize:"11px"}} onClick={()=>setModalArea({id:null,label:"",icon:"📦",color:AC,uphEstandar:100})}>+ Nueva Área</button>
                </div>
                {areas.map(a=>(
                  <div key={a.id} className="emp-row" style={{borderLeft:`4px solid ${a.color}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                      <span style={{fontSize:"24px"}}>{a.icon}</span>
                      <div>
                        <div style={{fontWeight:700,fontSize:"13px"}}>{a.label}</div>
                        <div style={{fontSize:"10px",color:TX2}}>UPH Estándar: <strong style={{color:a.color}}>{a.uphEstandar}</strong></div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:"8px"}}>
                      <button className="btn-sm" onClick={()=>setModalArea({...a})}>Editar</button>
                      <button className="btn-danger" onClick={()=>{if(areas.length>1)setAreas(p=>p.filter(x=>x.id!==a.id));}}>Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── EXPORTAR ── */}
            {adminVista==="exportar"&&(
              <div>
                <div style={{marginBottom:"20px"}}>
                  <div style={{fontSize:"11px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:"6px"}}>Exportar a Excel</div>
                  <div style={{fontSize:"13px",color:TX2}}>Filtra los datos que necesitas y descarga el archivo .csv que abre directamente en Excel.</div>
                </div>

                {/* Filtros exportar */}
                <div className="filtro-box" style={{marginBottom:"20px"}}>
                  <div className="section-label">Filtros</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"12px"}}>
                    <div><label className="lbl">Empleado (opcional)</label>
                      <select className="inp" value={expEmp} onChange={e=>setExpEmp(e.target.value)}>
                        <option value="">Todos los empleados</option>
                        {empleados.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
                      </select>
                    </div>
                    <div><label className="lbl">Área (opcional)</label>
                      <select className="inp" value={expArea} onChange={e=>setExpArea(e.target.value)}>
                        <option value="">Todas las áreas</option>
                        {areas.map(a=><option key={a.id} value={a.id}>{a.icon} {a.label}</option>)}
                      </select>
                    </div>
                    <div><label className="lbl">Fecha Inicio</label>
                      <input type="date" className="inp" value={expFecIni} onChange={e=>setExpFecIni(e.target.value)}/>
                    </div>
                    <div><label className="lbl">Fecha Fin</label>
                      <input type="date" className="inp" value={expFecFin} onChange={e=>setExpFecFin(e.target.value)}/>
                    </div>
                  </div>
                  {(expEmp||expArea||expFecIni||expFecFin)&&(
                    <button className="btn-sm" onClick={()=>{setExpEmp("");setExpArea("");setExpFecIni("");setExpFecFin("");}}>✕ Limpiar filtros</button>
                  )}
                </div>

                {/* Preview count */}
                <div className="card" style={{marginBottom:"20px",borderLeft:`4px solid ${AC}`}}>
                  {(()=>{
                    let d=[...sesiones];
                    if(expEmp){d=d.filter(s=>s.empleadoId===expEmp);}
                    if(expArea){d=d.filter(s=>s.areaId===expArea);}
                    if(expFecIni){const x=new Date(expFecIni);x.setHours(0,0,0,0);d=d.filter(s=>new Date(s.inicio)>=x);}
                    if(expFecFin){const x=new Date(expFecFin);x.setHours(23,59,59,999);d=d.filter(s=>new Date(s.inicio)<=x);}
                    return(
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:"14px"}}>{d.length} sesiones listas para exportar</div>
                          <div style={{fontSize:"11px",color:TX2,marginTop:"2px"}}>
                            {expEmp?`Empleado: ${empleados.find(e=>e.id===expEmp)?.nombre} · `:""}
                            {expArea?`Área: ${areas.find(a=>a.id===expArea)?.label} · `:""}
                            {expFecIni||expFecFin?`${expFecIni?fmtFecha(new Date(expFecIni)):"inicio"} → ${expFecFin?fmtFecha(new Date(expFecFin)):"hoy"}`:"Todas las fechas"}
                          </div>
                        </div>
                        <div style={{fontSize:"28px",fontWeight:900,color:AC}}>{d.length}</div>
                      </div>
                    );
                  })()}
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                  <button className="btn-ac" style={{width:"100%",fontSize:"14px",padding:"16px"}}
                    onClick={()=>exportarExcel(sesiones,{empleadoId:expEmp,areaId:expArea,fechaInicio:expFecIni,fechaFin:expFecFin})}>
                    ⬇ Descargar Excel con filtros aplicados
                  </button>
                  <button className="btn-ghost" style={{width:"100%"}}
                    onClick={()=>exportarExcel(sesiones,{})}>
                    ⬇ Descargar Excel completo (todas las sesiones)
                  </button>
                </div>

                {/* Info columnas */}
                <div className="card" style={{marginTop:"20px"}}>
                  <div className="section-label">Columnas incluidas en el Excel</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px"}}>
                    {["Fecha","No. DN","Empleado","Área","Hora Inicio","Hora Fin","T. Activo","T. Pausa","Unidades","UPH Real","UPH Estándar","Eficiencia %","Estado"].map(c=>(
                      <div key={c} style={{fontSize:"11px",padding:"6px 10px",background:AC+"12",borderRadius:"6px",color:AC,fontWeight:600}}>✓ {c}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── HISTORIAL ADMIN ── */}
            {adminVista==="historial"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px",flexWrap:"wrap",gap:"10px"}}>
                  <div style={{fontSize:"12px",color:TX2}}>{sesiones.length} sesiones en este dispositivo</div>
                  <button className="btn-sm" onClick={()=>exportarExcel(sesiones,{})}>⬇ Exportar todo</button>
                </div>
                {sesiones.length===0
                  ?<div style={{textAlign:"center",color:TX2,padding:"60px 0",fontSize:"12px"}}>Sin sesiones registradas</div>
                  :sesiones.map((s,i)=>(
                    <div key={s.id||i} className="row-hist">
                      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:"8px"}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:"13px"}}>{s.empleadoNombre}</div>
                          {s.dn&&<div style={{fontSize:"10px",color:TX2}}>DN: {s.dn}</div>}
                          <div style={{fontSize:"10px",color:TX2}}>{fmtFecha(s.inicio)} · {fmtHora(s.inicio)} – {fmtHora(s.fin)}</div>
                          <span className="tag" style={{marginTop:"4px",background:AC+"18",color:AC,border:`1px solid ${AC}44`,fontSize:"9px"}}>{s.unidadLabel}</span>
                        </div>
                        <div style={{fontSize:"28px",fontWeight:900,color:efC(s.eficiencia)}}>{s.eficiencia}%</div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"8px",marginTop:"12px",paddingTop:"10px",borderTop:`1px solid ${BDR}`}}>
                        {[["UPH Real",s.uphReal],["Estándar",s.uphEstandar],["Unidades",s.unidades],["T. Activo",fmtT(s.tiempoActivo)],["T. Pausa",fmtT(s.tiempoPausa)]].map(([l,v])=>(
                          <div key={l}>
                            <div style={{fontSize:"9px",fontWeight:700,color:TX2,letterSpacing:"1px"}}>{l}</div>
                            <div style={{fontSize:"16px",fontWeight:900,marginTop:"2px"}}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                }
              </div>
            )}

            {/* ── PERSONALIZAR ── */}
            {adminVista==="config"&&(
              <div>
                <div className="card" style={{marginBottom:"14px"}}>
                  <div className="section-label">🎨 Colores y Marca</div>
                  {[
                    ["Nombre de la empresa","nombreEmpresa","text"],
                    ["Subtítulo / Sucursal","subtitulo","text"],
                  ].map(([l,k,t])=>(
                    <div key={k} className="color-row">
                      <label style={{fontSize:"12px",fontWeight:600}}>{l}</label>
                      <input className="inp" style={{width:"220px",padding:"7px 10px",fontSize:"12px"}}
                        value={cfg[k]} onChange={e=>updCfg(k,e.target.value)}/>
                    </div>
                  ))}
                  {[
                    ["Color de fondo","colorFondo"],
                    ["Color de acento (naranja)","colorAcento"],
                    ["Color de texto","colorTexto"],
                  ].map(([l,k])=>(
                    <div key={k} className="color-row">
                      <label style={{fontSize:"12px",fontWeight:600}}>{l}</label>
                      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                        <input type="color" value={cfg[k]} onChange={e=>updCfg(k,e.target.value)}
                          style={{width:"40px",height:"32px",border:`1px solid ${BDR}`,borderRadius:"6px",cursor:"pointer",padding:"2px"}}/>
                        <span style={{fontSize:"11px",color:TX2}}>{cfg[k]}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="card" style={{marginBottom:"14px"}}>
                  <div className="section-label">📱 Navegación</div>
                  <Switch label="Mostrar subtítulo" value={cfg.mostrarSubtitulo} onChange={v=>updCfg("mostrarSubtitulo",v)} ac={AC}/>
                  <Switch label="Botón Admin visible" value={cfg.mostrarBtnAdmin} onChange={v=>updCfg("mostrarBtnAdmin",v)} ac={AC}/>
                  <Switch label="Sección Historial" value={cfg.mostrarHistorial} onChange={v=>updCfg("mostrarHistorial",v)} ac={AC}/>
                </div>
                <div className="card" style={{marginBottom:"14px"}}>
                  <div className="section-label">📋 Formulario</div>
                  <Switch label="Campo No. DN" value={cfg.mostrarDN} onChange={v=>updCfg("mostrarDN",v)} ac={AC}/>
                  <Switch label="Selector de Áreas" value={cfg.mostrarAreas} onChange={v=>updCfg("mostrarAreas",v)} ac={AC}/>
                  <Switch label="Campo Unidades" value={cfg.mostrarUnidades} onChange={v=>updCfg("mostrarUnidades",v)} ac={AC}/>
                </div>
                <div className="card" style={{marginBottom:"14px"}}>
                  <div className="section-label">⏱ Sesión Activa</div>
                  <Switch label="Botón de Pausa" value={cfg.mostrarPausa} onChange={v=>updCfg("mostrarPausa",v)} ac={AC}/>
                  <Switch label="Métricas al pausar" value={cfg.mostrarMetricas} onChange={v=>updCfg("mostrarMetricas",v)} ac={AC}/>
                  <Switch label="Mensaje 'métricas al pausar'" value={cfg.mostrarMsgMetricas} onChange={v=>updCfg("mostrarMsgMetricas",v)} ac={AC}/>
                  <Switch label="Tiempo de pausa acumulada" value={cfg.mostrarPauseAcum} onChange={v=>updCfg("mostrarPauseAcum",v)} ac={AC}/>
                </div>
                <div className="card" style={{marginBottom:"14px"}}>
                  <div className="section-label">📊 Historial</div>
                  <Switch label="Columna Tiempo Activo" value={cfg.mostrarColTiempo} onChange={v=>updCfg("mostrarColTiempo",v)} ac={AC}/>
                  <Switch label="Columna UPH Estándar" value={cfg.mostrarColUPHEst} onChange={v=>updCfg("mostrarColUPHEst",v)} ac={AC}/>
                </div>
                <button className="btn-ghost" style={{width:"100%",color:"#e03030",borderColor:"#fcc"}}
                  onClick={()=>{if(window.confirm("¿Restablecer configuración?"))setCfg(CONFIG_DEFAULT);}}>
                  Restablecer configuración predeterminada
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL EMPLEADO */}
      {modalEmp&&(
        <div className="modal-bg" onClick={()=>setModalEmp(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:"20px",fontWeight:900,marginBottom:"20px"}}>{modalEmp.id?"Editar Empleado":"Nuevo Empleado"}</div>
            <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
              <div><label className="lbl">Nombre completo</label>
                <input className="inp" value={modalEmp.nombre} onChange={e=>setModalEmp(m=>({...m,nombre:e.target.value}))} placeholder="Nombre del empleado"/>
              </div>
              <div><label className="lbl">Área</label>
                <select className="inp" value={modalEmp.areaId} onChange={e=>setModalEmp(m=>({...m,areaId:e.target.value}))}>
                  {areas.map(a=><option key={a.id} value={a.id}>{a.icon} {a.label}</option>)}
                </select>
              </div>
              <div style={{display:"flex",gap:"10px",marginTop:"8px"}}>
                <button className="btn-ghost" style={{flex:1}} onClick={()=>setModalEmp(null)}>Cancelar</button>
                <button className="btn-ac" style={{flex:2}} onClick={()=>{
                  if(!modalEmp.nombre.trim())return;
                  if(modalEmp.id){setEmpleados(p=>p.map(e=>e.id===modalEmp.id?{...modalEmp}:e));}
                  else{setEmpleados(p=>[...p,{...modalEmp,id:"e"+Date.now(),activo:true}]);}
                  setModalEmp(null);
                }}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ÁREA */}
      {modalArea&&(
        <div className="modal-bg" onClick={()=>setModalArea(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:"20px",fontWeight:900,marginBottom:"20px"}}>{modalArea.id?"Editar Área":"Nueva Área"}</div>
            <div style={{display:"flex",flexDirection:"column",gap:"14px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 80px",gap:"10px"}}>
                <div><label className="lbl">Nombre</label>
                  <input className="inp" value={modalArea.label} onChange={e=>setModalArea(m=>({...m,label:e.target.value}))} placeholder="Ej. Electrónica"/>
                </div>
                <div><label className="lbl">Ícono</label>
                  <input className="inp" value={modalArea.icon} onChange={e=>setModalArea(m=>({...m,icon:e.target.value}))} maxLength={2} style={{textAlign:"center",fontSize:"20px"}}/>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
                <div><label className="lbl">UPH Estándar</label>
                  <input type="number" className="inp" value={modalArea.uphEstandar} min="1" onChange={e=>setModalArea(m=>({...m,uphEstandar:parseInt(e.target.value)||0}))}/>
                </div>
                <div><label className="lbl">Color</label>
                  <input type="color" value={modalArea.color} onChange={e=>setModalArea(m=>({...m,color:e.target.value}))}
                    style={{width:"100%",height:"42px",background:CARD,border:`1.5px solid ${BDR}`,borderRadius:"8px",cursor:"pointer",padding:"4px"}}/>
                </div>
              </div>
              <div style={{display:"flex",gap:"10px",marginTop:"8px"}}>
                <button className="btn-ghost" style={{flex:1}} onClick={()=>setModalArea(null)}>Cancelar</button>
                <button className="btn-ac" style={{flex:2}} onClick={()=>{
                  if(!modalArea.label.trim())return;
                  if(modalArea.id){setAreas(p=>p.map(a=>a.id===modalArea.id?{...modalArea}:a));}
                  else{setAreas(p=>[...p,{...modalArea,id:"a"+Date.now()}]);}
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
