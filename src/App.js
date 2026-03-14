import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./supabaseClient";

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
const POWER_COLORS = { STARK:"#D4AF37", AUSGEWOGEN:"#c9a96e", SCHWACH:"#c0856a" };
const STORAGE_KEY = "mp_local_v4";
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

// Glass morphism card
const G = {
  card:     { background:"rgba(6,4,2,0.72)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", border:"1px solid rgba(212,175,55,.2)", borderRadius:12 },
  cardRose: { background:"rgba(6,4,2,0.72)", backdropFilter:"blur(20px)", WebkitBackdropFilter:"blur(20px)", border:"1px solid rgba(201,103,125,.22)", borderRadius:12 },
  gold:     "#D4AF37",
  gold2:    "#8B6914",
  gold3:    "#F5E27A",
  rose:     "#c9677d",
  rose2:    "#e8a0b0",
  text:     "#f5ede8",
  muted:    "rgba(245,237,232,.4)",
  green:    "#5cb87a",
  red:      "#e05c6a",
};

export default function App({ user, onLogout }) {
  const isAdmin = user?.username?.toLowerCase() === ADMIN_USERNAME;
  const [tab,          setTab]          = useState("opener");
  const [tone,         setTone]         = useState("charming");
  const [localMem,     setLocalMem]     = useState(loadLocal);
  const [apiKey,       setApiKey]       = useState(()=>localStorage.getItem("mp_api_key")||"");
  const [showKey,      setShowKey]      = useState(false);
  const [profileImgs,  setProfileImgs]  = useState([]);
  const [profileNote,  setProfileNote]  = useState("");
  const [openerLang,   setOpenerLang]   = useState("auto");
  const [genOpener,    setGenOpener]    = useState(false);
  const [openerResult, setOpenerResult] = useState(null);
  const [openerErr,    setOpenerErr]    = useState(null);
  const [openerDrag,   setOpenerDrag]   = useState(false);
  const [copiedOpener, setCopiedOpener] = useState(null);
  const profileRef = useRef();
  const [chatImg,      setChatImg]      = useState(null);
  const [analyzing,    setAnalyzing]    = useState(false);
  const [chatResult,   setChatResult]   = useState(null);
  const [chatErr,      setChatErr]      = useState(null);
  const [chatDrag,     setChatDrag]     = useState(false);
  const [feedback,     setFeedback]     = useState(null);
  const [currentId,    setCurrentId]    = useState(null);
  const [copiedIdx,    setCopiedIdx]    = useState(null);
  const chatRef = useRef();
  const [commStats,    setCommStats]    = useState(null);
  const [commInsights, setCommInsights] = useState([]);
  const [loadingComm,  setLoadingComm]  = useState(false);
  const [myHistory,    setMyHistory]    = useState([]);
  const [loadingHist,  setLoadingHist]  = useState(false);

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
    if(bestTone) ctx+=`Erfolgreichster Stil: ${bestTone}\n`;
    return ctx;
  };

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
Analysiere die Bilder/Beschreibung und generiere 5 personalisierte erste Nachrichten.
${profileNote?`Infos: ${profileNote}`:""}
SPRACHE: ${LANG_LABELS[openerLang]||LANG_LABELS.auto}
Ton: ${TONE_DE[tone]}
Nur valides JSON:
{"detectedLanguage":"...","profileAnalysis":"...","openers":[{"style":"Humor","text":"...","warum":"..."},{"style":"Direkt","text":"...","warum":"..."},{"style":"Neugier","text":"...","warum":"..."},{"style":"Interesse","text":"...","warum":"..."},{"style":"Witzig","text":"...","warum":"..."}],"profilTipp":"...","vermeiden":"..."}`});
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
    if(!chatImg||!apiKey.trim()) return;
    setAnalyzing(true); setChatResult(null); setChatErr(null); setFeedback(null); setCurrentId(null);
    const commCtx=await buildCommCtx();
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey.trim(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-opus-4-5",max_tokens:1500,
        system:`Du bist der Chat-Coach der Manpower Bruderschaft. Farbige Blase=Nutzer, graue=sie. Analyse auf Deutsch, Antworten in Chat-Sprache. ${commCtx}
