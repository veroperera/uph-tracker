import { useState, useEffect, useRef } from "react";

// ─── GOOGLE SHEETS ────────────────────────────────────────────────────────────
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbz0plBaTXyEgWp1aS2teQcp8C1jy_OP_pTPv5csE5I1sBTIMtsCE55d78KqPxhXgg9Xmw/exec";

const guardarEnSheets = async (sesion) => {
  const fmtH = (ts) => ts ? new Date(ts).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) : "--";
  const fmtF = (ts) => ts ? new Date(ts).toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"numeric"}) : "--";
  const fmtT = (ms) => { const s=Math.floor(ms/1000); return `${Math.floor(s/3600).toString().padStart(2,"0")}:${Math.floor((s%3600)/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`; };
  try {
    await fetch(SHEETS_URL, {
      method:"POST", mode:"no-cors",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        fecha:fmtF(sesion.inicio), dn:sesion.dn||"", empleado:sesion.empleadoNombre, area:sesion.unidadLabel,
        horaInicio:fmtH(sesion.inicio), horaFin:fmtH(sesion.fin),
        tiempoActivo:fmtT(sesion.tiempoActivo||0), tiempoPausa:fmtT(sesion.tiempoPausa||0),
        unidades:sesion.unidades, uphReal:sesion.uphReal, uphEstandar:sesion.uphEstandar,
        eficiencia:sesion.eficiencia+"%",
        estado:sesion.eficiencia>=100?"Cumplido":sesion.eficiencia>=80?"Aceptable":"Bajo",
      }),
    });
  } catch(e){ console.error("Sheets:",e); }
};

// ─── UTILS ────────────────────────────────────────────────────────────────────
const fmtT = (ms) => { const s=Math.floor(ms/1000); return `${Math.floor(s/3600).toString().padStart(2,"0")}:${Math.floor((s%3600)/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`; };
const calcUPH = (u,ms) => { const h=ms/3600000; return h<0.001?0:Math.round(u/h); };
const fmtHora  = (ts) => ts?new Date(ts).toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"--";
const fmtFecha = (ts) => ts?new Date(ts).toLocaleDateString("es-MX",{day:"2-digit",month:"2-digit",year:"numeric"}):"--";

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const AREAS_DEFAULT = [
  {id:"cal",label:"Calzado",    icon:"👟",color:"#E87C2E",uphEstandar:120},
  {id:"tex",label:"Textil",     icon:"👕",color:"#E87C2E",uphEstandar:200},
  {id:"acc",label:"Accesorios", icon:"👜",color:"#E87C2E",uphEstandar:150},
];

const CONFIG_DEFAULT = {
  // Visual
  colorFondo:    "#FFFFFF",
  colorAcento:   "#E87C2E",
  colorTexto:    "#111111",
  nombreEmpresa: "Nike",
  subtitulo:     "Control de Productividad · NVS Cancun",
  mostrarSubtitulo: true,
  mostrarBtnAdmin:  true,
  // Formulario
  mostrarDN:         true,
  mostrarUnidades:   true,
  mostrarAreas:      true,
  // Sesión activa
  mostrarPausa:         true,
  mostrarMetricas:      true,
  mostrarPauseAcum:     true,
  mostrarMsgMetricas:   true,
  // Historial empleado
  mostrarHistorial:     true,
  mostrarColTiempo:     true,
  mostrarColUPHEst:     true,
};

const ADMIN_PIN = "1234";
const load = (k,fb) => { try{const v=localStorage.getItem(k);return v?JSON.parse(v):fb;}catch{return fb;} };
const save = (k,v) => { try{localStorage.setItem(k,JSON.stringify(v));}catch{} };

