import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./supabaseClient";

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
const POWER_COLORS = { STARK:"#D4AF37", AUSGEWOGEN:"#C0C0C0", SCHWACH:"#CD7F32" };
const STORAGE_KEY = "mp_local_v2";
const LANGS = [
  ["auto","🌍 Auto"],["de","🇩🇪 Deutsch"],["en","🇬🇧 English"],
  ["tr","🇹🇷 Türkçe"],["fr","🇫🇷 Français"],["es","🇪🇸 Español"],
  ["it","🇮🇹 Italiano"],["ar","🇸🇦 عربي"],["ru","🇷🇺 Русский"],
];
const LANG_LABELS = {
  auto:"Erkenne die Sprache automatisch aus dem Profil und schreibe den Opener in dieser Sprache",
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
  // community
  const [commStats,     setCommStats]     = useState(null);
  const [commInsights,  setCommInsights]  = useState([]);
  const [loadingComm,   setLoadingComm]   = useState(false);
  // history
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
    if(fs.length) ctx+=`Hat NICHT funktioniert: "${fs.join('", "')}"\n`;
    if(bestTone)  ctx+=`Erfolgreichster Stil: ${bestTone}\n`;
    ctx+=`Erfolgsrate: ${data.length?Math.round(worked.length/data.length*100):0}%\n`;
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
    if(!apiKey.trim()){setOpenerErr("Bitte API Key eintragen.");return;}
    setGenOpener(true); setOpenerResult(null); setOpenerErr(null);
    const parts=[];
    profileImgs.forEach(img=>parts.push({type:"image",source:{type:"base64",media_type:img.mediaType,data:img.base64}}));
    parts.push({type:"text",text:`Du bist der Opener-Coach der Manpower Bruderschaft.
Analysiere ${profileImgs.length>0?"die Profilbilder/Screenshots":"die Profilbeschreibung"} und generiere 5 personalisierte erste Nachrichten.
${profileNote?`Infos: ${profileNote}`:""}
SPRACHE: ${LANG_LABELS[openerLang]||LANG_LABELS.auto}
PHILOSOPHIE: Spezifisch auf SIE zugeschnitten. Echter Bezug auf Bio/Hobbys/Fotos. Humor und Leichtigkeit. Kurz (max 2 Sätze). Selbstsicher aber nicht arrogant.
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
    if(!apiKey.trim()){setChatErr("Bitte API Key eintragen.");return;}
    setAnalyzing(true); setChatResult(null); setChatErr(null); setFeedback(null); setCurrentId(null);
    const commCtx=await buildCommCtx();
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey.trim(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-opus-4-5",max_tokens:1500,
        system:`Du bist der Chat-Coach der Manpower Bruderschaft.
BILDLEGENDE: Farbige/lila/blaue Blase = Nutzer. Graue/dunkle Blase = sie.
SPRACHE: Erkenne die Sprache im Chat. Analyse auf Deutsch. Antwortvorschläge in der Sprache des Chats.
PHILOSOPHIE: Echte Verbindung. Selbstsicherheit. Humor. Authentizität.
${commCtx}
Nur valides JSON (keine Backticks):
{"detectedLanguage":"Sprache","vibeScore":"7.5/10","dynamik":"STARK|AUSGEWOGEN|SCHWACH","kurzanalyse":"2-3 Sätze","staerken":["s1","s2"],"verbesserungen":["v1","v2"],"psychoInsight":"Was verrät ihre Kommunikation?","naechsterSchritt":"Konkret was tun?","replies":[{"label":"Selbstsicher","text":"Antwort in Chat-Sprache","warum":"Erklärung Deutsch"},{"label":"Charmant","text":"...","warum":"..."},{"label":"Witzig","text":"...","warum":"..."}],"prinzip":"Kommunikationsprinzip","situation":"2-3 Wörter"}`,
        messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:chatImg.mediaType,data:chatImg.base64}},{type:"text",text:`Analysiere diesen Chat. Farbige Blase=ich, graue=sie. Ton: ${TONE_DE[tone]}. Erkenne Sprache, schreibe Antworten in Chat-Sprache. Nur JSON.`}]}]})});
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
    <div style={{background:"#080808",minHeight:"100vh",color:"#F5F0E8",fontFamily:"Georgia,serif",overflowX:"hidden",position:"relative"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Lato:wght@300;400;700&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}
        @keyframes glow{0%,100%{box-shadow:0 0 10px rgba(212,175,55,.18)}50%{box-shadow:0 0 24px rgba(212,175,55,.42)}}
        *{box-sizing:border-box;}
        .gb:not(:disabled):hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(212,175,55,.34)!important;}
        .gb{transition:all .25s;}
        .rc{transition:all .22s;cursor:pointer;}
        .rc:hover{border-color:#D4AF37!important;transform:translateX(4px);background:rgba(212,175,55,.06)!important;}
        .tp{transition:all .2s;cursor:pointer;}
        .tp:hover{border-color:rgba(212,175,55,.5)!important;}
        .dz{transition:all .25s;cursor:pointer;}
        .dz:hover{border-color:#D4AF37!important;}
        .fb{transition:all .18s;cursor:pointer;}
        .fb:hover{transform:scale(1.04);}
        input,textarea,select{outline:none;}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:#D4AF37;border-radius:2px;}
      `}</style>
      <div style={{position:"fixed",inset:0,zIndex:0,background:"radial-gradient(ellipse 65% 40% at 50% 0%,rgba(212,175,55,.08) 0%,transparent 55%)",pointerEvents:"none"}}/>
      <div style={{position:"fixed",inset:0,zIndex:0,backgroundImage:"repeating-linear-gradient(0deg,rgba(212,175,55,.013) 0,rgba(212,175,55,.013) 1px,transparent 1px,transparent 80px),repeating-linear-gradient(90deg,rgba(212,175,55,.013) 0,rgba(212,175,55,.013) 1px,transparent 1px,transparent 80px)",pointerEvents:"none"}}/>

      <div style={{position:"relative",zIndex:1,maxWidth:800,margin:"0 auto",padding:"0 15px 80px"}}>

        {/* HEADER */}
        <header style={{textAlign:"center",padding:"26px 0 16px",borderBottom:"1px solid rgba(212,175,55,.15)",marginBottom:16}}>
          <div style={{width:56,height:56,margin:"0 auto 10px",border:"2px solid #D4AF37",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",animation:"glow 3s ease infinite"}}>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:900,color:"#D4AF37"}}>M</span>
          </div>
          <div style={{fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:"clamp(18px,4vw,30px)",letterSpacing:5,background:"linear-gradient(90deg,#8B6914,#D4AF37,#F5E27A,#D4AF37,#8B6914)",backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",animation:"shimmer 4s linear infinite",marginBottom:2}}>MANPOWER</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:8,color:"rgba(212,175,55,.4)",marginBottom:10}}>BRUDERSCHAFT · DATE COACH</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,flexWrap:"wrap"}}>
            <Stat val={localMem.totalAnalyses||0} label="Analysen"/>
            <Stat val={localMem.totalOpeners||0}  label="Opener"/>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:7,color:"rgba(212,175,55,.32)"}}>👤 {user?.username?.toUpperCase()}</span>
            <button onClick={onLogout} style={{background:"rgba(212,175,55,.04)",border:"1px solid rgba(212,175,55,.13)",color:"rgba(212,175,55,.32)",padding:"2px 8px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,borderRadius:3}}>LOGOUT</button>
          </div>
        </header>

        {/* API KEY */}
        <div style={{background:"rgba(212,175,55,.03)",border:"1px solid rgba(212,175,55,.13)",borderRadius:4,padding:"10px 13px",marginBottom:14}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.36)",marginBottom:5}}>ANTHROPIC API KEY</div>
          <div style={{display:"flex",gap:6}}>
            <input type={showKey?"text":"password"} placeholder="sk-ant-..." value={apiKey} onChange={e=>saveKey(e.target.value)}
              style={{flex:1,background:"rgba(0,0,0,.4)",border:"1px solid rgba(212,175,55,.15)",borderRadius:3,padding:"7px 10px",color:"#F5F0E8",fontFamily:"'Lato',sans-serif",fontSize:13}}/>
            <button onClick={()=>setShowKey(s=>!s)} style={{background:"rgba(212,175,55,.05)",border:"1px solid rgba(212,175,55,.13)",color:"#D4AF37",padding:"7px 10px",cursor:"pointer",borderRadius:3,fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:1}}>{showKey?"HIDE":"SHOW"}</button>
          </div>
          <div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:"rgba(245,240,232,.2)",marginTop:4}}>console.anthropic.com → API Keys → Create Key</div>
        </div>

        {/* TONE */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:14}}>
          {TONES.map(t=>(
            <div key={t.key} className="tp" onClick={()=>setTone(t.key)}
              style={{background:tone===t.key?"rgba(212,175,55,.1)":"rgba(255,255,255,.02)",border:`1px solid ${tone===t.key?"#D4AF37":"rgba(212,175,55,.12)"}`,borderRadius:4,padding:"10px 4px",textAlign:"center",boxShadow:tone===t.key?"0 0 11px rgba(212,175,55,.11)":"none"}}>
              <div style={{fontSize:15,marginBottom:2}}>{t.emoji}</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:1.5,color:tone===t.key?"#D4AF37":"rgba(245,240,232,.26)"}}>{t.label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{display:"flex",gap:0,marginBottom:18,borderBottom:"1px solid rgba(212,175,55,.11)",overflowX:"auto"}}>
          {TABS.map(([key,label])=>(
            <div key={key} className="tp" onClick={()=>setTab(key)}
              style={{padding:"8px 12px",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1.5,whiteSpace:"nowrap",color:tab===key?"#D4AF37":"rgba(212,175,55,.27)",borderBottom:tab===key?"2px solid #D4AF37":"2px solid transparent",marginBottom:-1}}>
              {label}
            </div>
          ))}
        </div>

        {/* ══ OPENER TAB ══ */}
        {tab==="opener"&&(
          <div style={{animation:"fadeUp .35s ease"}}>
            <SLabel>💬 OPENER GENERATOR</SLabel>
            <div style={{fontFamily:"'Lato',sans-serif",fontSize:11,color:"rgba(245,240,232,.35)",marginBottom:14,lineHeight:1.6}}>Lade Profilbilder hoch → KI generiert 5 personalisierte erste Nachrichten in ihrer Sprache.</div>

            <SLabel>🌍 SPRACHE</SLabel>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:14}}>
              {LANGS.map(([k,l])=>(
                <div key={k} className="tp" onClick={()=>setOpenerLang(k)}
                  style={{background:openerLang===k?"rgba(212,175,55,.12)":"rgba(255,255,255,.02)",border:`1px solid ${openerLang===k?"#D4AF37":"rgba(212,175,55,.13)"}`,borderRadius:20,padding:"4px 10px",fontFamily:"'Lato',sans-serif",fontSize:11,color:openerLang===k?"#D4AF37":"rgba(245,240,232,.32)",whiteSpace:"nowrap"}}>
                  {l}
                </div>
              ))}
            </div>

            <SLabel>📸 PROFILBILDER / SCREENSHOTS (bis zu 5)</SLabel>
            <div className="dz"
              style={{background:openerDrag?"rgba(212,175,55,.07)":"rgba(255,255,255,.02)",border:`1px dashed ${openerDrag?"#D4AF37":"rgba(212,175,55,.18)"}`,borderRadius:4,padding:"24px 18px",textAlign:"center",marginBottom:8}}
              onClick={()=>profileRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setOpenerDrag(true);}}
              onDragLeave={()=>setOpenerDrag(false)}
              onDrop={onProfileDrop}>
              <div style={{fontSize:22,marginBottom:6,opacity:.35}}>📸</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:2,color:"#D4AF37",marginBottom:2}}>Profilbilder einwerfen</div>
              <div style={{fontFamily:"'Lato',sans-serif",color:"rgba(245,240,232,.22)",fontSize:11}}>Bio, Fotos, Hobbys – alles hilft der KI</div>
            </div>
            <input ref={profileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={async e=>await handleProfileFiles(e.target.files)}/>

            {profileImgs.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:5,marginBottom:10}}>
                {profileImgs.map((img,i)=>(
                  <div key={i} style={{position:"relative",borderRadius:4,overflow:"hidden",border:"1px solid rgba(212,175,55,.18)"}}>
                    <img src={img.dataUrl} alt="" style={{width:"100%",height:64,objectFit:"cover",display:"block"}}/>
                    <button onClick={()=>setProfileImgs(prev=>prev.filter((_,j)=>j!==i))}
                      style={{position:"absolute",top:2,right:2,background:"rgba(0,0,0,.75)",border:"none",color:"#ff6b6b",width:16,height:16,borderRadius:"50%",cursor:"pointer",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                  </div>
                ))}
                {profileImgs.length<5&&(
                  <div className="dz" onClick={()=>profileRef.current?.click()}
                    style={{height:64,border:"1px dashed rgba(212,175,55,.18)",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(212,175,55,.28)",fontSize:18}}>+</div>
                )}
              </div>
            )}

            <div style={{marginBottom:14}}>
              <SLabel>✍️ PROFIL BESCHREIBEN (optional)</SLabel>
              <textarea value={profileNote} onChange={e=>setProfileNote(e.target.value)}
                placeholder="z.B. Sie ist 26, Ärztin, liebt Reisen und Yoga. Bio: 'Kaffee > Menschen'. Foto in Thailand."
                rows={3} style={{width:"100%",background:"rgba(0,0,0,.4)",border:"1px solid rgba(212,175,55,.15)",borderRadius:3,padding:"9px 11px",color:"#F5F0E8",fontFamily:"'Lato',sans-serif",fontSize:13,resize:"vertical",lineHeight:1.6}}/>
            </div>

            <button className="gb" onClick={generateOpener} disabled={genOpener}
              style={{width:"100%",background:genOpener?"rgba(212,175,55,.06)":"linear-gradient(135deg,#8B6914,#D4AF37,#F5E27A,#D4AF37,#8B6914)",backgroundSize:"200% auto",border:"none",borderRadius:4,padding:"14px",color:genOpener?"rgba(212,175,55,.22)":"#080808",fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:11,letterSpacing:4,cursor:genOpener?"not-allowed":"pointer",marginBottom:16,animation:genOpener?"none":"shimmer 3s linear infinite",boxShadow:"none"}}>
              {genOpener?"GENERIERE OPENER…":"💬  OPENER GENERIEREN"}
            </button>

            {genOpener&&<Loading text="KI ANALYSIERT PROFIL…"/>}
            {openerErr&&<ErrBox>{openerErr}</ErrBox>}

            {openerResult&&(
              <div style={{animation:"fadeUp .4s ease"}}>
                <div style={{display:"flex",gap:7,marginBottom:8}}>
                  <Card flex><SLabel small>🌍 SPRACHE</SLabel><div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:"#D4AF37"}}>{openerResult.detectedLanguage}</div></Card>
                </div>
                <Card borderLeft="#9b59b6"><SLabel small>🔍 PROFIL-ANALYSE</SLabel><Body>{openerResult.profileAnalysis}</Body></Card>
                <SLabel>💬 OPENER – ANTIPPEN ZUM KOPIEREN</SLabel>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
                  {openerResult.openers?.map((o,i)=>(
                    <div key={i} className="rc" onClick={()=>copyOpener(o.text,i)}
                      style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(212,175,55,.12)",borderRadius:4,padding:"12px 13px",position:"relative"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:"#D4AF37",opacity:.58}}>{o.style?.toUpperCase()}</span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,color:copiedOpener===i?"#D4AF37":"rgba(212,175,55,.18)",transition:"color .2s"}}>{copiedOpener===i?"✓ KOPIERT":"COPY"}</span>
                      </div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:15,lineHeight:1.6,color:"#F5F0E8",marginBottom:5,fontWeight:500}}>{o.text}</div>
                      {o.warum&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(212,175,55,.38)",fontStyle:"italic"}}>💡 {o.warum}</div>}
                    </div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
                  <Card borderLeft="#2ecc71"><SLabel small>💡 PROFIL-TIPP</SLabel><Body>{openerResult.profilTipp}</Body></Card>
                  <Card borderLeft="#e74c3c"><SLabel small>🚫 VERMEIDEN</SLabel><Body>{openerResult.vermeiden}</Body></Card>
                </div>
                <div style={{textAlign:"center"}}>
                  <button onClick={()=>{setProfileImgs([]);setProfileNote("");setOpenerResult(null);setOpenerLang("auto");}}
                    style={{background:"rgba(212,175,55,.05)",border:"1px solid rgba(212,175,55,.14)",color:"rgba(212,175,55,.45)",padding:"6px 16px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,borderRadius:3}}>🔄 NEUES PROFIL</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ ANALYSE TAB ══ */}
        {tab==="analyze"&&(
          <div style={{animation:"fadeUp .35s ease"}}>
            <SLabel>⚔ CHAT-ANALYSE</SLabel>
            <div style={{fontFamily:"'Lato',sans-serif",fontSize:11,color:"rgba(245,240,232,.35)",marginBottom:12,lineHeight:1.6}}>Screenshot hochladen → KI erkennt Sprache → Antworten in Chat-Sprache.</div>
            <div className="dz"
              style={{background:chatDrag?"rgba(212,175,55,.07)":"rgba(255,255,255,.02)",border:`1px solid ${chatDrag?"#D4AF37":"rgba(212,175,55,.16)"}`,borderRadius:4,padding:chatImg?0:"36px 22px",textAlign:"center",cursor:chatImg?"default":"pointer",marginBottom:16,overflow:"hidden"}}
              onClick={()=>!chatImg&&chatRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setChatDrag(true);}}
              onDragLeave={()=>setChatDrag(false)}
              onDrop={onChatDrop}>
              {chatImg?(
                <div style={{position:"relative"}}>
                  <img src={chatImg.dataUrl} alt="" style={{width:"100%",maxHeight:270,objectFit:"cover",display:"block"}}/>
                  <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(8,8,8,.55) 0%,transparent 40%)"}}/>
                  <div style={{position:"absolute",bottom:9,left:11,right:11,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"#D4AF37"}}>✓ BEREIT</span>
                    <button onClick={e=>{e.stopPropagation();setChatImg(null);setChatResult(null);setFeedback(null);setCurrentId(null);}}
                      style={{background:"rgba(0,0,0,.75)",border:"1px solid rgba(212,175,55,.26)",color:"#D4AF37",padding:"3px 8px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2}}>ÄNDERN</button>
                  </div>
                </div>
              ):(
                <><div style={{fontSize:22,marginBottom:7,opacity:.32}}>📸</div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:2,color:"#D4AF37",marginBottom:2}}>Screenshot einwerfen</div>
                <div style={{fontFamily:"'Lato',sans-serif",color:"rgba(245,240,232,.22)",fontSize:11}}>Drag & Drop oder <span style={{color:"#D4AF37"}}>auswählen</span></div></>
              )}
            </div>
            <input ref={chatRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleChatFile(e.target.files[0])}/>

            <button className="gb" onClick={analyzeChat} disabled={!chatImg||analyzing}
              style={{width:"100%",background:!chatImg||analyzing?"rgba(212,175,55,.06)":"linear-gradient(135deg,#8B6914,#D4AF37,#F5E27A,#D4AF37,#8B6914)",backgroundSize:"200% auto",border:"none",borderRadius:4,padding:"14px",color:!chatImg||analyzing?"rgba(212,175,55,.22)":"#080808",fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:11,letterSpacing:4,cursor:!chatImg||analyzing?"not-allowed":"pointer",marginBottom:16,animation:!chatImg||analyzing?"none":"shimmer 3s linear infinite",boxShadow:"none"}}>
              {analyzing?"ANALYSIERE…":"⚔  TIEFENANALYSE STARTEN"}
            </button>

            {analyzing&&<Loading text="COMMUNITY-DATEN + KI ANALYSIERT…"/>}
            {chatErr&&<ErrBox>{chatErr}</ErrBox>}

            {chatResult&&(
              <div style={{animation:"fadeUp .42s ease"}}>
                {chatResult.detectedLanguage&&(
                  <div style={{background:"rgba(212,175,55,.04)",border:"1px solid rgba(212,175,55,.13)",borderRadius:4,padding:"7px 13px",marginBottom:8,display:"flex",alignItems:"center",gap:7}}>
                    <span style={{fontSize:13}}>🌍</span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.4)"}}>SPRACHE · </span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:"#D4AF37",fontWeight:700}}>{chatResult.detectedLanguage}</span>
                  </div>
                )}
                <div style={{display:"flex",gap:6,marginBottom:7}}>
                  <Card flex><SLabel small>VIBE SCORE</SLabel><div style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:900,color:"#D4AF37"}}>{chatResult.vibeScore}</div></Card>
                  <Card flex style={{textAlign:"right"}}><SLabel small>DYNAMIK</SLabel><div style={{fontFamily:"'Cinzel',serif",fontSize:17,fontWeight:900,color:POWER_COLORS[chatResult.dynamik]||"#D4AF37"}}>{chatResult.dynamik}</div></Card>
                </div>
                <Card borderLeft="#D4AF37"><SLabel small>🔍 ANALYSE</SLabel><Body>{chatResult.kurzanalyse}</Body></Card>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:7}}>
                  <Card borderLeft="#2ecc71"><SLabel small>✅ STÄRKEN</SLabel>{(chatResult.staerken||[]).map((s,i)=><Small key={i}>· {s}</Small>)}</Card>
                  <Card borderLeft="#e67e22"><SLabel small>⚡ VERBESSERN</SLabel>{(chatResult.verbesserungen||[]).map((v,i)=><Small key={i}>· {v}</Small>)}</Card>
                </div>
                <Card borderLeft="#9b59b6"><SLabel small>🧠 PSYCHO-INSIGHT</SLabel><Body>{chatResult.psychoInsight}</Body></Card>
                <Card borderLeft="#D4AF37"><SLabel small>🎯 NÄCHSTER SCHRITT</SLabel><div style={{fontFamily:"'Lato',sans-serif",color:"#D4AF37",fontSize:13,fontWeight:700,lineHeight:1.7}}>{chatResult.naechsterSchritt}</div></Card>
                <div style={{background:"rgba(212,175,55,.03)",border:"1px solid rgba(212,175,55,.11)",borderLeft:"2px solid #8B6914",borderRadius:4,padding:"8px 12px",marginBottom:7}}>
                  <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.36)"}}>⚔ PRINZIP · </span>
                  <span style={{fontFamily:"'Lato',sans-serif",fontSize:12,color:"rgba(245,240,232,.6)",fontStyle:"italic"}}>{chatResult.prinzip}</span>
                </div>
                <SLabel style={{marginTop:10}}>ANTWORTEN IN {chatResult.detectedLanguage?.toUpperCase()||"CHAT-SPRACHE"} — ANTIPPEN</SLabel>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                  {chatResult.replies?.map((r,i)=>(
                    <div key={i} className="rc" onClick={()=>copyReply(r.text,i,r.label)}
                      style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(212,175,55,.11)",borderRadius:4,padding:"11px 12px",position:"relative"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:"#D4AF37",opacity:.55}}>{r.label?.toUpperCase()}</span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,color:copiedIdx===i?"#D4AF37":"rgba(212,175,55,.16)",transition:"color .2s"}}>{copiedIdx===i?"✓ KOPIERT":"COPY"}</span>
                      </div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:14,lineHeight:1.6,color:"#F5F0E8",marginBottom:4}}>{r.text}</div>
                      {r.warum&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(212,175,55,.36)",fontStyle:"italic"}}>💡 {r.warum}</div>}
                    </div>
                  ))}
                </div>
                <div style={{background:"rgba(212,175,55,.04)",border:"1px solid rgba(212,175,55,.15)",borderRadius:4,padding:"13px"}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.42)",marginBottom:3,textAlign:"center"}}>🌐 COMMUNITY FEEDBACK</div>
                  <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(245,240,232,.24)",textAlign:"center",marginBottom:10}}>Dein Feedback verbessert die App für alle</div>
                  {!feedback?(
                    <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
                      {[["worked","✅ Hat geklappt","rgba(46,204,113,.12)","rgba(46,204,113,.36)"],
                        ["mixed","➡️ Teils teils","rgba(230,126,34,.12)","rgba(230,126,34,.36)"],
                        ["failed","❌ Nicht geklappt","rgba(231,76,60,.12)","rgba(231,76,60,.36)"]].map(([type,label,bg,border])=>(
                        <button key={type} className="fb" onClick={()=>markFeedback(type)}
                          style={{background:bg,border:`1px solid ${border}`,color:"#F5F0E8",padding:"7px 12px",cursor:"pointer",borderRadius:3,fontFamily:"'Lato',sans-serif",fontSize:11,fontWeight:700}}>{label}</button>
                      ))}
                    </div>
                  ):(
                    <div style={{textAlign:"center",fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2,color:"#D4AF37"}}>
                      {feedback==="worked"?"✅ Gespeichert!":feedback==="mixed"?"➡️ Notiert.":"❌ Notiert – nächste Analyse wird besser."}
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
            <SLabel>🌐 COMMUNITY STATS</SLabel>
            {commStats&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:10}}>
                  {[[commStats.total,"Analysen"],[commStats.worked,"Erfolge"],[commStats.rate+"%","Erfolgsrate"]].map(([v,l])=>(
                    <div key={l} style={{background:"rgba(212,175,55,.05)",border:"1px solid rgba(212,175,55,.13)",borderRadius:4,padding:"11px 7px",textAlign:"center"}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:18,fontWeight:900,color:"#D4AF37",marginBottom:1}}>{v}</div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:8,color:"rgba(212,175,55,.36)",letterSpacing:1}}>{l.toUpperCase()}</div>
                    </div>
                  ))}
                </div>
                {commStats.bestTone&&(
                  <div style={{background:"rgba(212,175,55,.04)",border:"1px solid rgba(212,175,55,.16)",borderRadius:4,padding:"9px 13px",marginBottom:12,textAlign:"center"}}>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.38)"}}>🏆 ERFOLGREICHSTER STIL · </span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:"#D4AF37",fontWeight:700}}>{commStats.bestTone.toUpperCase()}</span>
                  </div>
                )}
              </>
            )}
            {loadingComm?<Loading text="LADE…"/>:(
              commInsights.map((ins,i)=>(
                <div key={ins.id||i} style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(212,175,55,.09)",borderLeft:"2px solid #D4AF37",borderRadius:4,padding:"11px 13px",marginBottom:7}}>
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

        {/* ══ HISTORY TAB ══ */}
        {tab==="history"&&(
          <div style={{animation:"fadeUp .3s ease"}}>
            <SLabel>📊 MEIN VERLAUF</SLabel>
            {loadingHist?<Loading text="LADE…"/>:myHistory.length===0?(
              <div style={{textAlign:"center",padding:"32px 0",color:"rgba(212,175,55,.22)",fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3}}>NOCH KEINE ANALYSEN</div>
            ):myHistory.map((s,i)=>(
              <div key={s.id||i} style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(212,175,55,.09)",borderRadius:4,padding:"11px 13px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:"#D4AF37",marginBottom:2}}>{s.vibe_score} · {s.dynamik}</div>
                  <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(245,240,232,.28)"}}>
                    {new Date(s.created_at).toLocaleDateString("de-DE")} · {s.tone}{s.situation?` · ${s.situation}`:""}
                  </div>
                  {s.used_label&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:"rgba(212,175,55,.32)",marginTop:1}}>Genutzt: {s.used_label}</div>}
                </div>
                <div style={{fontSize:15}}>{s.feedback_type==="worked"?"✅":s.feedback_type==="failed"?"❌":s.feedback_type==="mixed"?"➡️":"⏳"}</div>
              </div>
            ))}
          </div>
        )}

        {/* ══ TIPS TAB ══ */}
        {tab==="tips"&&(
          <div style={{animation:"fadeUp .3s ease"}}>
            <SLabel>💡 KOMMUNIKATIONS-PRINZIPIEN</SLabel>
            {[
              ["⚡","Kürze erzeugt Spannung","Weniger schreiben als sie. 5 Sätze → 2 Sätze. Leere erzeugt Neugier.","Reaktanz-Theorie: Menschen wollen mehr von dem was sie nicht vollständig haben."],
              ["🔍","Echtes Interesse schlägt alles","Frag konkret nach etwas das sie gesagt hat. Zeige dass du wirklich zugehört hast.","Menschen spüren sofort ob Interesse echt oder performt ist."],
              ["💬","Opener: Spezifisch statt generisch","'Wow schön' funktioniert nie. Beziehe dich auf etwas Konkretes aus ihrem Profil.","Spezifität signalisiert echtes Interesse – das unterscheidet dich von 90% der Männer."],
              ["😄","Humor der verbindet","Selbstironie und gemeinsames Lachen. Nie auf ihre Kosten.","Lachen baut Oxytocin auf – denselben Stoff wie Umarmungen."],
              ["🎯","Konkret statt vage","Nicht 'treffen wir uns' – sondern 'Dienstag 19 Uhr, Café XY'.","Konkrete Einladungen zeigen Selbstsicherheit. Vagheit = Unsicherheit."],
              ["🌍","Sprich ihre Sprache","Antworte in der Sprache in der sie schreibt – zeigt Respekt und Aufmerksamkeit.","Sprachliche Anpassung baut unbewusst Vertrauen auf."],
              ["⏰","Timing ist alles","Nicht immer sofort. 20-60 Min. Abstand zeigt: du hast ein Leben.","Konstante Sofortantworten senken deinen wahrgenommenen Wert."],
              ["🚀","Der Move zur richtigen Zeit","Wenn der Vibe stimmt: Mach den Move. Zögern tötet Momentum.","Frauen wollen einen Mann der weiß was er will und es klar sagt."],
            ].map(([icon,title,desc,science])=>(
              <div key={title} style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(212,175,55,.09)",borderLeft:"2px solid #D4AF37",borderRadius:4,padding:"12px 14px",marginBottom:7}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                  <span style={{fontSize:15}}>{icon}</span>
                  <span style={{fontFamily:"'Cinzel',serif",fontSize:9,fontWeight:700,color:"#D4AF37",letterSpacing:1}}>{title}</span>
                </div>
                <Body>{desc}</Body>
                <Small>🔬 {science}</Small>
              </div>
            ))}
          </div>
        )}

        <div style={{textAlign:"center",marginTop:24,fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:5,color:"rgba(212,175,55,.11)"}}>
          MANPOWER BRUDERSCHAFT · {localMem.totalAnalyses||0} ANALYSEN · {localMem.totalOpeners||0} OPENER
        </div>
      </div>
    </div>
  );
}