Nur JSON: {"detectedLanguage":"...","vibeScore":"7.5/10","dynamik":"STARK|AUSGEWOGEN|SCHWACH","kurzanalyse":"...","staerken":["..."],"verbesserungen":["..."],"psychoInsight":"...","naechsterSchritt":"...","replies":[{"label":"Selbstsicher","text":"...","warum":"..."},{"label":"Charmant","text":"...","warum":"..."},{"label":"Witzig","text":"...","warum":"..."}],"prinzip":"...","situation":"..."}`,
        messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:chatImg.mediaType,data:chatImg.base64}},{type:"text",text:`Analysiere. Ton: ${TONE_DE[tone]}. Nur JSON.`}]}]})});
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

  return (
    <div style={{minHeight:"100vh",color:G.text,fontFamily:"Georgia,serif",overflowX:"hidden",position:"relative"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Lato:wght@300;400;700&display=swap');
        @keyframes spin    {to{transform:rotate(360deg)}}
        @keyframes shimmer {0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes fadeUp  {from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse   {0%,100%{opacity:.35}50%{opacity:1}}
        @keyframes glow    {0%,100%{box-shadow:0 0 12px rgba(212,175,55,.25)}50%{box-shadow:0 0 32px rgba(212,175,55,.6)}}
        @keyframes heartbeat{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
        *{box-sizing:border-box;}
        .gb:not(:disabled):hover{transform:translateY(-3px)!important;filter:brightness(1.12);}
        .gb{transition:all .25s!important;}
        .rc{transition:all .22s;cursor:pointer;}
        .rc:hover{border-color:rgba(212,175,55,.6)!important;transform:translateX(4px);background:rgba(212,175,55,.08)!important;}
        .tp{transition:all .2s;cursor:pointer;}
        .tp:hover{border-color:rgba(212,175,55,.5)!important;}
        .dz{transition:all .25s;cursor:pointer;}
        .dz:hover{border-color:rgba(212,175,55,.5)!important;}
        .fb{transition:all .18s;cursor:pointer;}
        .fb:hover{transform:scale(1.05);}
        .tabpill{transition:all .2s;cursor:pointer;}
        .tabpill:hover{color:#D4AF37!important;}
        input,textarea{outline:none;}
        ::placeholder{color:rgba(245,237,232,.2);}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:linear-gradient(#D4AF37,#c9677d);border-radius:2px;}
      `}</style>

      {/* ── BACKGROUND IMAGE with overlay ── */}
      <div style={{
        position:"fixed", inset:0, zIndex:0,
        backgroundImage:"url('/bg.jpg')",
        backgroundSize:"cover",
        backgroundPosition:"center top",
        backgroundAttachment:"fixed",
      }}/>
      {/* Dark overlay to keep readability */}
      <div style={{
        position:"fixed", inset:0, zIndex:1,
        background:"linear-gradient(to bottom, rgba(4,2,1,0.78) 0%, rgba(4,2,1,0.72) 40%, rgba(4,2,1,0.82) 100%)",
      }}/>
      {/* Gold vignette top */}
      <div style={{
        position:"fixed", inset:0, zIndex:2,
        background:"radial-gradient(ellipse 100% 30% at 50% 0%, rgba(212,175,55,.08) 0%, transparent 60%)",
        pointerEvents:"none",
      }}/>

      {/* ── CONTENT ── */}
      <div style={{position:"relative",zIndex:3,maxWidth:820,margin:"0 auto",padding:"0 15px 80px"}}>

        {/* HEADER */}
        <header style={{textAlign:"center",padding:"32px 0 22px",marginBottom:20,position:"relative"}}>
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:1,background:"linear-gradient(90deg,transparent,rgba(212,175,55,.3),rgba(201,103,125,.2),rgba(212,175,55,.3),transparent)"}}/>

          {/* M Logo */}
          <div style={{width:66,height:66,margin:"0 auto 12px",position:"relative"}}>
            <div style={{width:"100%",height:"100%",border:"2px solid",borderColor:G.gold,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(4,2,1,0.6)",backdropFilter:"blur(10px)",animation:"glow 4s ease infinite"}}>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:25,fontWeight:900,background:`linear-gradient(135deg,${G.gold3},${G.gold},${G.rose2})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>M</span>
            </div>
            <div style={{position:"absolute",top:-2,right:-2,width:10,height:10,background:G.rose,borderRadius:"50%",border:"2px solid rgba(4,2,1,.8)",animation:"heartbeat 2s ease infinite"}}/>
          </div>

          <div style={{fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:"clamp(20px,4vw,34px)",letterSpacing:7,background:`linear-gradient(90deg,${G.gold2},${G.gold},${G.gold3},${G.rose2},${G.gold3},${G.gold},${G.gold2})`,backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",animation:"shimmer 5s linear infinite",marginBottom:3}}>MANPOWER</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:9,color:"rgba(212,175,55,.55)",marginBottom:14}}>BRUDERSCHAFT · DATE COACH</div>

          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,flexWrap:"wrap"}}>
            <SB val={localMem.totalAnalyses||0} label="Analysen" color={G.gold}/>
            <div style={{width:1,height:16,background:"rgba(212,175,55,.2)"}}/>
            <SB val={localMem.totalOpeners||0} label="Opener" color={G.rose}/>
            <div style={{width:1,height:16,background:"rgba(212,175,55,.2)"}}/>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2,color:"rgba(212,175,55,.45)"}}>
              {isAdmin?"👑":"👤"} {user?.username?.toUpperCase()}
            </span>
            <button onClick={onLogout} style={{...G.card,background:"rgba(4,2,1,0.6)",color:"rgba(212,175,55,.45)",padding:"3px 12px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,border:"1px solid rgba(212,175,55,.18)",transition:"all .2s"}}>LOGOUT</button>
          </div>
        </header>

        {/* ADMIN API KEY */}
        {isAdmin && (
          <div style={{...G.card,padding:"12px 15px",marginBottom:18,borderColor:"rgba(212,175,55,.25)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
              <span style={{fontSize:11}}>👑</span>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.5)"}}>ADMIN · ANTHROPIC API KEY</span>
            </div>
            <div style={{display:"flex",gap:7}}>
              <input type={showKey?"text":"password"} placeholder="sk-ant-..." value={apiKey} onChange={e=>saveKey(e.target.value)}
                style={{flex:1,background:"rgba(0,0,0,.5)",border:"1px solid rgba(212,175,55,.15)",borderRadius:6,padding:"8px 12px",color:G.text,fontFamily:"'Lato',sans-serif",fontSize:13}}/>
              <button onClick={()=>setShowKey(s=>!s)} style={{background:"rgba(212,175,55,.08)",border:"1px solid rgba(212,175,55,.18)",color:G.gold,padding:"8px 12px",cursor:"pointer",borderRadius:6,fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:1}}>{showKey?"HIDE":"SHOW"}</button>
            </div>
            <div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:"rgba(212,175,55,.25)",marginTop:5}}>Nur für Admins sichtbar · console.anthropic.com → API Keys</div>
          </div>
        )}

        {/* TONE */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7,marginBottom:18}}>
          {TONES.map(t=>(
            <div key={t.key} className="tp" onClick={()=>setTone(t.key)}
              style={{...G.card,padding:"11px 5px",textAlign:"center",borderColor:tone===t.key?"rgba(212,175,55,.5)":"rgba(212,175,55,.12)",background:tone===t.key?"rgba(212,175,55,.12)":"rgba(6,4,2,0.65)",boxShadow:tone===t.key?"0 0 20px rgba(212,175,55,.2)":"none"}}>
              <div style={{fontSize:17,marginBottom:3}}>{t.emoji}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:1.5,color:tone===t.key?G.gold:G.muted}}>{t.label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{...G.card,display:"flex",gap:0,marginBottom:20,padding:"0 4px",overflowX:"auto",borderRadius:10}}>
          {TABS.map(([key,label])=>(
            <div key={key} className="tabpill" onClick={()=>setTab(key)}
              style={{padding:"10px 13px",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1.5,whiteSpace:"nowrap",color:tab===key?G.gold:G.muted,borderBottom:tab===key?`2px solid ${G.gold}`:"2px solid transparent",marginBottom:-1,flex:1,textAlign:"center"}}>
              {label}
            </div>
          ))}
        </div>

        {/* ══ OPENER ══ */}
        {tab==="opener"&&(
          <div style={{animation:"fadeUp .35s ease"}}>
            <SecTitle icon="💬" title="OPENER GENERATOR" sub="Profilbilder hochladen → KI generiert 5 erste Nachrichten in ihrer Sprache"/>

            <SL>🌍 SPRACHE</SL>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14}}>
              {LANGS.map(([k,l])=>(
                <div key={k} className="tp" onClick={()=>setOpenerLang(k)}
                  style={{...G.card,padding:"4px 11px",borderRadius:20,fontFamily:"'Lato',sans-serif",fontSize:11,color:openerLang===k?G.gold:G.muted,borderColor:openerLang===k?"rgba(212,175,55,.45)":"rgba(212,175,55,.12)",background:openerLang===k?"rgba(212,175,55,.1)":"rgba(6,4,2,.65)"}}>
                  {l}
                </div>
              ))}
            </div>

            <SL>📸 PROFILBILDER (bis zu 5)</SL>
            <div className="dz"
              style={{...G.card,padding:"24px 20px",textAlign:"center",marginBottom:10,borderColor:openerDrag?"rgba(212,175,55,.5)":"rgba(212,175,55,.15)",borderStyle:"dashed"}}
              onClick={()=>profileRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setOpenerDrag(true);}}
              onDragLeave={()=>setOpenerDrag(false)}
              onDrop={onProfileDrop}>
              <div style={{fontSize:24,marginBottom:7,opacity:.5}}>📸</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:2,color:G.gold,marginBottom:3}}>Profilbilder einwerfen</div>
              <div style={{fontFamily:"'Lato',sans-serif",color:G.muted,fontSize:11}}>Bio · Fotos · Hobbys – alles hilft der KI</div>
            </div>
            <input ref={profileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={async e=>await handleProfileFiles(e.target.files)}/>

            {profileImgs.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5,marginBottom:12}}>
                {profileImgs.map((img,i)=>(
                  <div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",border:"1px solid rgba(212,175,55,.2)"}}>
                    <img src={img.dataUrl} alt="" style={{width:"100%",height:68,objectFit:"cover",display:"block"}}/>
                    <button onClick={()=>setProfileImgs(prev=>prev.filter((_,j)=>j!==i))}
                      style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.8)",border:"none",color:"#ff7b7b",width:18,height:18,borderRadius:"50%",cursor:"pointer",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                  </div>
                ))}
                {profileImgs.length<5&&<div className="dz" onClick={()=>profileRef.current?.click()} style={{height:68,border:"1px dashed rgba(212,175,55,.2)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(212,175,55,.3)",fontSize:20,cursor:"pointer"}}>+</div>}
              </div>
            )}

            <SL>✍️ PROFIL BESCHREIBEN (optional)</SL>
            <textarea value={profileNote} onChange={e=>setProfileNote(e.target.value)}
              placeholder="z.B. Sie ist 26, Ärztin, liebt Reisen. Bio: 'Kaffee > Menschen'. Foto in Thailand."
              rows={3} style={{...G.card,width:"100%",padding:"10px 13px",color:G.text,fontFamily:"'Lato',sans-serif",fontSize:13,resize:"vertical",lineHeight:1.6,marginBottom:16,borderColor:"rgba(212,175,55,.15)"}}/>

            <GoldBtn onClick={generateOpener} disabled={genOpener}>
              {genOpener?"✨  GENERIERE OPENER…":"💬  OPENER GENERIEREN"}
            </GoldBtn>

            {genOpener&&<Spinner text="KI ANALYSIERT PROFIL…"/>}
            {openerErr&&<Err>{openerErr}</Err>}

            {openerResult&&(
              <div style={{animation:"fadeUp .4s ease"}}>
                <GCard icon="🌍" label="ERKANNTE SPRACHE" bl={G.rose}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:700,color:G.rose}}>{openerResult.detectedLanguage}</div>
                </GCard>
                <GCard icon="🔍" label="PROFIL-ANALYSE" bl={G.gold}><Body>{openerResult.profileAnalysis}</Body></GCard>

                <SL>💬 OPENER – ANTIPPEN ZUM KOPIEREN</SL>
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
                  {openerResult.openers?.map((o,i)=>(
                    <div key={i} className="rc" onClick={()=>copyOpener(o.text,i)}
                      style={{...G.card,padding:"13px 15px",borderColor:copiedOpener===i?"rgba(212,175,55,.5)":"rgba(212,175,55,.15)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:G.gold,opacity:.7}}>{o.style?.toUpperCase()}</span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,color:copiedOpener===i?G.gold:G.muted}}>{copiedOpener===i?"✓ KOPIERT":"COPY"}</span>
                      </div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:15,lineHeight:1.65,color:G.text,marginBottom:5,fontWeight:500}}>{o.text}</div>
                      {o.warum&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(212,175,55,.4)",fontStyle:"italic"}}>💡 {o.warum}</div>}
                    </div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                  <GCard icon="💡" label="PROFIL-TIPP" bl={G.green}><Body>{openerResult.profilTipp}</Body></GCard>
                  <GCard icon="🚫" label="VERMEIDEN" bl={G.red}><Body>{openerResult.vermeiden}</Body></GCard>
                </div>
                <div style={{textAlign:"center"}}>
                  <button onClick={()=>{setProfileImgs([]);setProfileNote("");setOpenerResult(null);setOpenerLang("auto");}}
                    style={{...G.card,background:"rgba(6,4,2,.65)",color:G.muted,padding:"7px 20px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,borderRadius:20,border:"1px solid rgba(212,175,55,.15)"}}>
                    🔄 NEUES PROFIL
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ ANALYSE ══ */}
        {tab==="analyze"&&(
          <div style={{animation:"fadeUp .35s ease"}}>
            <SecTitle icon="⚔" title="CHAT-ANALYSE" sub="Screenshot hochladen → KI erkennt Sprache → Antworten in Chat-Sprache"/>

            <div className="dz"
              style={{...G.card,padding:chatImg?0:"38px 22px",textAlign:"center",cursor:chatImg?"default":"pointer",marginBottom:18,overflow:"hidden",borderColor:chatDrag?"rgba(212,175,55,.5)":"rgba(212,175,55,.15)"}}
              onClick={()=>!chatImg&&chatRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setChatDrag(true);}}
              onDragLeave={()=>setChatDrag(false)}
              onDrop={onChatDrop}>
              {chatImg?(
                <div style={{position:"relative"}}>
                  <img src={chatImg.dataUrl} alt="" style={{width:"100%",maxHeight:280,objectFit:"cover",display:"block"}}/>
                  <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(4,2,1,.7) 0%,transparent 40%)"}}/>
                  <div style={{position:"absolute",bottom:11,left:13,right:13,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:G.gold}}>✓ BEREIT</span>
                    <button onClick={e=>{e.stopPropagation();setChatImg(null);setChatResult(null);setFeedback(null);}}
                      style={{background:"rgba(0,0,0,.8)",border:"1px solid rgba(212,175,55,.25)",color:G.gold,padding:"3px 9px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,borderRadius:4}}>ÄNDERN</button>
                  </div>
                </div>
              ):(
                <>
                  <div style={{fontSize:24,marginBottom:8,opacity:.45}}>📸</div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:2,color:G.gold,marginBottom:3}}>Chat-Screenshot einwerfen</div>
                  <div style={{fontFamily:"'Lato',sans-serif",color:G.muted,fontSize:11}}>Drag & Drop oder <span style={{color:G.gold}}>auswählen</span></div>
                </>
              )}
            </div>
            <input ref={chatRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleChatFile(e.target.files[0])}/>

            <GoldBtn onClick={analyzeChat} disabled={!chatImg||analyzing}>
              {analyzing?"✨  ANALYSIERE…":"⚔  TIEFENANALYSE STARTEN"}
            </GoldBtn>

            {analyzing&&<Spinner text="COMMUNITY-DATEN · KI ANALYSIERT…"/>}
            {chatErr&&<Err>{chatErr}</Err>}

            {chatResult&&(
              <div style={{animation:"fadeUp .42s ease"}}>
                {chatResult.detectedLanguage&&(
                  <div style={{...G.card,padding:"8px 14px",marginBottom:10,display:"flex",alignItems:"center",gap:8,borderColor:"rgba(212,175,55,.2)"}}>
                    <span>🌍</span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.45)"}}>SPRACHE · </span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:11,color:G.gold,fontWeight:700}}>{chatResult.detectedLanguage}</span>
                  </div>
                )}
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  <ScCard label="VIBE SCORE" val={chatResult.vibeScore} color={G.gold}/>
                  <ScCard label="DYNAMIK" val={chatResult.dynamik} color={POWER_COLORS[chatResult.dynamik]||G.gold} right/>
                </div>
                <GCard icon="🔍" label="ANALYSE" bl={G.gold}><Body>{chatResult.kurzanalyse}</Body></GCard>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  <GCard icon="✅" label="STÄRKEN" bl={G.green} small>{(chatResult.staerken||[]).map((s,i)=><Small key={i}>· {s}</Small>)}</GCard>
                  <GCard icon="⚡" label="VERBESSERN" bl="#e67e22" small>{(chatResult.verbesserungen||[]).map((v,i)=><Small key={i}>· {v}</Small>)}</GCard>
                </div>
                <GCard icon="🧠" label="PSYCHO-INSIGHT" bl="#9b59b6"><Body>{chatResult.psychoInsight}</Body></GCard>
                <GCard icon="🎯" label="NÄCHSTER SCHRITT" bl={G.rose}>
                  <div style={{fontFamily:"'Lato',sans-serif",color:G.rose,fontSize:13,fontWeight:700,lineHeight:1.7}}>{chatResult.naechsterSchritt}</div>
                </GCard>
                <div style={{...G.card,padding:"9px 13px",marginBottom:10,borderLeft:`2px solid ${G.gold2}`,borderColor:"rgba(212,175,55,.15)"}}>
                  <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.38)"}}>⚔ PRINZIP · </span>
                  <span style={{fontFamily:"'Lato',sans-serif",fontSize:12,color:"rgba(245,237,232,.58)",fontStyle:"italic"}}>{chatResult.prinzip}</span>
                </div>
                <SL>ANTWORTEN IN {chatResult.detectedLanguage?.toUpperCase()||"CHAT-SPRACHE"}</SL>
                <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:14}}>
                  {chatResult.replies?.map((r,i)=>(
                    <div key={i} className="rc" onClick={()=>copyReply(r.text,i,r.label)}
                      style={{...G.card,padding:"12px 14px",borderColor:copiedIdx===i?"rgba(212,175,55,.45)":"rgba(212,175,55,.13)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:G.gold,opacity:.65}}>{r.label?.toUpperCase()}</span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,color:copiedIdx===i?G.gold:G.muted}}>{copiedIdx===i?"✓ KOPIERT":"COPY"}</span>
                      </div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:14,lineHeight:1.65,color:G.text,marginBottom:5}}>{r.text}</div>
                      {r.warum&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(212,175,55,.38)",fontStyle:"italic"}}>💡 {r.warum}</div>}
                    </div>
                  ))}
                </div>
                <div style={{...G.card,padding:"14px",borderColor:"rgba(212,175,55,.18)"}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.45)",textAlign:"center",marginBottom:3}}>🌐 COMMUNITY FEEDBACK</div>
                  <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:G.muted,textAlign:"center",marginBottom:12}}>Dein Feedback verbessert die App für alle</div>
                  {!feedback?(
                    <div style={{display:"flex",gap:7,justifyContent:"center",flexWrap:"wrap"}}>
                      {[["worked","✅  Hat geklappt!","rgba(92,184,122,.15)","rgba(92,184,122,.4)"],
                        ["mixed","➡️  Teils teils","rgba(230,126,34,.15)","rgba(230,126,34,.4)"],
                        ["failed","❌  Nicht geklappt","rgba(224,92,106,.15)","rgba(224,92,106,.4)"]].map(([type,label,bg,border])=>(
                        <button key={type} className="fb" onClick={()=>markFeedback(type)}
                          style={{background:bg,border:`1px solid ${border}`,color:G.text,padding:"9px 16px",cursor:"pointer",borderRadius:20,fontFamily:"'Lato',sans-serif",fontSize:11,fontWeight:700}}>{label}</button>
                      ))}
                    </div>
                  ):(
                    <div style={{textAlign:"center",fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2,color:G.gold}}>
                      {feedback==="worked"?"✅  Gespeichert!":feedback==="mixed"?"➡️  Notiert.":"❌  Wichtiger Hinweis – nächste Analyse wird besser."}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ COMMUNITY ══ */}
        {tab==="community"&&(
          <div style={{animation:"fadeUp .3s ease"}}>
            <SecTitle icon="🌐" title="COMMUNITY STATS" sub="Gesammelte Erkenntnisse aus allen Analysen der Bruderschaft"/>
            {commStats&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:7,marginBottom:12}}>
                  {[[commStats.total,"Analysen",G.gold],[commStats.worked,"Erfolge",G.green],[commStats.rate+"%","Erfolgsrate",G.rose]].map(([v,l,col])=>(
                    <div key={l} style={{...G.card,padding:"13px 8px",textAlign:"center",borderColor:"rgba(212,175,55,.15)"}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:900,color:col,marginBottom:2}}>{v}</div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:8,color:G.muted,letterSpacing:1}}>{l.toUpperCase()}</div>
                    </div>
                  ))}
                </div>
                {commStats.bestTone&&(
                  <div style={{...G.card,padding:"10px 14px",marginBottom:14,textAlign:"center",borderColor:"rgba(212,175,55,.2)"}}>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.45)"}}>🏆 ERFOLGREICHSTER STIL · </span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:11,color:G.gold,fontWeight:700}}>{commStats.bestTone.toUpperCase()}</span>
                  </div>
                )}
              </>
            )}
            {loadingComm?<Spinner text="LADE…"/>:(
              commInsights.map((ins,i)=>(
                <div key={ins.id||i} style={{...G.card,padding:"11px 14px",marginBottom:8,borderLeft:`2px solid ${G.gold}`,borderColor:"rgba(212,175,55,.13)"}}>
                  <Body>{ins.insight}</Body>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    {ins.category&&<Small>{ins.category.toUpperCase()}</Small>}
                    <Small>👍 {ins.upvotes}</Small>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ══ HISTORY ══ */}
        {tab==="history"&&(
          <div style={{animation:"fadeUp .3s ease"}}>
            <SecTitle icon="📊" title="MEIN VERLAUF" sub="Deine persönliche Analyse-Geschichte"/>
            {loadingHist?<Spinner text="LADE…"/>:myHistory.length===0?(
              <div style={{textAlign:"center",padding:"36px 0",color:G.muted,fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3}}>NOCH KEINE ANALYSEN</div>
            ):myHistory.map((s,i)=>(
              <div key={s.id||i} style={{...G.card,padding:"12px 14px",marginBottom:7,display:"flex",justifyContent:"space-between",alignItems:"center",borderColor:"rgba(212,175,55,.12)"}}>
                <div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:G.gold,marginBottom:2}}>{s.vibe_score} · {s.dynamik}</div>
                  <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:G.muted}}>{new Date(s.created_at).toLocaleDateString("de-DE")} · {s.tone}{s.situation?` · ${s.situation}`:""}</div>
                  {s.used_label&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:"rgba(212,175,55,.4)",marginTop:1}}>Genutzt: {s.used_label}</div>}
                </div>
                <div style={{fontSize:16}}>{s.feedback_type==="worked"?"✅":s.feedback_type==="failed"?"❌":s.feedback_type==="mixed"?"➡️":"⏳"}</div>
              </div>
            ))}
          </div>
        )}

        {/* ══ TIPS ══ */}
        {tab==="tips"&&(
          <div style={{animation:"fadeUp .3s ease"}}>
            <SecTitle icon="💡" title="KOMMUNIKATIONS-PRINZIPIEN" sub="Was wirklich funktioniert – basierend auf Psychologie und Community-Daten"/>
            {[
              ["⚡","Kürze erzeugt Spannung","Weniger schreiben als sie. 5 Sätze → 2. Leere erzeugt Neugier.","Reaktanz-Theorie: Menschen wollen mehr von dem was sie nicht vollständig haben."],
              ["💬","Opener: Spezifisch statt generisch","Beziehe dich konkret auf ihr Profil. 'Wow schön' geht nie.","Spezifität unterscheidet dich von 90% der Männer."],
              ["😄","Humor der verbindet","Selbstironie und gemeinsames Lachen. Nie auf ihre Kosten.","Lachen baut Oxytocin auf – denselben Stoff wie Umarmungen."],
              ["🎯","Konkret statt vage","'Dienstag 19 Uhr, Café XY' statt 'lass uns mal treffen'.","Konkrete Einladungen zeigen Selbstsicherheit."],
              ["🌍","Sprich ihre Sprache","Antworte in der Sprache in der sie schreibt.","Sprachliche Anpassung baut unbewusst Vertrauen auf."],
              ["⏰","Timing ist alles","20-60 Min. Abstand zeigt: du hast ein Leben.","Konstante Sofortantworten senken deinen wahrgenommenen Wert."],
              ["🔍","Echtes Interesse schlägt alles","Frag konkret nach etwas das sie gesagt hat.","Menschen spüren sofort ob Interesse echt oder performt ist."],
              ["🚀","Der Move zur richtigen Zeit","Wenn der Vibe stimmt: Mach den Move. Zögern tötet Momentum.","Entschlossenheit ist attraktiv."],
            ].map(([icon,title,desc,science])=>(
              <div key={title} style={{...G.card,padding:"12px 14px",marginBottom:8,borderLeft:`2px solid ${G.gold}`,borderColor:"rgba(212,175,55,.12)"}}>
                <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
                  <span style={{fontSize:15}}>{icon}</span>
                  <span style={{fontFamily:"'Cinzel',serif",fontSize:9,fontWeight:700,color:G.gold,letterSpacing:1}}>{title}</span>
                </div>
                <Body>{desc}</Body>
                <Small>🔬 {science}</Small>
              </div>
            ))}
          </div>
        )}

        <div style={{textAlign:"center",marginTop:28,fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:5,color:"rgba(212,175,55,.15)"}}>
          MANPOWER BRUDERSCHAFT · {localMem.totalAnalyses||0} ANALYSEN · {localMem.totalOpeners||0} OPENER
        </div>
      </div>
    </div>
  );
}