// ─── SWITCH COMPONENT ─────────────────────────────────────────────────────────
const Switch = ({label,desc,value,onChange,acento}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #f0f0f0"}}>
    <div>
      <div style={{fontSize:"12px",fontWeight:600,color:"#111"}}>{label}</div>
      {desc&&<div style={{fontSize:"10px",color:"#888",marginTop:"2px"}}>{desc}</div>}
    </div>
    <div onClick={()=>onChange(!value)} style={{
      width:"42px",height:"24px",borderRadius:"12px",cursor:"pointer",transition:"all .2s",
      background:value?acento:"#ddd",position:"relative",flexShrink:0,marginLeft:"16px",
    }}>
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

  const updCfg = (key,val) => setCfg(c=>({...c,[key]:val}));

  // Sesión
  const [sesionActiva,setSesionActiva]=useState(null);
  const [pausada,  setPausada]  =useState(false);
  const [elapsed,  setElapsed]  =useState(0);
  const [pauseTotal,setPauseTotal]=useState(0);
  const [snapshot, setSnapshot] =useState(null);
  const [guardando,setGuardando]=useState(false);
  const [toast,    setToast]    =useState(null);

  const startRef=useRef(null),pauseStartRef=useRef(null),pauseAccRef=useRef(0),intervalRef=useRef(null);

  // Nav
  const [vista,      setVista]      =useState("inicio");
  const [adminAuth,  setAdminAuth]  =useState(false);
  const [pinInput,   setPinInput]   =useState("");
  const [pinError,   setPinError]   =useState(false);
  const [adminVista, setAdminVista] =useState("dashboard");
  const [form,       setForm]       =useState({empleadoId:"",areaId:"",unidades:"",dn:""});
  const [modalEmp,   setModalEmp]   =useState(null);
  const [modalArea,  setModalArea]  =useState(null);

  const showToast=(msg,ok=true)=>{setToast({msg,ok});setTimeout(()=>setToast(null),3500);};

  // Timer
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
    await guardarEnSheets(nueva);
    setGuardando(false);
    showToast("✓ Guardado en Google Sheets");
    setSesionActiva(null); setPausada(false); setElapsed(0); setPauseTotal(0); setSnapshot(null);
    setVista("historial");
  };

  const loginAdmin=()=>{
    if(pinInput===ADMIN_PIN){setAdminAuth(true);setPinInput("");setPinError(false);setVista("admin");setAdminVista("dashboard");}
    else{setPinError(true);setPinInput("");}
  };
  const salirAdmin=()=>{setAdminAuth(false);setVista("inicio");};

  const efC=(e)=>e>=100?"#22a355":e>=80?"#f0a500":"#e03030";
  const onSelectEmp=(id)=>{
    const emp=empleados.find(e=>e.id===id);
    const area=emp?areas.find(a=>a.id===emp.areaId):null;
    setForm(f=>({...f,empleadoId:id,areaId:area?.id||""}));
  };

  // Colores del tema
  const BG   = cfg.colorFondo;
  const TX   = cfg.colorTexto;
  const AC   = cfg.colorAcento;
  const CARD = BG==="#FFFFFF"?"#F7F7F7":"#1a1a1a";
  const BDR  = BG==="#FFFFFF"?"#E8E8E8":"#2a2a2a";
  const TX2  = BG==="#FFFFFF"?"#888":"#666";
  const isDark = cfg.colorFondo==="#FFFFFF"?false:true;

  const G=`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:${BG};font-family:'Inter',sans-serif}
    ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${BDR}}
    input,select,button{outline:none;font-family:'Inter',sans-serif}
    select option{background:${CARD}}
    .inp{width:100%;background:${CARD};border:1.5px solid ${BDR};color:${TX};padding:11px 14px;font-size:13px;border-radius:8px;transition:border .15s}
    .inp:focus{border-color:${AC}}.inp::placeholder{color:${TX2}}
    .lbl{display:block;font-size:10px;font-weight:600;letter-spacing:.5px;color:${TX2};text-transform:uppercase;margin-bottom:6px}
    .btn-ac{background:${AC};color:#fff;border:none;padding:13px 24px;font-size:12px;font-weight:700;letter-spacing:.5px;border-radius:8px;cursor:pointer;transition:all .15s}
    .btn-ac:hover{filter:brightness(1.1);transform:translateY(-1px)}.btn-ac:disabled{opacity:.5;cursor:not-allowed;transform:none}
    .btn-ghost{background:transparent;border:1.5px solid ${BDR};color:${TX2};padding:11px 20px;font-size:12px;font-weight:600;border-radius:8px;cursor:pointer;transition:all .15s}
    .btn-ghost:hover{border-color:${AC};color:${AC}}
    .btn-danger{background:transparent;border:1px solid #fcc;color:#e03030;font-size:11px;padding:7px 12px;border-radius:6px;cursor:pointer;transition:all .15s}
    .btn-danger:hover{background:#fff0f0}
    .nav-item{background:none;border:none;border-bottom:2px solid transparent;color:${TX2};font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;cursor:pointer;padding:10px 14px;transition:all .15s}
    .nav-item:hover{color:${TX}}.nav-item.on{color:${AC};border-bottom-color:${AC}}
    .card{background:${CARD};border:1.5px solid ${BDR};border-radius:12px;padding:20px}
    .modal-bg{position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;z-index:999}
    .modal{background:${BG};border:1.5px solid ${BDR};border-radius:16px;padding:28px;width:90%;max-width:460px;max-height:90vh;overflow-y:auto}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:.4}}.blink{animation:blink 1.4s infinite}
    .row-hist{background:${CARD};border:1.5px solid ${BDR};border-radius:12px;padding:16px 20px;margin-bottom:10px;transition:border-color .15s}
    .row-hist:hover{border-color:${AC}}
    .area-card{background:${CARD};border:2px solid ${BDR};border-radius:12px;padding:16px;cursor:pointer;transition:all .15s;text-align:center}
    .area-card:hover{border-color:${AC}}.area-card.sel{border-color:${AC};background:${AC}11}
    .emp-row{background:${CARD};border:1.5px solid ${BDR};border-radius:10px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between}
    .mpholder{background:${CARD};border:2px dashed ${BDR};border-radius:12px;padding:32px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px}
    .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 24px;font-size:12px;font-weight:600;border-radius:50px;z-index:9999;white-space:nowrap;box-shadow:0 4px 20px #0002}
    .metric-card{background:${CARD};border:1.5px solid ${BDR};border-radius:12px;padding:18px 20px;position:relative;overflow:hidden}
    .section-title{font-size:10px;font-weight:700;letter-spacing:1px;color:${TX2};text-transform:uppercase;margin-bottom:16px}
    .color-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid ${BDR}}
    .color-row label{font-size:12px;font-weight:600;color:${TX}}
  `;

  return (
    <div style={{minHeight:"100vh",background:BG,color:TX}}>
      <style>{G}</style>

      {/* TOAST */}
      {toast&&<div className="toast" style={{background:toast.ok?"#e6f9ee":"#fce8e8",color:toast.ok?"#22a355":"#e03030",border:`1px solid ${toast.ok?"#b7ebd0":"#f5b8b8"}`}}>{toast.msg}</div>}

      {/* HEADER */}
      <div style={{background:BG,borderBottom:`1.5px solid ${BDR}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"12px 0"}}>
          {/* Logo Nike */}
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
            cfg.mostrarHistorial===false&&v==="historial"?null:
            <button key={v} className={`nav-item ${vista===v||(v==="inicio"&&vista==="sesion")?"on":""}`}
              onClick={()=>{if(!sesionActiva)setVista(v);}}>
              {v==="inicio"?"Nueva":"Historial"}
            </button>
          ))}
          {(cfg.mostrarBtnAdmin||adminAuth)&&(
            adminAuth
              ?<button className="btn-danger" style={{fontSize:"10px",marginLeft:"4px"}} onClick={salirAdmin}>✕ Salir</button>
              :<button className="nav-item" style={{color:vista==="admin"?AC:TX2}} onClick={()=>setVista("admin")}>⚙</button>
          )}
        </nav>
      </div>

      <div style={{maxWidth:"720px",margin:"0 auto",padding:"28px 18px"}}>

        {/* ══ INICIO ══ */}
        {vista==="inicio"&&(
          <div>
            <div style={{marginBottom:"28px"}}>
              <div style={{fontSize:"11px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:"6px"}}>Nueva sesión</div>
              <div style={{fontSize:"28px",fontWeight:900,color:TX,letterSpacing:"-.5px"}}>Registrar Empleado</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"18px"}}>

              {/* DN + Empleado */}
              <div style={{display:"grid",gridTemplateColumns:cfg.mostrarDN?"150px 1fr":"1fr",gap:"14px"}}>
                {cfg.mostrarDN&&(
                  <div>
                    <label className="lbl">No. DN</label>
                    <input className="inp" placeholder="Ej. 001234" value={form.dn} onChange={e=>setForm(f=>({...f,dn:e.target.value}))}/>
                  </div>
                )}
                <div>
                  <label className="lbl">Empleado</label>
                  <select className="inp" value={form.empleadoId} onChange={e=>onSelectEmp(e.target.value)}>
                    <option value="">— Selecciona empleado —</option>
                    {empleados.filter(e=>e.activo).map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                </div>
              </div>

              {/* Áreas */}
              {cfg.mostrarAreas&&(
                <div>
                  <label className="lbl">Unidad de Negocio</label>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px"}}>
                    {areas.map(a=>(
                      <div key={a.id} className={`area-card ${form.areaId===a.id?"sel":""}`}
                        onClick={()=>setForm(f=>({...f,areaId:a.id}))}>
                        <div style={{fontSize:"24px",marginBottom:"6px"}}>{a.icon}</div>
                        <div style={{fontWeight:700,fontSize:"12px",color:form.areaId===a.id?AC:TX}}>{a.label}</div>
                        <div style={{fontSize:"10px",color:TX2,marginTop:"3px"}}>Est. {a.uphEstandar} UPH</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unidades */}
              {cfg.mostrarUnidades&&(
                <div style={{maxWidth:"260px"}}>
                  <label className="lbl">Unidades a Procesar</label>
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
                <div style={{fontSize:"24px",fontWeight:900,color:TX}}>{sesionActiva.empleadoNombre}</div>
                {sesionActiva.dn&&cfg.mostrarDN&&<div style={{fontSize:"11px",color:TX2,marginTop:"2px"}}>DN: {sesionActiva.dn}</div>}
              </div>
              <span style={{background:AC+"18",color:AC,border:`1px solid ${AC}44`,padding:"4px 12px",borderRadius:"20px",fontSize:"11px",fontWeight:700}}>
                {sesionActiva.unidadLabel}
              </span>
            </div>

            {/* Cronómetro */}
            <div style={{textAlign:"center",background:CARD,border:`1.5px solid ${BDR}`,borderRadius:"16px",padding:"36px 20px",marginBottom:"20px"}}>
              {pausada&&<div className="blink" style={{fontSize:"10px",fontWeight:700,letterSpacing:"2px",color:AC,marginBottom:"12px"}}>⏸ EN PAUSA</div>}
              <div style={{fontSize:"72px",fontWeight:900,color:AC,lineHeight:1,letterSpacing:"-2px",fontVariantNumeric:"tabular-nums"}}>
                {fmtT(elapsed)}
              </div>
              {cfg.mostrarPauseAcum&&pauseTotal>0&&(
                <div style={{fontSize:"11px",color:TX2,marginTop:"10px"}}>Pausa acumulada: {fmtT(pauseTotal)}</div>
              )}
            </div>

            {/* Métricas al pausar */}
            {cfg.mostrarMetricas&&(
              snapshot?(
                <div style={{marginBottom:"20px"}}>
                  <div style={{fontSize:"10px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:"12px",textAlign:"center"}}>
                    — Métricas al pausar —
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px",marginBottom:"12px"}}>
                    {[["UPH Real",snapshot.uphReal,AC],["UPH Estándar",sesionActiva.uphEstandar,TX2],["Eficiencia",`${snapshot.eficiencia}%`,efC(snapshot.eficiencia)]].map(([l,v,c])=>(
                      <div key={l} className="metric-card">
                        <div style={{position:"absolute",top:0,left:0,width:"3px",height:"100%",background:c,borderRadius:"3px 0 0 3px"}}/>
                        <div style={{fontSize:"9px",fontWeight:700,color:TX2,letterSpacing:"1px",marginBottom:"6px",textTransform:"uppercase"}}>{l}</div>
                        <div style={{fontSize:"28px",fontWeight:900,color:c,lineHeight:1}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"12px"}}>
                    {[["Unidades Objetivo",sesionActiva.unidades.toLocaleString()],["Tiempo Activo",fmtT(snapshot.elapsed)]].map(([l,v])=>(
                      <div key={l} className="metric-card">
                        <div style={{fontSize:"9px",fontWeight:700,color:TX2,letterSpacing:"1px",marginBottom:"6px",textTransform:"uppercase"}}>{l}</div>
                        <div style={{fontSize:"22px",fontWeight:900,color:TX,lineHeight:1}}>{v}</div>
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
                <button onClick={togglePausa} style={{
                  flex:1,padding:"14px",fontWeight:700,fontSize:"12px",letterSpacing:".5px",
                  textTransform:"uppercase",cursor:"pointer",transition:"all .15s",borderRadius:"8px",
                  background:pausada?AC+"18":"transparent",
                  border:`1.5px solid ${pausada?AC:BDR}`,
                  color:pausada?AC:TX2,
                }}>
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
                <div style={{fontSize:"11px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:"6px"}}>Sesiones del dispositivo</div>
                <div style={{fontSize:"28px",fontWeight:900,letterSpacing:"-.5px"}}>Historial</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:"6px",alignItems:"flex-end"}}>
                <div style={{fontSize:"10px",color:TX2}}>📊 Historial completo → Google Sheets</div>
                <button className="btn-ac" style={{fontSize:"11px",padding:"9px 16px"}} onClick={()=>setVista("inicio")}>+ Nueva</button>
              </div>
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
                      <span style={{display:"inline-block",marginTop:"6px",background:AC+"18",color:AC,border:`1px solid ${AC}44`,padding:"2px 10px",borderRadius:"20px",fontSize:"10px",fontWeight:700}}>{s.unidadLabel}</span>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontSize:"36px",fontWeight:900,color:efC(s.eficiencia),lineHeight:1}}>{s.eficiencia}%</div>
                      <div style={{fontSize:"10px",color:TX2}}>eficiencia</div>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:cfg.mostrarColUPHEst?"repeat(4,1fr)":"repeat(3,1fr)",gap:"10px",marginTop:"14px",paddingTop:"12px",borderTop:`1px solid ${BDR}`}}>
                    {[
                      ["UPH Real",s.uphReal,true],
                      ["UPH Estándar",s.uphEstandar,cfg.mostrarColUPHEst],
                      ["Unidades",s.unidades?.toLocaleString(),true],
                      ["T. Activo",fmtT(s.tiempoActivo),cfg.mostrarColTiempo],
                    ].filter(([,, show])=>show).map(([l,v])=>(
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
            <div style={{display:"flex",gap:"2px",marginBottom:"28px",borderBottom:`1.5px solid ${BDR}`,overflowX:"auto"}}>
              {[["dashboard","📊 Resumen"],["empleados","👷 Empleados"],["areas","📦 Áreas"],["historial","📋 Historial"],["config","🎨 Personalizar"]].map(([v,l])=>(
                <button key={v} className={`nav-item ${adminVista===v?"on":""}`} onClick={()=>setAdminVista(v)}>{l}</button>
              ))}
            </div>

            {/* DASHBOARD */}
            {adminVista==="dashboard"&&(
              <div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px",marginBottom:"24px"}}>
                  {[["Sesiones Hoy",sesiones.filter(s=>fmtFecha(s.inicio)===fmtFecha(Date.now())).length,AC],
                    ["Empleados Activos",empleados.filter(e=>e.activo).length,"#4A90D9"],
                    ["Efic. Promedio",sesiones.length?`${Math.round(sesiones.reduce((a,s)=>a+s.eficiencia,0)/sesiones.length)}%`:"—","#22a355"],
                  ].map(([l,v,c])=>(
                    <div key={l} className="card" style={{borderTop:`3px solid ${c}`}}>
                      <div style={{fontSize:"10px",fontWeight:700,color:TX2,letterSpacing:"1px",textTransform:"uppercase",marginBottom:"8px"}}>{l}</div>
                      <div style={{fontSize:"32px",fontWeight:900,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div className="card" style={{marginBottom:"16px",borderLeft:`4px solid #4A90D9`}}>
                  <div style={{fontSize:"11px",fontWeight:700,color:"#4A90D9",letterSpacing:"1px",marginBottom:"8px"}}>📊 HISTORIAL EN GOOGLE SHEETS</div>
                  <div style={{fontSize:"12px",color:TX2,lineHeight:1.7}}>Cada sesión se guarda automáticamente en tu hoja de cálculo. Ábrela desde Google Drive para ver el historial completo de todos los empleados.</div>
                </div>
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
              </div>
            )}

            {/* EMPLEADOS */}
            {adminVista==="empleados"&&(
              <div>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:"16px"}}>
                  <button className="btn-ac" style={{fontSize:"11px"}}
                    onClick={()=>setModalEmp({id:null,nombre:"",areaId:areas[0]?.id||"",activo:true})}>
                    + Agregar Empleado
                  </button>
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
                          <button className="btn-ghost" style={{fontSize:"10px",padding:"6px 12px"}} onClick={()=>setModalEmp({...e})}>Editar</button>
                          <button className="btn-danger" onClick={()=>setEmpleados(p=>p.map(x=>x.id===e.id?{...x,activo:!x.activo}:x))}>
                            {e.activo?"Desactivar":"Activar"}
                          </button>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            )}

            {/* ÁREAS */}
            {adminVista==="areas"&&(
              <div>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:"16px"}}>
                  <button className="btn-ac" style={{fontSize:"11px"}}
                    onClick={()=>setModalArea({id:null,label:"",icon:"📦",color:AC,uphEstandar:100})}>
                    + Nueva Área
                  </button>
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
                      <button className="btn-ghost" style={{fontSize:"10px",padding:"6px 12px"}} onClick={()=>setModalArea({...a})}>Editar</button>
                      <button className="btn-danger" onClick={()=>{if(areas.length>1)setAreas(p=>p.filter(x=>x.id!==a.id));}}>Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* HISTORIAL ADMIN */}
            {adminVista==="historial"&&(
              <div>
                <div className="card" style={{marginBottom:"20px",borderLeft:"4px solid #4A90D9"}}>
                  <div style={{fontSize:"11px",fontWeight:700,color:"#4A90D9",letterSpacing:"1px",marginBottom:"6px"}}>📊 HISTORIAL CENTRALIZADO EN GOOGLE SHEETS</div>
                  <div style={{fontSize:"12px",color:TX2,lineHeight:1.6}}>El historial completo de <strong>todos los dispositivos</strong> está en tu Google Sheets. Aquí solo ves este dispositivo.</div>
                </div>
                {sesiones.length===0
                  ?<div style={{textAlign:"center",color:TX2,padding:"60px 0",fontSize:"12px"}}>Sin sesiones en este dispositivo</div>
                  :sesiones.map((s,i)=>(
                    <div key={s.id||i} className="row-hist">
                      <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:"8px"}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:"13px"}}>{s.empleadoNombre}</div>
                          {s.dn&&<div style={{fontSize:"10px",color:TX2}}>DN: {s.dn}</div>}
                          <div style={{fontSize:"10px",color:TX2}}>{fmtFecha(s.inicio)} · {fmtHora(s.inicio)} – {fmtHora(s.fin)}</div>
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

            {/* 🎨 PERSONALIZACIÓN */}
            {adminVista==="config"&&(
              <div>
                {/* Visual */}
                <div className="card" style={{marginBottom:"16px"}}>
                  <div className="section-title">🎨 Colores y Marca</div>
                  <div className="color-row">
                    <label>Nombre de la empresa</label>
                    <input className="inp" style={{width:"180px",padding:"7px 10px",fontSize:"12px"}}
                      value={cfg.nombreEmpresa} onChange={e=>updCfg("nombreEmpresa",e.target.value)}/>
                  </div>
                  <div className="color-row">
                    <label>Subtítulo / Sucursal</label>
                    <input className="inp" style={{width:"220px",padding:"7px 10px",fontSize:"12px"}}
                      value={cfg.subtitulo} onChange={e=>updCfg("subtitulo",e.target.value)}/>
                  </div>
                  <div className="color-row">
                    <label>Color de fondo</label>
                    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                      <input type="color" value={cfg.colorFondo} onChange={e=>updCfg("colorFondo",e.target.value)}
                        style={{width:"40px",height:"32px",border:`1px solid ${BDR}`,borderRadius:"6px",cursor:"pointer",padding:"2px"}}/>
                      <span style={{fontSize:"11px",color:TX2}}>{cfg.colorFondo}</span>
                    </div>
                  </div>
                  <div className="color-row">
                    <label>Color de acento / naranja</label>
                    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                      <input type="color" value={cfg.colorAcento} onChange={e=>updCfg("colorAcento",e.target.value)}
                        style={{width:"40px",height:"32px",border:`1px solid ${BDR}`,borderRadius:"6px",cursor:"pointer",padding:"2px"}}/>
                      <span style={{fontSize:"11px",color:TX2}}>{cfg.colorAcento}</span>
                    </div>
                  </div>
                  <div className="color-row" style={{borderBottom:"none"}}>
                    <label>Color de texto</label>
                    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                      <input type="color" value={cfg.colorTexto} onChange={e=>updCfg("colorTexto",e.target.value)}
                        style={{width:"40px",height:"32px",border:`1px solid ${BDR}`,borderRadius:"6px",cursor:"pointer",padding:"2px"}}/>
                      <span style={{fontSize:"11px",color:TX2}}>{cfg.colorTexto}</span>
                    </div>
                  </div>
                </div>

                {/* Switches header */}
                <div className="card" style={{marginBottom:"16px"}}>
                  <div className="section-title">📱 Header / Navegación</div>
                  <Switch label="Mostrar subtítulo" desc="La línea debajo del nombre de empresa" value={cfg.mostrarSubtitulo} onChange={v=>updCfg("mostrarSubtitulo",v)} acento={AC}/>
                  <Switch label="Botón Admin visible" desc="Si está oculto, accede desde /admin en URL" value={cfg.mostrarBtnAdmin} onChange={v=>updCfg("mostrarBtnAdmin",v)} acento={AC}/>
                  <Switch label="Sección Historial" desc="Pestaña de historial visible para empleados" value={cfg.mostrarHistorial} onChange={v=>updCfg("mostrarHistorial",v)} acento={AC}/>
                </div>

                {/* Switches formulario */}
                <div className="card" style={{marginBottom:"16px"}}>
                  <div className="section-title">📋 Formulario Nueva Sesión</div>
                  <Switch label="Campo No. DN" desc="Número de documento del empleado" value={cfg.mostrarDN} onChange={v=>updCfg("mostrarDN",v)} acento={AC}/>
                  <Switch label="Selector de Áreas" desc="Tarjetas de Calzado / Textil / Accesorios" value={cfg.mostrarAreas} onChange={v=>updCfg("mostrarAreas",v)} acento={AC}/>
                  <Switch label="Campo Unidades" desc="Cantidad de unidades a procesar" value={cfg.mostrarUnidades} onChange={v=>updCfg("mostrarUnidades",v)} acento={AC}/>
                </div>

                {/* Switches sesión */}
                <div className="card" style={{marginBottom:"16px"}}>
                  <div className="section-title">⏱ Pantalla de Sesión Activa</div>
                  <Switch label="Botón de Pausa" desc="Permite pausar el cronómetro" value={cfg.mostrarPausa} onChange={v=>updCfg("mostrarPausa",v)} acento={AC}/>
                  <Switch label="Métricas al pausar" desc="UPH real, eficiencia y barras al pausar" value={cfg.mostrarMetricas} onChange={v=>updCfg("mostrarMetricas",v)} acento={AC}/>
                  <Switch label="Mensaje 'métricas al pausar'" desc="Texto informativo cuando está corriendo" value={cfg.mostrarMsgMetricas} onChange={v=>updCfg("mostrarMsgMetricas",v)} acento={AC}/>
                  <Switch label="Tiempo de pausa acumulada" desc="Muestra el tiempo total en pausa" value={cfg.mostrarPauseAcum} onChange={v=>updCfg("mostrarPauseAcum",v)} acento={AC}/>
                </div>

                {/* Switches historial */}
                <div className="card" style={{marginBottom:"16px"}}>
                  <div className="section-title">📊 Columnas del Historial</div>
                  <Switch label="Columna Tiempo Activo" desc="Muestra T. Activo en cada sesión" value={cfg.mostrarColTiempo} onChange={v=>updCfg("mostrarColTiempo",v)} acento={AC}/>
                  <Switch label="Columna UPH Estándar" desc="Muestra el UPH meta en cada sesión" value={cfg.mostrarColUPHEst} onChange={v=>updCfg("mostrarColUPHEst",v)} acento={AC}/>
                </div>

                <button className="btn-ghost" style={{width:"100%",color:"#e03030",borderColor:"#fcc"}}
                  onClick={()=>{if(window.confirm("¿Restablecer toda la configuración visual?"))setCfg(CONFIG_DEFAULT);}}>
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
              <div><label className="lbl">Área / Unidad de Negocio</label>
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
                <div><label className="lbl">Nombre del área</label>
                  <input className="inp" value={modalArea.label} onChange={e=>setModalArea(m=>({...m,label:e.target.value}))} placeholder="Ej. Electrónica"/>
                </div>
                <div><label className="lbl">Ícono</label>
                  <input className="inp" value={modalArea.icon} onChange={e=>setModalArea(m=>({...m,icon:e.target.value}))} placeholder="📦" maxLength={2} style={{textAlign:"center",fontSize:"20px"}}/>
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