function Stat({val,label}){return(<div style={{textAlign:"center"}}><span style={{fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:900,color:"#D4AF37"}}>{val}</span><span style={{fontFamily:"'Lato',sans-serif",fontSize:8,color:"rgba(212,175,55,.32)",letterSpacing:1,marginLeft:3}}>{label.toUpperCase()}</span></div>);}
function SLabel({children,small,style}){return <div style={{fontFamily:"'Cinzel',serif",fontSize:small?7:8,letterSpacing:4,color:"rgba(212,175,55,.36)",marginBottom:small?4:8,textTransform:"uppercase",...style}}>{children}</div>;}
function Card({children,borderLeft,flex,style}){return <div style={{background:"rgba(255,255,255,.02)",border:"1px solid rgba(212,175,55,.09)",borderLeft:borderLeft?`3px solid ${borderLeft}`:"1px solid rgba(212,175,55,.09)",borderRadius:4,padding:"11px 13px",marginBottom:7,flex:flex?1:undefined,...style}}>{children}</div>;}
function Body({children}){return <p style={{fontFamily:"'Lato',sans-serif",color:"rgba(245,240,232,.66)",fontSize:13,lineHeight:1.72,margin:"0 0 3px"}}>{children}</p>;}
function Small({children}){return <p style={{fontFamily:"'Lato',sans-serif",color:"rgba(245,240,232,.32)",fontSize:10,lineHeight:1.5,margin:"1px 0 2px",fontStyle:"italic"}}>{children}</p>;}
function Loading({text}){return(<div style={{textAlign:"center",padding:"18px 0"}}><div style={{width:32,height:32,margin:"0 auto 9px",border:"2px solid rgba(212,175,55,.12)",borderTopColor:"#D4AF37",borderRadius:"50%",animation:"spin 1s linear infinite"}}/><div style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:4,color:"rgba(212,175,55,.34)",animation:"pulse 1.5s ease infinite"}}>{text}</div></div>);}
function ErrBox({children}){return <div style={{background:"rgba(180,30,30,.1)",border:"1px solid rgba(180,30,30,.24)",borderRadius:4,padding:"9px 13px",color:"#ff6b6b",fontFamily:"'Lato',sans-serif",fontSize:12,marginBottom:12}}>{children}</div>;}
