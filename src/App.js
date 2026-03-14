import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./supabaseClient";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const ADMIN_USERNAME = "mo";

const TONES = [
  { key:"dominant", emoji:"👑", label:"Selbstsicher" },
  { key:"charming",  emoji:"🥂", label:"Charmant"    },
  { key:"witty",     emoji:"⚡", label:"Witzig"       },
  { key:"warm",      emoji:"🔥", label:"Direkt"       },
];
const TONE_DE = {
  dominant:"selbstsicher und ruhig – weißt was du willst, ohne es zu erzwingen",
  charming: "charmant und aufmerksam – Gentleman mit echtem Interesse",
  witty:    "witzig und leicht – Humor der verbindet, nicht verletzt",
  warm:     "direkt und ehrlich – klar was du willst, respektvoll wie du es sagst",
};
const POWER_COLORS = { STARK:"#D4AF37", AUSGEWOGEN:"#9b8ea8", SCHWACH:"#c0856a" };
const STORAGE_KEY = "mp_local_v3";
const LANGS = [
  ["auto","🌍 Auto"],["de","🇩🇪 DE"],["en","🇬🇧 EN"],
  ["tr","🇹🇷 TR"],["fr","🇫🇷 FR"],["es","🇪🇸 ES"],
  ["it","🇮🇹 IT"],["ar","🇸🇦 AR"],["ru","🇷🇺 RU"],
];
const LANG_LABELS = {
  auto:"Erkenne die Sprache automatisch und schreibe den Opener in dieser Sprache",
  de:"Schreibe ausschließlich auf Deutsch",
  en:"Write exclusively in English",
  tr:"Yalnızca Türkçe yaz",
  fr:"Écris exclusivement en français",
  es:"Escribe exclusivamente en español",
  it:"Scrivi esclusivamente in italiano",
  ar:"اكتب باللغة العربية فقط",
  ru:"Пиши только на русском языке",
};

function loadLocal() {
  try { const r=localStorage.getItem(STORAGE_KEY); return r?JSON.parse(r):{totalAnalyses:0,totalOpeners:0}; }
  catch { return {totalAnalyses:0,totalOpeners:0}; }
}
function saveLocal(d) { try{localStorage.setItem(STORAGE_KEY,JSON.stringify(d));}catch{} }

function fileToB64(file) {
  return new Promise((res,rej)=>{
    const reader=new FileReader();
    reader.onload=e=>res({base64:e.target.result.split(",")[1],mediaType:e.target.result.split(";")[0].split(":")[1],dataUrl:e.target.result});
    reader.onerror=rej;
    reader.readAsDataURL(file);
  });
}