// ── SHARED COMPONENTS ────────────────────────────────────────────────────────
function SB({val,label,color}){return(<div style={{textAlign:"center"}}><span style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:900,color}}>{val}</span><span style={{fontFamily:"'Lato',sans-serif",fontSize:7,color:"rgba(245,237,232,.3)",letterSpacing:1,marginLeft:4}}>{label.toUpperCase()}</span></div>);}
function SL({children}){return <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.4)",marginBottom:9,textTransform:"uppercase"}}>{children}</div>;}
function SecTitle({icon,title,sub}){return(
  <div style={{marginBottom:18}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
      <span style={{fontSize:16}}>{icon}</span>
      <span style={{fontFamily:"'Cinzel',serif",fontSize:12,fontWeight:700,color:G.gold,letterSpacing:2}}>{title}</span>
    </div>
    <div style={{fontFamily:"'Lato',sans-serif",fontSize:11,color:G.muted,lineHeight:1.6,paddingLeft:24}}>{sub}</div>
    <div style={{height:1,background:"linear-gradient(90deg,rgba(212,175,55,.3),rgba(201,103,125,.15),transparent)",marginTop:10}}/>
  </div>
);}
function GoldBtn({children,onClick,disabled}){return(
  <button className="gb" onClick={onClick} disabled={disabled}
    style={{width:"100%",background:disabled?"rgba(212,175,55,.06)":"linear-gradient(135deg,#5a3e0a 0%,#8B6914 20%,#D4AF37 45%,#F5E27A 55%,#D4AF37 75%,#8B6914 90%,#5a3e0a 100%)",backgroundSize:"200% auto",border:"none",borderRadius:10,padding:"15px",color:disabled?"rgba(212,175,55,.25)":"#1a0e00",fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:11,letterSpacing:4,cursor:disabled?"not-allowed":"pointer",marginBottom:18,animation:disabled?"none":"shimmer 3s linear infinite",boxShadow:disabled?"none":"0 4px 24px rgba(212,175,55,.35), 0 0 0 1px rgba(212,175,55,.2)",textShadow:disabled?"none":"0 1px 2px rgba(0,0,0,.3)"}}>
    {children}
  </button>
);}
function GCard({icon,label,bl,children,small}){return(
  <div style={{background:"rgba(6,4,2,0.7)",backdropFilter:"blur(18px)",WebkitBackdropFilter:"blur(18px)",border:"1px solid rgba(212,175,55,.13)",borderLeft:`3px solid ${bl||G.gold}`,borderRadius:10,padding:small?"10px 12px":"12px 14px",marginBottom:9}}>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.38)",marginBottom:small?5:8}}>{icon} {label}</div>
    {children}
  </div>
);}
function ScCard({label,val,color,right}){return(
  <div style={{flex:1,background:"rgba(6,4,2,0.7)",backdropFilter:"blur(18px)",WebkitBackdropFilter:"blur(18px)",border:"1px solid rgba(212,175,55,.13)",borderRadius:10,padding:"13px 14px",textAlign:right?"right":"left"}}>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.38)",marginBottom:4}}>{label}</div>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:900,color,textShadow:`0 0 14px ${color}44`}}>{val}</div>
  </div>
);}
function Body({children}){return <p style={{fontFamily:"'Lato',sans-serif",color:"rgba(245,237,232,.72)",fontSize:13,lineHeight:1.75,margin:"0 0 3px"}}>{children}</p>;}
function Small({children}){return <p style={{fontFamily:"'Lato',sans-serif",color:"rgba(245,237,232,.35)",fontSize:10,lineHeight:1.5,margin:"1px 0 2px",fontStyle:"italic"}}>{children}</p>;}
function Spinner({text}){return(<div style={{textAlign:"center",padding:"20px 0"}}><div style={{width:34,height:34,margin:"0 auto 10px",border:"2px solid rgba(212,175,55,.12)",borderTopColor:G.gold,borderRadius:"50%",animation:"spin 1s linear infinite"}}/><div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.4)",animation:"pulse 1.5s ease infinite"}}>{text}</div></div>);}
function Err({children}){return <div style={{background:"rgba(224,92,106,.08)",border:"1px solid rgba(224,92,106,.22)",borderRadius:8,padding:"10px 14px",color:"#ff8a95",fontFamily:"'Lato',sans-serif",fontSize:12,marginBottom:14}}>{children}</div>;}