export default function App({ user, onLogout }) {
  const isAdmin = user?.username?.toLowerCase() === ADMIN_USERNAME;
  const [tab,           setTab]           = useState("opener");
  const [tone,          setTone]          = useState("charming");
  const [localMem,      setLocalMem]      = useState(loadLocal);
  const [apiKey,        setApiKey]        = useState(()=>localStorage.getItem("mp_api_key")||"");
  const [showKey,       setShowKey]       = useState(false);
  // opener
  const [profileImgs,   setProfileImgs]   = useState([]);
  const [profileNote,   setProfileNote]   = useState("");
  const [openerLang,    setOpenerLang]    = useState("auto");
  const [genOpener,     setGenOpener]     = useState(false);
  const [openerResult,  setOpenerResult]  = useState(null);
  const [openerErr,     setOpenerErr]     = useState(null);
  const [openerDrag,    setOpenerDrag]    = useState(false);
  const [copiedOpener,  setCopiedOpener]  = useState(null);
  const profileRef = useRef();
  // analyse
  const [chatImg,       setChatImg]       = useState(null);
  const [analyzing,     setAnalyzing]     = useState(false);
  const [chatResult,    setChatResult]    = useState(null);
  const [chatErr,       setChatErr]       = useState(null);
  const [chatDrag,      setChatDrag]      = useState(false);
  const [feedback,      setFeedback]      = useState(null);
  const [currentId,     setCurrentId]     = useState(null);
  const [copiedIdx,     setCopiedIdx]     = useState(null);
  const chatRef = useRef();
  // community + history
  const [commStats,     setCommStats]     = useState(null);
  const [commInsights,  setCommInsights]  = useState([]);
  const [loadingComm,   setLoadingComm]   = useState(false);
  const [myHistory,     setMyHistory]     = useState([]);
  const [loadingHist,   setLoadingHist]   = useState(false);

  const saveKey = k=>{setApiKey(k);localStorage.setItem("mp_api_key",k);};

  useEffect(()=>{
    if(tab==="community") loadComm();
    if(tab==="history")   loadHist();
  },[tab]);

  const loadComm = async()=>{
    setLoadingComm(true);
    const [{data:fb},{data:ins}] = await Promise.all([
      supabase.from("feedback").select("feedback_type,tone"),
      supabase.from("community_insights").select("*").order("upvotes",{ascending:false}).limit(10),
    ]);
    if(fb){
      const total=fb.length, worked=fb.filter(f=>f.feedback_type==="worked").length;
      const tc={}; fb.forEach(f=>{if(f.tone)tc[f.tone]=(tc[f.tone]||0)+1;});
      const bestTone=Object.entries(tc).sort((a,b)=>b[1]-a[1])[0]?.[0];
      setCommStats({total,worked,rate:total?Math.round(worked/total*100):0,bestTone});
    }
    if(ins) setCommInsights(ins);
    setLoadingComm(false);
  };

  const loadHist = async()=>{
    setLoadingHist(true);
    const{data}=await supabase.from("feedback").select("*").eq("username",user.username).order("created_at",{ascending:false}).limit(25);
    if(data) setMyHistory(data);
    setLoadingHist(false);
  };

  const buildCommCtx = async()=>{
    const{data}=await supabase.from("feedback").select("used_reply,feedback_type,tone").not("feedback_type","is",null).order("created_at",{ascending:false}).limit(40);
    if(!data?.length) return "";
    const worked=data.filter(d=>d.feedback_type==="worked");
    const failed=data.filter(d=>d.feedback_type==="failed");
    const tc={}; worked.forEach(d=>{if(d.tone)tc[d.tone]=(tc[d.tone]||0)+1;});
    const bestTone=Object.entries(tc).sort((a,b)=>b[1]-a[1])[0]?.[0];
    let ctx=`\nCOMMUNITY-LERNDATA (${data.length} Analysen):\n`;
    const ws=worked.slice(0,4).map(d=>d.used_reply).filter(Boolean);
    const fs=failed.slice(0,2).map(d=>d.used_reply).filter(Boolean);
    if(ws.length) ctx+=`Hat funktioniert: "${ws.join('", "')}"\n`;
    if(fs.length) ctx+=`NICHT funktioniert: "${fs.join('", "')}"\n`;
    if(bestTone)  ctx+=`Erfolgreichster Stil: ${bestTone}\n`;
    return ctx;
  };

  // ── OPENER ──────────────────────────────────────────────
  const handleProfileFiles = async files=>{
    const arr=Array.from(files).filter(f=>f.type.startsWith("image/")).slice(0,5);
    const conv=await Promise.all(arr.map(fileToB64));
    setProfileImgs(prev=>[...prev,...conv].slice(0,5));
    setOpenerResult(null); setOpenerErr(null);
  };
  const onProfileDrop=useCallback(async e=>{
    e.preventDefault(); setOpenerDrag(false);
    await handleProfileFiles(e.dataTransfer.files);
  },[]);

  const generateOpener=async()=>{
    if(!profileImgs.length&&!profileNote.trim()){setOpenerErr("Bitte Bild oder Beschreibung eingeben.");return;}
    if(!apiKey.trim()){setOpenerErr("API Key fehlt – bitte Admin kontaktieren.");return;}
    setGenOpener(true); setOpenerResult(null); setOpenerErr(null);
    const parts=[];
    profileImgs.forEach(img=>parts.push({type:"image",source:{type:"base64",media_type:img.mediaType,data:img.base64}}));
    parts.push({type:"text",text:`Du bist der Opener-Coach der Manpower Bruderschaft.
Analysiere ${profileImgs.length>0?"die Profilbilder/Screenshots":"die Profilbeschreibung"} und generiere 5 personalisierte erste Nachrichten.
${profileNote?`Infos: ${profileNote}`:""}
SPRACHE: ${LANG_LABELS[openerLang]||LANG_LABELS.auto}
PHILOSOPHIE: Spezifisch auf SIE zugeschnitten. Echter Bezug auf Bio/Hobbys/Fotos. Kurz (max 2 Sätze). Selbstsicher aber nicht arrogant.
Ton: ${TONE_DE[tone]}
Nur valides JSON (keine Backticks):
{"detectedLanguage":"Deutsch/English/etc.","profileAnalysis":"Kurze Profil-Analyse","openers":[{"style":"Humor","text":"Nachricht","warum":"Warum das wirkt"},{"style":"Direkt & Ehrlich","text":"...","warum":"..."},{"style":"Neugier wecken","text":"...","warum":"..."},{"style":"Gemeinsames Interesse","text":"...","warum":"..."},{"style":"Witzig & Leicht","text":"...","warum":"..."}],"profilTipp":"Tipp für das Gespräch","vermeiden":"Was NICHT schreiben"}`});
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey.trim(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-opus-4-5",max_tokens:1500,messages:[{role:"user",content:parts}]})});
      const data=await res.json();
      if(data.error) throw new Error(data.error.message);
      const raw=data.content?.map(i=>i.text||"").join("")||"";
      setOpenerResult(JSON.parse(raw.replace(/```json|```/g,"").trim()));
      const nl={...localMem,totalOpeners:(localMem.totalOpeners||0)+1};
      setLocalMem(nl); saveLocal(nl);
    } catch(err){setOpenerErr("Fehler: "+(err.message||"Versuch es nochmal."));}
    setGenOpener(false);
  };

  // ── ANALYSE ─────────────────────────────────────────────
  const handleChatFile=file=>{
    if(!file||!file.type.startsWith("image/")) return;
    const reader=new FileReader();
    reader.onload=e=>{
      const du=e.target.result;
      setChatImg({base64:du.split(",")[1],dataUrl:du,mediaType:du.split(";")[0].split(":")[1]});
      setChatResult(null); setChatErr(null); setFeedback(null); setCurrentId(null);
    };
    reader.readAsDataURL(file);
  };
  const onChatDrop=useCallback(e=>{e.preventDefault();setChatDrag(false);handleChatFile(e.dataTransfer.files[0]);},[]);

  const analyzeChat=async()=>{
    if(!chatImg) return;
    if(!apiKey.trim()){setChatErr("API Key fehlt – bitte Admin kontaktieren.");return;}
    setAnalyzing(true); setChatResult(null); setChatErr(null); setFeedback(null); setCurrentId(null);
    const commCtx=await buildCommCtx();
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey.trim(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-opus-4-5",max_tokens:1500,
        system:`Du bist der Chat-Coach der Manpower Bruderschaft.
BILDLEGENDE: Farbige/lila/blaue Blase = Nutzer. Graue/dunkle Blase = sie.
SPRACHE: Erkenne die Sprache im Chat. Analyse auf Deutsch. Antwortvorschläge in der Sprache des Chats.
${commCtx}
Nur valides JSON:
{"detectedLanguage":"Sprache","vibeScore":"7.5/10","dynamik":"STARK|AUSGEWOGEN|SCHWACH","kurzanalyse":"2-3 Sätze","staerken":["s1","s2"],"verbesserungen":["v1","v2"],"psychoInsight":"Was verrät ihre Kommunikation?","naechsterSchritt":"Konkret was tun?","replies":[{"label":"Selbstsicher","text":"Antwort in Chat-Sprache","warum":"Erklärung Deutsch"},{"label":"Charmant","text":"...","warum":"..."},{"label":"Witzig","text":"...","warum":"..."}],"prinzip":"Kommunikationsprinzip","situation":"2-3 Wörter"}`,
        messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:chatImg.mediaType,data:chatImg.base64}},{type:"text",text:`Analysiere diesen Chat. Farbige Blase=ich, graue=sie. Ton: ${TONE_DE[tone]}. Nur JSON.`}]}]})});
      const data=await res.json();
      if(data.error) throw new Error(data.error.message);
      const raw=data.content?.map(i=>i.text||"").join("")||"";
      const parsed=JSON.parse(raw.replace(/```json|```/g,"").trim());
      setChatResult(parsed);
      const{data:row}=await supabase.from("feedback").insert({user_id:user.id,username:user.username,tone,vibe_score:parsed.vibeScore,dynamik:parsed.dynamik,situation:parsed.situation||""}).select().single();
      if(row) setCurrentId(row.id);
      const nl={...localMem,totalAnalyses:(localMem.totalAnalyses||0)+1};
      setLocalMem(nl); saveLocal(nl);
    } catch(err){setChatErr("Fehler: "+(err.message||"Versuch es nochmal."));}
    setAnalyzing(false);
  };

  const copyReply=async(text,idx,label)=>{
    navigator.clipboard.writeText(text).catch(()=>{});
    setCopiedIdx(idx);
    if(currentId) await supabase.from("feedback").update({used_reply:text,used_label:label}).eq("id",currentId);
    setTimeout(()=>setCopiedIdx(null),2000);
  };
  const copyOpener=(text,idx)=>{navigator.clipboard.writeText(text).catch(()=>{});setCopiedOpener(idx);setTimeout(()=>setCopiedOpener(null),2000);};
  const markFeedback=async type=>{
    setFeedback(type);
    if(currentId) await supabase.from("feedback").update({feedback_type:type}).eq("id",currentId);
  };

  const TABS=[["opener","💬 Opener"],["analyze","⚔ Analyse"],["community","🌐 Community"],["history","📊 Verlauf"],["tips","💡 Prinzipien"]];

  // ─── DESIGN TOKENS ──────────────────────────────────────
  const C = {
    bg:        "#0e0a0f",
    bg2:       "#16101a",
    bg3:       "#1f1625",
    surface:   "rgba(255,255,255,.03)",
    border:    "rgba(212,175,55,.14)",
    borderHov: "#D4AF37",
    gold:      "#D4AF37",
    gold2:     "#8B6914",
    gold3:     "#F5E27A",
    rose:      "#c9677d",
    rose2:     "#e8a0b0",
    text:      "#f0e8ec",
    muted:     "rgba(240,232,236,.38)",
    red:       "#e05c6a",
    green:     "#5cb87a",
  };

  return (
    <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"Georgia,serif",overflowX:"hidden",position:"relative"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Lato:wght@300;400;700&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}
        @keyframes glowrose{0%,100%{box-shadow:0 0 12px rgba(201,103,125,.2)}50%{box-shadow:0 0 28px rgba(201,103,125,.45)}}
        @keyframes heartbeat{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
        *{box-sizing:border-box;}
        .gb:not(:disabled):hover{transform:translateY(-3px)!important;filter:brightness(1.1);}
        .gb{transition:all .25s!important;}
        .rc{transition:all .22s;cursor:pointer;}
        .rc:hover{border-color:#D4AF37!important;transform:translateX(4px);background:rgba(212,175,55,.07)!important;}
        .tp{transition:all .2s;cursor:pointer;}
        .tp:hover{border-color:rgba(201,103,125,.5)!important;}
        .dz{transition:all .25s;cursor:pointer;}
        .dz:hover{border-color:#c9677d!important;background:rgba(201,103,125,.05)!important;}
        .fb{transition:all .18s;cursor:pointer;}
        .fb:hover{transform:scale(1.05);}
        .tabpill{transition:all .2s;cursor:pointer;}
        .tabpill:hover{color:#D4AF37!important;}
        input,textarea,select{outline:none;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:linear-gradient(#c9677d,#D4AF37);border-radius:2px;}
        ::placeholder{color:rgba(240,232,236,.2);}
      `}</style>

      {/* Atmospheric background */}
      <div style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none"}}>
        <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse 80% 50% at 50% -10%,rgba(201,103,125,.12) 0%,transparent 55%),radial-gradient(ellipse 60% 60% at 100% 100%,rgba(212,175,55,.06) 0%,transparent 50%),radial-gradient(ellipse 50% 50% at 0% 80%,rgba(139,105,20,.08) 0%,transparent 50%)`}}/>
        <div style={{position:"absolute",inset:0,backgroundImage:"repeating-linear-gradient(0deg,rgba(212,175,55,.008) 0,rgba(212,175,55,.008) 1px,transparent 1px,transparent 80px),repeating-linear-gradient(90deg,rgba(212,175,55,.008) 0,rgba(212,175,55,.008) 1px,transparent 1px,transparent 80px)"}}/>
      </div>

      <div style={{position:"relative",zIndex:1,maxWidth:820,margin:"0 auto",padding:"0 15px 80px"}}>

        {/* ── HEADER ── */}
        <header style={{textAlign:"center",padding:"30px 0 22px",borderBottom:`1px solid rgba(201,103,125,.2)`,marginBottom:22,position:"relative"}}>
          {/* Decorative lines */}
          <div style={{position:"absolute",top:"50%",left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,rgba(201,103,125,.15),rgba(212,175,55,.2),rgba(201,103,125,.15),transparent)",pointerEvents:"none"}}/>

          {/* Logo */}
          <div style={{width:62,height:62,margin:"0 auto 10px",position:"relative"}}>
            <div style={{width:"100%",height:"100%",border:"2px solid",borderColor:C.gold,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:"radial-gradient(circle,rgba(201,103,125,.08),rgba(212,175,55,.05))",animation:"glowrose 4s ease infinite"}}>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:24,fontWeight:900,background:`linear-gradient(135deg,${C.gold3},${C.gold},${C.rose2})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>M</span>
            </div>
            <div style={{position:"absolute",top:-3,right:-3,width:10,height:10,background:C.rose,borderRadius:"50%",animation:"heartbeat 2s ease infinite"}}/>
          </div>

          <div style={{fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:"clamp(18px,4vw,32px)",letterSpacing:6,background:`linear-gradient(90deg,${C.gold2},${C.gold},${C.gold3},${C.rose2},${C.gold3},${C.gold},${C.gold2})`,backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",animation:"shimmer 5s linear infinite",marginBottom:2}}>MANPOWER</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:8,color:"rgba(201,103,125,.5)",marginBottom:12}}>BRUDERSCHAFT · DATE COACH</div>

          {/* Stats + user */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,flexWrap:"wrap"}}>
            <StatBadge val={localMem.totalAnalyses||0} label="Analysen" color={C.gold}/>
            <div style={{width:1,height:20,background:"rgba(201,103,125,.2)"}}/>
            <StatBadge val={localMem.totalOpeners||0} label="Opener" color={C.rose}/>
            <div style={{width:1,height:20,background:"rgba(201,103,125,.2)"}}/>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2,color:C.muted}}>
              {isAdmin?"👑":"👤"} {user?.username?.toUpperCase()}
            </span>
            <button onClick={onLogout} style={{background:"rgba(201,103,125,.08)",border:"1px solid rgba(201,103,125,.2)",color:"rgba(201,103,125,.5)",padding:"3px 10px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,borderRadius:20,transition:"all .2s"}}>LOGOUT</button>
          </div>
        </header>

        {/* ── ADMIN ONLY: API KEY ── */}
        {isAdmin && (
          <div style={{background:"rgba(212,175,55,.04)",border:`1px solid rgba(212,175,55,.18)`,borderLeft:`3px solid ${C.gold2}`,borderRadius:8,padding:"12px 15px",marginBottom:18}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
              <span style={{fontSize:12}}>👑</span>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:`rgba(212,175,55,.5)`}}>ADMIN · ANTHROPIC API KEY</div>
            </div>
            <div style={{display:"flex",gap:7}}>
              <input type={showKey?"text":"password"} placeholder="sk-ant-..." value={apiKey} onChange={e=>saveKey(e.target.value)}
                style={{flex:1,background:"rgba(0,0,0,.4)",border:`1px solid rgba(212,175,55,.15)`,borderRadius:6,padding:"8px 12px",color:C.text,fontFamily:"'Lato',sans-serif",fontSize:13}}/>
              <button onClick={()=>setShowKey(s=>!s)} style={{background:"rgba(212,175,55,.07)",border:`1px solid rgba(212,175,55,.15)`,color:C.gold,padding:"8px 12px",cursor:"pointer",borderRadius:6,fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:1}}>{showKey?"HIDE":"SHOW"}</button>
            </div>
            <div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:"rgba(212,175,55,.25)",marginTop:5}}>Nur für Admins sichtbar · console.anthropic.com → API Keys</div>
          </div>
        )}

        {/* ── TONE SELECTOR ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:18}}>
          {TONES.map(t=>(
            <div key={t.key} className="tp" onClick={()=>setTone(t.key)}
              style={{background:tone===t.key?`rgba(201,103,125,.12)`:"rgba(255,255,255,.02)",border:`1px solid ${tone===t.key?"rgba(201,103,125,.6)":"rgba(201,103,125,.15)"}`,borderRadius:10,padding:"11px 5px",textAlign:"center",boxShadow:tone===t.key?"0 0 18px rgba(201,103,125,.18)":"none",position:"relative",overflow:"hidden"}}>
              {tone===t.key&&<div style={{position:"absolute",inset:0,background:"radial-gradient(circle at 50% 0%,rgba(201,103,125,.08),transparent 70%)"}}/>}
              <div style={{fontSize:17,marginBottom:3,position:"relative"}}>{t.emoji}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:1.5,color:tone===t.key?C.rose2:C.muted,position:"relative"}}>{t.label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* ── TABS ── */}
        <div style={{display:"flex",gap:0,marginBottom:20,borderBottom:`1px solid rgba(201,103,125,.12)`,overflowX:"auto"}}>
          {TABS.map(([key,label])=>(
            <div key={key} className="tabpill" onClick={()=>setTab(key)}
              style={{padding:"9px 14px",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1.5,whiteSpace:"nowrap",color:tab===key?C.gold:C.muted,borderBottom:tab===key?`2px solid ${C.gold}`:"2px solid transparent",marginBottom:-1}}>
              {label}
            </div>
          ))}
        </div>

        {/* ══ OPENER TAB ══ */}
        {tab==="opener"&&(
          <div style={{animation:"fadeUp .35s ease"}}>
            <SectionTitle icon="💬" title="OPENER GENERATOR" subtitle="Profilbilder hochladen → KI generiert 5 personalisierte erste Nachrichten in ihrer Sprache" C={C}/>

            <SLabel C={C}>🌍 SPRACHE WÄHLEN</SLabel>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:16}}>
              {LANGS.map(([k,l])=>(
                <div key={k} className="tp" onClick={()=>setOpenerLang(k)}
                  style={{background:openerLang===k?"rgba(201,103,125,.12)":"rgba(255,255,255,.02)",border:`1px solid ${openerLang===k?"rgba(201,103,125,.5)":"rgba(201,103,125,.15)"}`,borderRadius:20,padding:"5px 12px",fontFamily:"'Lato',sans-serif",fontSize:11,color:openerLang===k?C.rose2:C.muted,whiteSpace:"nowrap"}}>
                  {l}
                </div>
              ))}
            </div>

            <SLabel C={C}>📸 PROFILBILDER / SCREENSHOTS (bis zu 5)</SLabel>
            <div className="dz"
              style={{background:openerDrag?"rgba(201,103,125,.07)":"rgba(255,255,255,.02)",border:`1px dashed ${openerDrag?"rgba(201,103,125,.6)":"rgba(201,103,125,.25)"}`,borderRadius:12,padding:"26px 20px",textAlign:"center",marginBottom:10}}
              onClick={()=>profileRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setOpenerDrag(true);}}
              onDragLeave={()=>setOpenerDrag(false)}
              onDrop={onProfileDrop}>
              <div style={{fontSize:26,marginBottom:7,opacity:.5}}>📸</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:2,color:C.rose2,marginBottom:3}}>Profilbilder einwerfen</div>
              <div style={{fontFamily:"'Lato',sans-serif",color:C.muted,fontSize:11}}>Bio-Screenshot · Fotos · Hobbys · alles hilft der KI</div>
            </div>
            <input ref={profileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={async e=>await handleProfileFiles(e.target.files)}/>

            {profileImgs.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5,marginBottom:12}}>
                {profileImgs.map((img,i)=>(
                  <div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",border:`1px solid rgba(201,103,125,.2)`}}>
                    <img src={img.dataUrl} alt="" style={{width:"100%",height:68,objectFit:"cover",display:"block"}}/>
                    <button onClick={()=>setProfileImgs(prev=>prev.filter((_,j)=>j!==i))}
                      style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.8)",border:"none",color:"#ff6b6b",width:18,height:18,borderRadius:"50%",cursor:"pointer",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                  </div>
                ))}
                {profileImgs.length<5&&(
                  <div className="dz" onClick={()=>profileRef.current?.click()}
                    style={{height:68,border:`1px dashed rgba(201,103,125,.2)`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(201,103,125,.3)",fontSize:20}}>+</div>
                )}
              </div>
            )}

            <SLabel C={C}>✍️ PROFIL BESCHREIBEN (optional)</SLabel>
            <textarea value={profileNote} onChange={e=>setProfileNote(e.target.value)}
              placeholder="z.B. Sie ist 26, Ärztin, liebt Reisen und Yoga. Bio: 'Kaffee > Menschen'. Foto in Thailand."
              rows={3} style={{width:"100%",background:"rgba(0,0,0,.35)",border:`1px solid rgba(201,103,125,.18)`,borderRadius:8,padding:"10px 13px",color:C.text,fontFamily:"'Lato',sans-serif",fontSize:13,resize:"vertical",lineHeight:1.6,marginBottom:16}}/>

            <RoseGoldButton onClick={generateOpener} disabled={genOpener} C={C}>
              {genOpener?"✨  GENERIERE OPENER…":"💬  OPENER GENERIEREN"}
            </RoseGoldButton>

            {genOpener&&<Loader text="KI ANALYSIERT PROFIL UND GENERIERT OPENER…" C={C}/>}
            {openerErr&&<ErrBox C={C}>{openerErr}</ErrBox>}

            {openerResult&&(
              <div style={{animation:"fadeUp .4s ease"}}>
                <InfoCard icon="🌍" label="ERKANNTE SPRACHE" borderColor={C.rose} C={C}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:700,color:C.rose2}}>{openerResult.detectedLanguage}</div>
                </InfoCard>
                <InfoCard icon="🔍" label="PROFIL-ANALYSE" borderColor={C.gold} C={C}>
                  <Body C={C}>{openerResult.profileAnalysis}</Body>
                </InfoCard>

                <SLabel C={C}>💬 OPENER – ANTIPPEN ZUM KOPIEREN</SLabel>
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
                  {openerResult.openers?.map((o,i)=>(
                    <div key={i} className="rc" onClick={()=>copyOpener(o.text,i)}
                      style={{background:C.surface,border:`1px solid ${copiedOpener===i?"rgba(201,103,125,.5)":C.border}`,borderRadius:10,padding:"13px 15px",position:"relative",boxShadow:copiedOpener===i?"0 0 18px rgba(201,103,125,.15)":"none"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:C.rose,opacity:.7}}>{o.style?.toUpperCase()}</span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,color:copiedOpener===i?C.rose:C.muted,transition:"color .2s"}}>{copiedOpener===i?"✓ KOPIERT":"COPY"}</span>
                      </div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:15,lineHeight:1.65,color:C.text,marginBottom:6,fontWeight:500}}>{o.text}</div>
                      {o.warum&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(201,103,125,.45)",fontStyle:"italic"}}>💡 {o.warum}</div>}
                    </div>
                  ))}
                </div>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                  <InfoCard icon="💡" label="PROFIL-TIPP" borderColor={C.green} C={C}><Body C={C}>{openerResult.profilTipp}</Body></InfoCard>
                  <InfoCard icon="🚫" label="VERMEIDEN" borderColor={C.red} C={C}><Body C={C}>{openerResult.vermeiden}</Body></InfoCard>
                </div>

                <div style={{textAlign:"center"}}>
                  <button onClick={()=>{setProfileImgs([]);setProfileNote("");setOpenerResult(null);setOpenerLang("auto");}}
                    style={{background:"rgba(201,103,125,.07)",border:`1px solid rgba(201,103,125,.18)`,color:"rgba(201,103,125,.5)",padding:"7px 20px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,borderRadius:20}}>
                    🔄 NEUES PROFIL
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ ANALYSE TAB ══ */}
        {tab==="analyze"&&(
          <div style={{animation:"fadeUp .35s ease"}}>
            <SectionTitle icon="⚔" title="CHAT-ANALYSE" subtitle="Screenshot hochladen → KI erkennt Sprache automatisch → Antworten in der Sprache des Chats" C={C}/>

            <div className="dz"
              style={{background:chatDrag?"rgba(201,103,125,.07)":"rgba(255,255,255,.02)",border:`1px solid ${chatDrag?"rgba(201,103,125,.5)":C.border}`,borderRadius:12,padding:chatImg?0:"38px 22px",textAlign:"center",cursor:chatImg?"default":"pointer",marginBottom:18,overflow:"hidden"}}
              onClick={()=>!chatImg&&chatRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setChatDrag(true);}}
              onDragLeave={()=>setChatDrag(false)}
              onDrop={onChatDrop}>
              {chatImg?(
                <div style={{position:"relative"}}>
                  <img src={chatImg.dataUrl} alt="" style={{width:"100%",maxHeight:280,objectFit:"cover",display:"block"}}/>
                  <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(14,10,15,.65) 0%,transparent 40%)"}}/>
                  <div style={{position:"absolute",bottom:11,left:13,right:13,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:C.rose2}}>✓ BEREIT ZUR ANALYSE</span>
                    <button onClick={e=>{e.stopPropagation();setChatImg(null);setChatResult(null);setFeedback(null);setCurrentId(null);}}
                      style={{background:"rgba(0,0,0,.75)",border:`1px solid rgba(201,103,125,.28)`,color:C.rose2,padding:"4px 10px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,borderRadius:4}}>ÄNDERN</button>
                  </div>
                </div>
              ):(
                <>
                  <div style={{fontSize:24,marginBottom:8,opacity:.4}}>📸</div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:2,color:C.rose2,marginBottom:3}}>Chat-Screenshot einwerfen</div>
                  <div style={{fontFamily:"'Lato',sans-serif",color:C.muted,fontSize:11}}>Drag & Drop oder <span style={{color:C.rose}}>auswählen</span></div>
                </>
              )}
            </div>
            <input ref={chatRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleChatFile(e.target.files[0])}/>

            <RoseGoldButton onClick={analyzeChat} disabled={!chatImg||analyzing} C={C}>
              {analyzing?"✨  ANALYSIERE CHAT…":"⚔  TIEFENANALYSE STARTEN"}
            </RoseGoldButton>

            {analyzing&&<Loader text="COMMUNITY-DATEN LADEN · KI ANALYSIERT…" C={C}/>}
            {chatErr&&<ErrBox C={C}>{chatErr}</ErrBox>}

            {chatResult&&(
              <div style={{animation:"fadeUp .42s ease"}}>
                {chatResult.detectedLanguage&&(
                  <div style={{background:"rgba(201,103,125,.05)",border:`1px solid rgba(201,103,125,.18)`,borderRadius:8,padding:"8px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:14}}>🌍</span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(201,103,125,.45)"}}>ERKANNTE SPRACHE · </span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:11,color:C.rose2,fontWeight:700}}>{chatResult.detectedLanguage}</span>
                  </div>
                )}

                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  <ScoreCard label="VIBE SCORE" value={chatResult.vibeScore} color={C.gold} C={C}/>
                  <ScoreCard label="DYNAMIK" value={chatResult.dynamik} color={POWER_COLORS[chatResult.dynamik]||C.gold} C={C} right/>
                </div>

                <InfoCard icon="🔍" label="ANALYSE" borderColor={C.gold} C={C}><Body C={C}>{chatResult.kurzanalyse}</Body></InfoCard>

                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  <InfoCard icon="✅" label="STÄRKEN" borderColor={C.green} C={C} small>
                    {(chatResult.staerken||[]).map((s,i)=><Small key={i} C={C}>· {s}</Small>)}
                  </InfoCard>
                  <InfoCard icon="⚡" label="VERBESSERN" borderColor="#e67e22" C={C} small>
                    {(chatResult.verbesserungen||[]).map((v,i)=><Small key={i} C={C}>· {v}</Small>)}
                  </InfoCard>
                </div>

                <InfoCard icon="🧠" label="PSYCHO-INSIGHT" borderColor="#9b59b6" C={C}><Body C={C}>{chatResult.psychoInsight}</Body></InfoCard>
                <InfoCard icon="🎯" label="NÄCHSTER SCHRITT" borderColor={C.rose} C={C}>
                  <div style={{fontFamily:"'Lato',sans-serif",color:C.rose2,fontSize:13,fontWeight:700,lineHeight:1.7}}>{chatResult.naechsterSchritt}</div>
                </InfoCard>

                <div style={{background:`rgba(139,105,20,.08)`,border:`1px solid rgba(212,175,55,.14)`,borderLeft:`2px solid ${C.gold2}`,borderRadius:8,padding:"9px 13px",marginBottom:10}}>
                  <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.4)"}}>⚔ PRINZIP · </span>
                  <span style={{fontFamily:"'Lato',sans-serif",fontSize:12,color:"rgba(240,232,236,.6)",fontStyle:"italic"}}>{chatResult.prinzip}</span>
                </div>

                <SLabel C={C}>ANTWORTEN IN {chatResult.detectedLanguage?.toUpperCase()||"CHAT-SPRACHE"} — ANTIPPEN</SLabel>
                <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14}}>
                  {chatResult.replies?.map((r,i)=>(
                    <div key={i} className="rc" onClick={()=>copyReply(r.text,i,r.label)}
                      style={{background:C.surface,border:`1px solid ${copiedIdx===i?"rgba(201,103,125,.45)":C.border}`,borderRadius:10,padding:"12px 14px",position:"relative",boxShadow:copiedIdx===i?"0 0 16px rgba(201,103,125,.12)":"none"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:C.rose,opacity:.6}}>{r.label?.toUpperCase()}</span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,color:copiedIdx===i?C.rose:C.muted,transition:"color .2s"}}>{copiedIdx===i?"✓ KOPIERT":"COPY"}</span>
                      </div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:14,lineHeight:1.65,color:C.text,marginBottom:5}}>{r.text}</div>
                      {r.warum&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(201,103,125,.4)",fontStyle:"italic"}}>💡 {r.warum}</div>}
                    </div>
                  ))}
                </div>

                {/* Feedback */}
                <div style={{background:"rgba(201,103,125,.04)",border:`1px solid rgba(201,103,125,.18)`,borderRadius:10,padding:"14px"}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(201,103,125,.45)",marginBottom:3,textAlign:"center"}}>🌐 COMMUNITY FEEDBACK</div>
                  <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:C.muted,textAlign:"center",marginBottom:12}}>Dein Feedback verbessert die App für alle Bruderschafts-Mitglieder</div>
                  {!feedback?(
                    <div style={{display:"flex",gap:7,justifyContent:"center",flexWrap:"wrap"}}>
                      {[["worked","✅  Hat geklappt!","rgba(92,184,122,.12)","rgba(92,184,122,.35)"],
                        ["mixed","➡️  Teils teils","rgba(230,126,34,.12)","rgba(230,126,34,.35)"],
                        ["failed","❌  Nicht geklappt","rgba(224,92,106,.12)","rgba(224,92,106,.35)"]].map(([type,label,bg,border])=>(
                        <button key={type} className="fb" onClick={()=>markFeedback(type)}
                          style={{background:bg,border:`1px solid ${border}`,color:C.text,padding:"9px 16px",cursor:"pointer",borderRadius:20,fontFamily:"'Lato',sans-serif",fontSize:11,fontWeight:700}}>{label}</button>
                      ))}
                    </div>
                  ):(
                    <div style={{textAlign:"center",fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2,color:C.rose2}}>
                      {feedback==="worked"?"✅  Gespeichert – Community lernt daraus!":feedback==="mixed"?"➡️  Notiert.":"❌  Wichtiges Signal – nächste Analyse wird besser."}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ COMMUNITY TAB ══ */}
        {tab==="community"&&(
          <div style={{animation:"fadeUp .3s ease"}}>
            <SectionTitle icon="🌐" title="COMMUNITY STATS" subtitle="Gesammelte Erkenntnisse aus allen Analysen der Bruderschaft" C={C}/>
            {commStats&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:12}}>
                  {[[commStats.total,"Analysen",C.gold],[commStats.worked,"Erfolge",C.green],[commStats.rate+"%","Erfolgsrate",C.rose]].map(([v,l,col])=>(
                    <div key={l} style={{background:`rgba(201,103,125,.04)`,border:`1px solid rgba(201,103,125,.15)`,borderRadius:10,padding:"13px 8px",textAlign:"center"}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:900,color:col,marginBottom:2}}>{v}</div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:8,color:C.muted,letterSpacing:1}}>{l.toUpperCase()}</div>
                    </div>
                  ))}
                </div>
                {commStats.bestTone&&(
                  <div style={{background:"rgba(212,175,55,.05)",border:`1px solid rgba(212,175,55,.18)`,borderRadius:8,padding:"10px 14px",marginBottom:14,textAlign:"center"}}>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.4)"}}>🏆 ERFOLGREICHSTER STIL · </span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:11,color:C.gold,fontWeight:700}}>{commStats.bestTone.toUpperCase()}</span>
                  </div>
                )}
              </>
            )}
            {loadingComm?<Loader text="LADE COMMUNITY-DATEN…" C={C}/>:(
              commInsights.map((ins,i)=>(
                <div key={ins.id||i} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`2px solid ${C.rose}`,borderRadius:8,padding:"11px 14px",marginBottom:8}}>
                  <Body C={C}>{ins.insight}</Body>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    {ins.category&&<Small C={C}>{ins.category.toUpperCase()}</Small>}
                    <Small C={C}>👍 {ins.upvotes}</Small>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ══ HISTORY TAB ══ */}
        {tab==="history"&&(
          <div style={{animation:"fadeUp .3s ease"}}>
            <SectionTitle icon="📊" title="MEIN VERLAUF" subtitle="Deine persönliche Analyse-Geschichte" C={C}/>
            {loadingHist?<Loader text="LADE…" C={C}/>:myHistory.length===0?(
              <div style={{textAlign:"center",padding:"36px 0",color:C.muted,fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3}}>NOCH KEINE ANALYSEN</div>
            ):myHistory.map((s,i)=>(
              <div key={s.id||i} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",marginBottom:7,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:C.gold,marginBottom:2}}>{s.vibe_score} · {s.dynamik}</div>
                  <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:C.muted}}>
                    {new Date(s.created_at).toLocaleDateString("de-DE")} · {s.tone}{s.situation?` · ${s.situation}`:""}
                  </div>
                  {s.used_label&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:"rgba(201,103,125,.4)",marginTop:1}}>Genutzt: {s.used_label}</div>}
                </div>
                <div style={{fontSize:16}}>{s.feedback_type==="worked"?"✅":s.feedback_type==="failed"?"❌":s.feedback_type==="mixed"?"➡️":"⏳"}</div>
              </div>
            ))}
          </div>
        )}

        {/* ══ TIPS TAB ══ */}
        {tab==="tips"&&(
          <div style={{animation:"fadeUp .3s ease"}}>
            <SectionTitle icon="💡" title="KOMMUNIKATIONS-PRINZIPIEN" subtitle="Was wirklich funktioniert – basierend auf Psychologie und Community-Daten" C={C}/>
            {[
              ["⚡","Kürze erzeugt Spannung","Weniger schreiben als sie. 5 Sätze → 2. Leere erzeugt Neugier.","Reaktanz-Theorie: Menschen wollen mehr von dem was sie nicht vollständig haben."],
              ["💬","Opener: Spezifisch statt generisch","Beziehe dich konkret auf ihr Profil. 'Wow schön' geht nie.","Spezifität unterscheidet dich von 90% der Männer."],
              ["😄","Humor der verbindet","Selbstironie und gemeinsames Lachen. Nie auf ihre Kosten.","Lachen baut Oxytocin auf – denselben Stoff wie Umarmungen."],
              ["🎯","Konkret statt vage","Nicht 'treffen wir uns' – 'Dienstag 19 Uhr, Café XY'.","Konkrete Einladungen zeigen Selbstsicherheit."],
              ["🌍","Sprich ihre Sprache","Antworte in der Sprache in der sie schreibt.","Sprachliche Anpassung baut unbewusst Vertrauen auf."],
              ["⏰","Timing ist alles","20-60 Min. Abstand zeigt: du hast ein Leben.","Konstante Sofortantworten senken deinen wahrgenommenen Wert."],
              ["🔍","Echtes Interesse schlägt alles","Frag konkret nach etwas das sie gesagt hat.","Menschen spüren sofort ob Interesse echt oder performt ist."],
              ["🚀","Der Move zur richtigen Zeit","Wenn der Vibe stimmt: Mach den Move. Zögern tötet Momentum.","Entschlossenheit ist attraktiv."],
            ].map(([icon,title,desc,science])=>(
              <div key={title} style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`2px solid ${C.rose}`,borderRadius:8,padding:"12px 14px",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
                  <span style={{fontSize:15}}>{icon}</span>
                  <span style={{fontFamily:"'Cinzel',serif",fontSize:9,fontWeight:700,color:C.rose2,letterSpacing:1}}>{title}</span>
                </div>
                <Body C={C}>{desc}</Body>
                <Small C={C}>🔬 {science}</Small>
              </div>
            ))}
          </div>
        )}

        <div style={{textAlign:"center",marginTop:28,fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:5,color:"rgba(201,103,125,.15)"}}>
          MANPOWER BRUDERSCHAFT · {localMem.totalAnalyses||0} ANALYSEN · {localMem.totalOpeners||0} OPENER
        </div>
      </div>
    </div>
  );
}

// ─── HELPER COMPONENTS ───────────────────────────────────────────────────────
function StatBadge({val,label,color}){return(<div style={{textAlign:"center"}}><span style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:900,color}}>{val}</span><span style={{fontFamily:"'Lato',sans-serif",fontSize:7,color:"rgba(240,232,236,.3)",letterSpacing:1,marginLeft:4}}>{label.toUpperCase()}</span></div>);}

function SectionTitle({icon,title,subtitle,C}){return(
  <div style={{marginBottom:18}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
      <span style={{fontSize:16}}>{icon}</span>
      <span style={{fontFamily:"'Cinzel',serif",fontSize:12,fontWeight:700,color:C.rose2,letterSpacing:2}}>{title}</span>
    </div>
    <div style={{fontFamily:"'Lato',sans-serif",fontSize:11,color:C.muted,lineHeight:1.6,paddingLeft:24}}>{subtitle}</div>
    <div style={{height:1,background:`linear-gradient(90deg,rgba(201,103,125,.3),rgba(212,175,55,.2),transparent)`,marginTop:10}}/>
  </div>
);}

function SLabel({children,C,style}){return <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(201,103,125,.4)",marginBottom:9,textTransform:"uppercase",...style}}>{children}</div>;}

function RoseGoldButton({children,onClick,disabled,C}){return(
  <button className="gb" onClick={onClick} disabled={disabled}
    style={{width:"100%",background:disabled?"rgba(201,103,125,.07)":"linear-gradient(135deg,#8B6914 0%,#c9677d 30%,#D4AF37 50%,#c9677d 70%,#8B6914 100%)",backgroundSize:"200% auto",border:"none",borderRadius:10,padding:"15px",color:disabled?"rgba(201,103,125,.25)":"#fff",fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:11,letterSpacing:4,cursor:disabled?"not-allowed":"pointer",marginBottom:18,animation:disabled?"none":"shimmer 3s linear infinite",boxShadow:disabled?"none":"0 4px 20px rgba(201,103,125,.3)",textShadow:disabled?"none":"0 1px 3px rgba(0,0,0,.4)"}}>
    {children}
  </button>
);}

function InfoCard({icon,label,borderColor,children,small,C}){return(
  <div style={{background:C.surface,border:`1px solid ${C.border}`,borderLeft:`3px solid ${borderColor||C.gold}`,borderRadius:8,padding:small?"10px 12px":"12px 14px",marginBottom:9}}>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(201,103,125,.4)",marginBottom:small?5:8}}>{icon} {label}</div>
    {children}
  </div>
);}

function ScoreCard({label,value,color,C,right}){return(
  <div style={{flex:1,background:"rgba(201,103,125,.04)",border:`1px solid rgba(201,103,125,.15)`,borderRadius:8,padding:"13px 14px",textAlign:right?"right":"left"}}>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(201,103,125,.38)",marginBottom:4}}>{label}</div>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:900,color,textShadow:`0 0 14px ${color}44`}}>{value}</div>
  </div>
);}

function Body({children,C}){return <p style={{fontFamily:"'Lato',sans-serif",color:"rgba(240,232,236,.7)",fontSize:13,lineHeight:1.75,margin:"0 0 3px"}}>{children}</p>;}
function Small({children,C}){return <p style={{fontFamily:"'Lato',sans-serif",color:"rgba(240,232,236,.35)",fontSize:10,lineHeight:1.5,margin:"1px 0 2px",fontStyle:"italic"}}>{children}</p>;}
function Loader({text,C}){return(<div style={{textAlign:"center",padding:"20px 0"}}><div style={{width:34,height:34,margin:"0 auto 10px",border:"2px solid rgba(201,103,125,.12)",borderTopColor:"#c9677d",borderRadius:"50%",animation:"spin 1s linear infinite"}}/><div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(201,103,125,.38)",animation:"pulse 1.5s ease infinite"}}>{text}</div></div>);}
function ErrBox({children,C}){return <div style={{background:"rgba(224,92,106,.08)",border:"1px solid rgba(224,92,106,.24)",borderRadius:8,padding:"10px 14px",color:"#ff8a95",fontFamily:"'Lato',sans-serif",fontSize:12,marginBottom:14}}>{children}</div>;}
