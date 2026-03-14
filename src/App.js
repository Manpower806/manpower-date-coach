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
const STORAGE_KEY = "mp_local_v5";
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

const G = {
  gold:"#D4AF37", gold2:"#8B6914", gold3:"#F5E27A",
  rose:"#c9677d", rose2:"#e8a0b0",
  text:"#f5ede8", muted:"rgba(245,237,232,.42)",
  green:"#5cb87a", red:"#e05c6a",
};

const glassCard = {
  background:"rgba(5,3,1,0.75)",
  backdropFilter:"blur(22px)",
  WebkitBackdropFilter:"blur(22px)",
  border:"1px solid rgba(212,175,55,.18)",
  borderRadius:14,
};

export default function App({ user, onLogout }) {
  const isAdmin = user?.username?.toLowerCase() === ADMIN_USERNAME;
  const [tab,          setTab]          = useState("opener");
  const [tone,         setTone]         = useState("charming");
  const [localMem,     setLocalMem]     = useState(loadLocal);
  const apiKey = process.env.REACT_APP_ANTHROPIC_KEY || "";
  
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

  

  useEffect(()=>{
    if(tab==="community") loadComm();
    if(tab==="history")   loadHist();
  },[tab]);

  const loadComm=async()=>{
    setLoadingComm(true);
    const [{data:fb},{data:ins}]=await Promise.all([
      supabase.from("feedback").select("feedback_type,tone"),
      supabase.from("community_insights").select("*").order("upvotes",{ascending:false}).limit(10),
    ]);
    if(fb){
      const total=fb.length,worked=fb.filter(f=>f.feedback_type==="worked").length;
      const tc={};fb.forEach(f=>{if(f.tone)tc[f.tone]=(tc[f.tone]||0)+1;});
      const bestTone=Object.entries(tc).sort((a,b)=>b[1]-a[1])[0]?.[0];
      setCommStats({total,worked,rate:total?Math.round(worked/total*100):0,bestTone});
    }
    if(ins) setCommInsights(ins);
    setLoadingComm(false);
  };
  const loadHist=async()=>{
    setLoadingHist(true);
    const{data}=await supabase.from("feedback").select("*").eq("username",user.username).order("created_at",{ascending:false}).limit(25);
    if(data) setMyHistory(data);
    setLoadingHist(false);
  };
  const buildCommCtx=async()=>{
    const{data}=await supabase.from("feedback").select("used_reply,feedback_type,tone").not("feedback_type","is",null).order("created_at",{ascending:false}).limit(40);
    if(!data?.length) return "";
    const worked=data.filter(d=>d.feedback_type==="worked");
    const failed=data.filter(d=>d.feedback_type==="failed");
    const tc={};worked.forEach(d=>{if(d.tone)tc[d.tone]=(tc[d.tone]||0)+1;});
    const bestTone=Object.entries(tc).sort((a,b)=>b[1]-a[1])[0]?.[0];
    let ctx=`\nCOMMUNITY-LERNDATA (${data.length} Analysen):\n`;
    const ws=worked.slice(0,4).map(d=>d.used_reply).filter(Boolean);
    const fs=failed.slice(0,2).map(d=>d.used_reply).filter(Boolean);
    if(ws.length) ctx+=`Hat funktioniert: "${ws.join('", "')}"\n`;
    if(fs.length) ctx+=`NICHT: "${fs.join('", "')}"\n`;
    if(bestTone) ctx+=`Bester Stil: ${bestTone}\n`;
    return ctx;
  };

  const handleProfileFiles=async files=>{
    const arr=Array.from(files).filter(f=>f.type.startsWith("image/")).slice(0,5);
    const conv=await Promise.all(arr.map(fileToB64));
    setProfileImgs(prev=>[...prev,...conv].slice(0,5));
    setOpenerResult(null);setOpenerErr(null);
  };
  const onProfileDrop=useCallback(async e=>{e.preventDefault();setOpenerDrag(false);await handleProfileFiles(e.dataTransfer.files);},[]);

  const generateOpener=async()=>{
    if(!profileImgs.length&&!profileNote.trim()){setOpenerErr("Bitte Bild oder Beschreibung eingeben.");return;}
    if(!apiKey.trim()){setOpenerErr("API Key fehlt – bitte Admin kontaktieren.");return;}
    setGenOpener(true);setOpenerResult(null);setOpenerErr(null);
    const parts=[];
    profileImgs.forEach(img=>parts.push({type:"image",source:{type:"base64",media_type:img.mediaType,data:img.base64}}));
    parts.push({type:"text",text:`Du bist der Opener-Coach der Manpower Bruderschaft. Generiere 5 personalisierte erste Nachrichten.
${profileNote?`Infos: ${profileNote}`:""}
SPRACHE: ${LANG_LABELS[openerLang]||LANG_LABELS.auto}
Ton: ${TONE_DE[tone]}
Nur valides JSON: {"detectedLanguage":"...","profileAnalysis":"...","openers":[{"style":"Humor","text":"...","warum":"..."},{"style":"Direkt","text":"...","warum":"..."},{"style":"Neugier","text":"...","warum":"..."},{"style":"Interesse","text":"...","warum":"..."},{"style":"Witzig","text":"...","warum":"..."}],"profilTipp":"...","vermeiden":"..."}`});
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey.trim(),"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-calls":"true"},body:JSON.stringify({model:"claude-opus-4-5",max_tokens:1500,messages:[{role:"user",content:parts}]})});
      const data=await res.json();
      if(data.error) throw new Error(data.error.message);
      const raw=data.content?.map(i=>i.text||"").join("")||"";
      setOpenerResult(JSON.parse(raw.replace(/```json|```/g,"").trim()));
      const nl={...localMem,totalOpeners:(localMem.totalOpeners||0)+1};
      setLocalMem(nl);saveLocal(nl);
    }catch(err){setOpenerErr("Fehler: "+(err.message||"Versuch es nochmal."));}
    setGenOpener(false);
  };

  const handleChatFile=file=>{
    if(!file||!file.type.startsWith("image/")) return;
    const reader=new FileReader();
    reader.onload=e=>{
      const du=e.target.result;
      setChatImg({base64:du.split(",")[1],dataUrl:du,mediaType:du.split(";")[0].split(":")[1]});
      setChatResult(null);setChatErr(null);setFeedback(null);setCurrentId(null);
    };
    reader.readAsDataURL(file);
  };
  const onChatDrop=useCallback(e=>{e.preventDefault();setChatDrag(false);handleChatFile(e.dataTransfer.files[0]);},[]);

  const analyzeChat=async()=>{
    if(!chatImg||!apiKey.trim()) return;
    setAnalyzing(true);setChatResult(null);setChatErr(null);setFeedback(null);setCurrentId(null);
    const commCtx=await buildCommCtx();
    try{
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
      setLocalMem(nl);saveLocal(nl);
    }catch(err){setChatErr("Fehler: "+(err.message||"Versuch es nochmal."));}
    setAnalyzing(false);
  };

  const copyReply=async(text,idx,label)=>{
    navigator.clipboard.writeText(text).catch(()=>{});setCopiedIdx(idx);
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
        @keyframes spin      {to{transform:rotate(360deg)}}
        @keyframes shimmer   {0%{background-position:-300% center}100%{background-position:300% center}}
        @keyframes shimmer2  {0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes fadeUp    {from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse     {0%,100%{opacity:.3}50%{opacity:1}}
        @keyframes glow      {0%,100%{box-shadow:0 0 14px rgba(212,175,55,.3),0 0 0 1px rgba(212,175,55,.15)}50%{box-shadow:0 0 36px rgba(212,175,55,.65),0 0 0 1px rgba(212,175,55,.4)}}
        @keyframes heartbeat {0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
        @keyframes borderGlow{0%,100%{border-color:rgba(212,175,55,.2)}50%{border-color:rgba(212,175,55,.5)}}
        *{box-sizing:border-box;}
        .mgbtn:not(:disabled):hover{transform:translateY(-4px)!important;filter:brightness(1.15)!important;box-shadow:0 8px 32px rgba(212,175,55,.5),0 0 0 1px rgba(212,175,55,.4)!important;}
        .mgbtn{transition:all .28s!important;}
        .rc{transition:all .22s;cursor:pointer;}
        .rc:hover{border-color:rgba(212,175,55,.55)!important;transform:translateX(5px)!important;background:rgba(212,175,55,.1)!important;}
        .tp{transition:all .2s;cursor:pointer;}
        .tp:hover{transform:translateY(-2px)!important;border-color:rgba(212,175,55,.5)!important;}
        .dz{transition:all .25s;cursor:pointer;}
        .dz:hover{border-color:rgba(212,175,55,.55)!important;background:rgba(212,175,55,.06)!important;}
        .fbbtn{transition:all .2s;cursor:pointer;}
        .fbbtn:hover{transform:scale(1.07)!important;filter:brightness(1.1)!important;}
        .tabpill{transition:all .2s;cursor:pointer;}
        .tabpill:hover{color:#D4AF37!important;}
        input,textarea{outline:none;}
        ::placeholder{color:rgba(245,237,232,.2);}
        ::-webkit-scrollbar{width:3px;}
        ::-webkit-scrollbar-thumb{background:linear-gradient(#D4AF37,#c9677d);border-radius:2px;}
      `}</style>

      {/* BACKGROUND */}
      <div style={{position:"fixed",inset:0,zIndex:0,backgroundImage:"url('/bg.jpg')",backgroundSize:"cover",backgroundPosition:"center top",backgroundAttachment:"fixed"}}/>
      <div style={{position:"fixed",inset:0,zIndex:1,background:"linear-gradient(to bottom,rgba(3,2,1,0.80) 0%,rgba(3,2,1,0.74) 50%,rgba(3,2,1,0.85) 100%)"}}/>
      <div style={{position:"fixed",inset:0,zIndex:2,background:"radial-gradient(ellipse 100% 35% at 50% 0%,rgba(212,175,55,.1) 0%,transparent 65%)",pointerEvents:"none"}}/>

      <div style={{position:"relative",zIndex:3,maxWidth:820,margin:"0 auto",padding:"0 15px 80px"}}>

        {/* ── HEADER ── */}
        <header style={{textAlign:"center",padding:"32px 0 24px",marginBottom:22,position:"relative"}}>
          <div style={{position:"absolute",bottom:0,left:"10%",right:"10%",height:1,background:"linear-gradient(90deg,transparent,rgba(212,175,55,.35),rgba(201,103,125,.25),rgba(212,175,55,.35),transparent)"}}/>

          {/* Logo */}
          <div style={{width:70,height:70,margin:"0 auto 13px",position:"relative"}}>
            <div style={{width:"100%",height:"100%",border:"2px solid",borderColor:G.gold,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(3,2,1,0.65)",backdropFilter:"blur(12px)",animation:"glow 4s ease infinite"}}>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:27,fontWeight:900,background:`linear-gradient(135deg,${G.gold3},${G.gold},#fff8e7,${G.gold})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>M</span>
            </div>
            <div style={{position:"absolute",top:-3,right:-2,width:11,height:11,background:`radial-gradient(circle,${G.rose2},${G.rose})`,borderRadius:"50%",border:"2px solid rgba(3,2,1,.9)",animation:"heartbeat 2s ease infinite",boxShadow:`0 0 8px ${G.rose}`}}/>
          </div>

          <div style={{fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:"clamp(22px,4.5vw,38px)",letterSpacing:8,background:`linear-gradient(90deg,${G.gold2},${G.gold},${G.gold3},#fff8e7,${G.gold3},${G.gold},${G.gold2})`,backgroundSize:"250% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",animation:"shimmer 5s linear infinite",marginBottom:4,textShadow:"none"}}>MANPOWER</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:10,color:"rgba(212,175,55,.5)",marginBottom:16}}>BRUDERSCHAFT · DATE COACH</div>

          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,flexWrap:"wrap"}}>
            <StatBadge val={localMem.totalAnalyses||0} label="Analysen" color={G.gold}/>
            <Divider/>
            <StatBadge val={localMem.totalOpeners||0} label="Opener" color={G.rose}/>
            <Divider/>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2,color:"rgba(212,175,55,.5)"}}>
              {isAdmin?"👑":"👤"} {user?.username?.toUpperCase()}
            </span>
            <button onClick={onLogout} style={{...glassCard,background:"rgba(3,2,1,.65)",color:"rgba(212,175,55,.45)",padding:"4px 14px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,border:"1px solid rgba(212,175,55,.18)",transition:"all .2s"}}>LOGOUT</button>
          </div>
        </header>



        {/* TONE SELECTOR */}
        <div style={{...glassCard,padding:"10px",marginBottom:18,background:"rgba(3,2,1,.7)"}}>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.4)",textAlign:"center",marginBottom:8}}>KOMMUNIKATIONSSTIL WÄHLEN</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:7}}>
            {TONES.map(t=>(
              <div key={t.key} className="tp" onClick={()=>setTone(t.key)}
                style={{...glassCard,padding:"12px 6px",textAlign:"center",background:tone===t.key?"rgba(212,175,55,.14)":"rgba(3,2,1,.5)",borderColor:tone===t.key?"rgba(212,175,55,.55)":"rgba(212,175,55,.12)",boxShadow:tone===t.key?`0 0 22px rgba(212,175,55,.2),inset 0 0 12px rgba(212,175,55,.06)`:"none",position:"relative",overflow:"hidden"}}>
                {tone===t.key&&<div style={{position:"absolute",inset:0,background:"radial-gradient(circle at 50% 0%,rgba(212,175,55,.12),transparent 70%)"}}/>}
                <div style={{fontSize:19,marginBottom:4,position:"relative"}}>{t.emoji}</div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:1.5,color:tone===t.key?G.gold:"rgba(212,175,55,.4)",fontWeight:tone===t.key?"700":"400",position:"relative"}}>{t.label.toUpperCase()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div style={{...glassCard,display:"flex",gap:0,marginBottom:22,padding:"0 6px",overflowX:"auto",background:"rgba(3,2,1,.78)"}}>
          {TABS.map(([key,label])=>(
            <div key={key} className="tabpill" onClick={()=>setTab(key)}
              style={{padding:"11px 12px",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1.5,whiteSpace:"nowrap",color:tab===key?G.gold:"rgba(212,175,55,.35)",borderBottom:tab===key?`2px solid ${G.gold}`:"2px solid transparent",marginBottom:-1,flex:1,textAlign:"center"}}>
              {label}
            </div>
          ))}
        </div>

        {/* ══ OPENER ══ */}
        {tab==="opener"&&(
          <div style={{animation:"fadeUp .35s ease"}}>
            <SectionTitle icon="💬" title="OPENER GENERATOR" sub="Profilbilder hochladen → KI generiert 5 erste Nachrichten in ihrer Sprache"/>

            <SL>🌍 SPRACHE</SL>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:16}}>
              {LANGS.map(([k,l])=>(
                <div key={k} className="tp" onClick={()=>setOpenerLang(k)}
                  style={{...glassCard,padding:"5px 12px",borderRadius:20,fontFamily:"'Lato',sans-serif",fontSize:11,color:openerLang===k?G.gold:"rgba(212,175,55,.4)",borderColor:openerLang===k?"rgba(212,175,55,.5)":"rgba(212,175,55,.12)",background:openerLang===k?"rgba(212,175,55,.12)":"rgba(3,2,1,.6)",boxShadow:openerLang===k?"0 0 12px rgba(212,175,55,.15)":"none"}}>
                  {l}
                </div>
              ))}
            </div>

            <SL>📸 PROFILBILDER (bis zu 5)</SL>
            <div className="dz"
              style={{...glassCard,padding:"26px 20px",textAlign:"center",marginBottom:12,borderStyle:"dashed",borderColor:openerDrag?"rgba(212,175,55,.5)":"rgba(212,175,55,.18)",background:openerDrag?"rgba(212,175,55,.07)":"rgba(3,2,1,.6)"}}
              onClick={()=>profileRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setOpenerDrag(true);}}
              onDragLeave={()=>setOpenerDrag(false)}
              onDrop={onProfileDrop}>
              <div style={{fontSize:28,marginBottom:8,opacity:.55}}>📸</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:2,color:G.gold,marginBottom:4}}>Profilbilder hinzufügen</div>
              <div style={{fontFamily:"'Lato',sans-serif",color:G.muted,fontSize:11}}>Bio · Fotos · Hobbys – alles hilft der KI</div>
            </div>
            <input ref={profileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={async e=>await handleProfileFiles(e.target.files)}/>

            {profileImgs.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:6,marginBottom:14}}>
                {profileImgs.map((img,i)=>(
                  <div key={i} style={{position:"relative",borderRadius:10,overflow:"hidden",border:"1px solid rgba(212,175,55,.22)",boxShadow:"0 4px 12px rgba(0,0,0,.4)"}}>
                    <img src={img.dataUrl} alt="" style={{width:"100%",height:70,objectFit:"cover",display:"block"}}/>
                    <button onClick={()=>setProfileImgs(prev=>prev.filter((_,j)=>j!==i))}
                      style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.85)",border:"none",color:"#ff7b7b",width:20,height:20,borderRadius:"50%",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                  </div>
                ))}
                {profileImgs.length<5&&<div className="dz" onClick={()=>profileRef.current?.click()} style={{height:70,border:"1px dashed rgba(212,175,55,.2)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(212,175,55,.35)",fontSize:22,cursor:"pointer",background:"rgba(3,2,1,.5)"}}>+</div>}
              </div>
            )}

            <SL>✍️ PROFIL BESCHREIBEN (optional)</SL>
            <textarea value={profileNote} onChange={e=>setProfileNote(e.target.value)}
              placeholder="z.B. Sie ist 26, Ärztin, liebt Reisen. Bio: 'Kaffee > Menschen'. Foto in Thailand."
              rows={3} style={{...glassCard,width:"100%",padding:"11px 14px",color:G.text,fontFamily:"'Lato',sans-serif",fontSize:13,resize:"vertical",lineHeight:1.65,marginBottom:18,borderColor:"rgba(212,175,55,.16)",background:"rgba(3,2,1,.65)"}}/>

            <MegaButton onClick={generateOpener} disabled={genOpener} icon="💬">
              {genOpener?"✨  GENERIERE OPENER…":"OPENER GENERIEREN"}
            </MegaButton>

            {genOpener&&<Loader text="KI ANALYSIERT PROFIL UND GENERIERT OPENER…"/>}
            {openerErr&&<ErrBox>{openerErr}</ErrBox>}

            {openerResult&&(
              <div style={{animation:"fadeUp .4s ease"}}>
                <InfoCard icon="🌍" label="ERKANNTE SPRACHE" bl={G.rose}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:700,color:G.rose2,textShadow:`0 0 16px ${G.rose}66`}}>{openerResult.detectedLanguage}</div>
                </InfoCard>
                <InfoCard icon="🔍" label="PROFIL-ANALYSE" bl={G.gold}><BodyText>{openerResult.profileAnalysis}</BodyText></InfoCard>
                <SL>💬 OPENER – ANTIPPEN ZUM KOPIEREN</SL>
                <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:16}}>
                  {openerResult.openers?.map((o,i)=>(
                    <div key={i} className="rc" onClick={()=>copyOpener(o.text,i)}
                      style={{...glassCard,padding:"14px 16px",borderColor:copiedOpener===i?"rgba(212,175,55,.5)":"rgba(212,175,55,.16)",boxShadow:copiedOpener===i?"0 0 22px rgba(212,175,55,.18)":"none",background:"rgba(3,2,1,.72)"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:G.gold,opacity:.75}}>{o.style?.toUpperCase()}</span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,color:copiedOpener===i?G.gold:"rgba(212,175,55,.28)",transition:"color .2s"}}>{copiedOpener===i?"✓ KOPIERT":"COPY"}</span>
                      </div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:15,lineHeight:1.68,color:G.text,marginBottom:6,fontWeight:500}}>{o.text}</div>
                      {o.warum&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(212,175,55,.42)",fontStyle:"italic"}}>💡 {o.warum}</div>}
                    </div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:16}}>
                  <InfoCard icon="💡" label="PROFIL-TIPP" bl={G.green}><BodyText>{openerResult.profilTipp}</BodyText></InfoCard>
                  <InfoCard icon="🚫" label="VERMEIDEN" bl={G.red}><BodyText>{openerResult.vermeiden}</BodyText></InfoCard>
                </div>
                <div style={{textAlign:"center"}}>
                  <button onClick={()=>{setProfileImgs([]);setProfileNote("");setOpenerResult(null);setOpenerLang("auto");}}
                    style={{...glassCard,background:"rgba(3,2,1,.7)",color:"rgba(212,175,55,.45)",padding:"8px 22px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,borderRadius:22,border:"1px solid rgba(212,175,55,.18)",transition:"all .2s"}}>
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
            <SectionTitle icon="⚔" title="CHAT-ANALYSE" sub="Screenshot hochladen → KI erkennt Sprache → Antworten in Chat-Sprache"/>
            <div className="dz"
              style={{...glassCard,padding:chatImg?0:"40px 22px",textAlign:"center",cursor:chatImg?"default":"pointer",marginBottom:18,overflow:"hidden",borderColor:chatDrag?"rgba(212,175,55,.5)":"rgba(212,175,55,.16)",background:chatDrag?"rgba(212,175,55,.06)":"rgba(3,2,1,.65)"}}
              onClick={()=>!chatImg&&chatRef.current?.click()}
              onDragOver={e=>{e.preventDefault();setChatDrag(true);}}
              onDragLeave={()=>setChatDrag(false)}
              onDrop={onChatDrop}>
              {chatImg?(
                <div style={{position:"relative"}}>
                  <img src={chatImg.dataUrl} alt="" style={{width:"100%",maxHeight:280,objectFit:"cover",display:"block"}}/>
                  <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(3,2,1,.72) 0%,transparent 45%)"}}/>
                  <div style={{position:"absolute",bottom:12,left:14,right:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:G.gold}}>✓ BEREIT ZUR ANALYSE</span>
                    <button onClick={e=>{e.stopPropagation();setChatImg(null);setChatResult(null);setFeedback(null);}}
                      style={{background:"rgba(0,0,0,.85)",border:"1px solid rgba(212,175,55,.28)",color:G.gold,padding:"4px 11px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,borderRadius:5}}>ÄNDERN</button>
                  </div>
                </div>
              ):(
                <>
                  <div style={{fontSize:26,marginBottom:9,opacity:.5}}>📸</div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:12,letterSpacing:2,color:G.gold,marginBottom:4}}>Chat-Screenshot hinzufügen</div>
                  <div style={{fontFamily:"'Lato',sans-serif",color:G.muted,fontSize:11}}>Drag & Drop oder <span style={{color:G.gold}}>auswählen</span></div>
                </>
              )}
            </div>
            <input ref={chatRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleChatFile(e.target.files[0])}/>
            <MegaButton onClick={analyzeChat} disabled={!chatImg||analyzing} icon="⚔">
              {analyzing?"✨  ANALYSIERE CHAT…":"TIEFENANALYSE STARTEN"}
            </MegaButton>
            {analyzing&&<Loader text="COMMUNITY-DATEN LADEN · KI ANALYSIERT…"/>}
            {chatErr&&<ErrBox>{chatErr}</ErrBox>}
            {chatResult&&(
              <div style={{animation:"fadeUp .42s ease"}}>
                {chatResult.detectedLanguage&&(
                  <div style={{...glassCard,padding:"9px 15px",marginBottom:11,display:"flex",alignItems:"center",gap:9,borderColor:"rgba(212,175,55,.2)",background:"rgba(3,2,1,.72)"}}>
                    <span style={{fontSize:16}}>🌍</span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.45)"}}>ERKANNTE SPRACHE · </span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:12,color:G.gold,fontWeight:700}}>{chatResult.detectedLanguage}</span>
                  </div>
                )}
                <div style={{display:"flex",gap:9,marginBottom:11}}>
                  <ScoreCard label="VIBE SCORE" val={chatResult.vibeScore} color={G.gold}/>
                  <ScoreCard label="DYNAMIK" val={chatResult.dynamik} color={POWER_COLORS[chatResult.dynamik]||G.gold} right/>
                </div>
                <InfoCard icon="🔍" label="ANALYSE" bl={G.gold}><BodyText>{chatResult.kurzanalyse}</BodyText></InfoCard>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:9,marginBottom:9}}>
                  <InfoCard icon="✅" label="STÄRKEN" bl={G.green} small>{(chatResult.staerken||[]).map((s,i)=><SmText key={i}>· {s}</SmText>)}</InfoCard>
                  <InfoCard icon="⚡" label="VERBESSERN" bl="#e67e22" small>{(chatResult.verbesserungen||[]).map((v,i)=><SmText key={i}>· {v}</SmText>)}</InfoCard>
                </div>
                <InfoCard icon="🧠" label="PSYCHO-INSIGHT" bl="#9b59b6"><BodyText>{chatResult.psychoInsight}</BodyText></InfoCard>
                <InfoCard icon="🎯" label="NÄCHSTER SCHRITT" bl={G.rose}>
                  <div style={{fontFamily:"'Lato',sans-serif",color:G.rose2,fontSize:14,fontWeight:700,lineHeight:1.7}}>{chatResult.naechsterSchritt}</div>
                </InfoCard>
                <div style={{...glassCard,padding:"10px 14px",marginBottom:11,borderLeft:`2px solid ${G.gold2}`,borderColor:"rgba(212,175,55,.14)",background:"rgba(3,2,1,.7)"}}>
                  <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.4)"}}>⚔ PRINZIP · </span>
                  <span style={{fontFamily:"'Lato',sans-serif",fontSize:12,color:"rgba(245,237,232,.6)",fontStyle:"italic"}}>{chatResult.prinzip}</span>
                </div>
                <SL>ANTWORTEN IN {chatResult.detectedLanguage?.toUpperCase()||"CHAT-SPRACHE"}</SL>
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                  {chatResult.replies?.map((r,i)=>(
                    <div key={i} className="rc" onClick={()=>copyReply(r.text,i,r.label)}
                      style={{...glassCard,padding:"13px 15px",borderColor:copiedIdx===i?"rgba(212,175,55,.5)":"rgba(212,175,55,.14)",background:"rgba(3,2,1,.72)",boxShadow:copiedIdx===i?"0 0 20px rgba(212,175,55,.15)":"none"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:G.gold,opacity:.7}}>{r.label?.toUpperCase()}</span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,color:copiedIdx===i?G.gold:"rgba(212,175,55,.25)",transition:"color .2s"}}>{copiedIdx===i?"✓ KOPIERT":"COPY"}</span>
                      </div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:14,lineHeight:1.68,color:G.text,marginBottom:5}}>{r.text}</div>
                      {r.warum&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(212,175,55,.4)",fontStyle:"italic"}}>💡 {r.warum}</div>}
                    </div>
                  ))}
                </div>
                {/* FEEDBACK */}
                <div style={{...glassCard,padding:"16px",borderColor:"rgba(212,175,55,.2)",background:"rgba(3,2,1,.78)"}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.5)",textAlign:"center",marginBottom:4}}>🌐 COMMUNITY FEEDBACK</div>
                  <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:G.muted,textAlign:"center",marginBottom:14}}>Dein Feedback verbessert die App für alle Bruderschafts-Mitglieder</div>
                  {!feedback?(
                    <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                      {[["worked","✅  Hat geklappt!","rgba(92,184,122,.14)","rgba(92,184,122,.45)"],
                        ["mixed","➡️  Teils teils","rgba(230,126,34,.14)","rgba(230,126,34,.45)"],
                        ["failed","❌  Nicht geklappt","rgba(224,92,106,.14)","rgba(224,92,106,.45)"]].map(([type,label,bg,border])=>(
                        <button key={type} className="fbbtn" onClick={()=>markFeedback(type)}
                          style={{background:bg,border:`1px solid ${border}`,color:G.text,padding:"10px 18px",cursor:"pointer",borderRadius:22,fontFamily:"'Lato',sans-serif",fontSize:11,fontWeight:700,backdropFilter:"blur(8px)"}}>
                          {label}
                        </button>
                      ))}
                    </div>
                  ):(
                    <div style={{textAlign:"center",fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:2,color:G.gold}}>
                      {feedback==="worked"?"✅  Gespeichert – Community lernt daraus!":feedback==="mixed"?"➡️  Notiert.":"❌  Wichtiger Hinweis für zukünftige Analysen."}
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
            <SectionTitle icon="🌐" title="COMMUNITY STATS" sub="Gesammelte Erkenntnisse aus allen Analysen der Bruderschaft"/>
            {commStats&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
                  {[[commStats.total,"Analysen",G.gold],[commStats.worked,"Erfolge",G.green],[commStats.rate+"%","Erfolgsrate",G.rose]].map(([v,l,col])=>(
                    <div key={l} style={{...glassCard,padding:"14px 8px",textAlign:"center",background:"rgba(3,2,1,.75)"}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:22,fontWeight:900,color:col,marginBottom:3,textShadow:`0 0 14px ${col}55`}}>{v}</div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:8,color:G.muted,letterSpacing:1}}>{l.toUpperCase()}</div>
                    </div>
                  ))}
                </div>
                {commStats.bestTone&&(
                  <div style={{...glassCard,padding:"11px 16px",marginBottom:16,textAlign:"center",borderColor:"rgba(212,175,55,.25)",background:"rgba(3,2,1,.78)"}}>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.45)"}}>🏆 ERFOLGREICHSTER STIL · </span>
                    <span style={{fontFamily:"'Cinzel',serif",fontSize:12,color:G.gold,fontWeight:700}}>{commStats.bestTone.toUpperCase()}</span>
                  </div>
                )}
              </>
            )}
            {loadingComm?<Loader text="LADE COMMUNITY-DATEN…"/>:(
              commInsights.map((ins,i)=>(
                <div key={ins.id||i} style={{...glassCard,padding:"12px 15px",marginBottom:9,borderLeft:`3px solid ${G.gold}`,background:"rgba(3,2,1,.72)"}}>
                  <BodyText>{ins.insight}</BodyText>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    {ins.category&&<SmText>{ins.category.toUpperCase()}</SmText>}
                    <SmText>👍 {ins.upvotes}</SmText>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ══ HISTORY ══ */}
        {tab==="history"&&(
          <div style={{animation:"fadeUp .3s ease"}}>
            <SectionTitle icon="📊" title="MEIN VERLAUF" sub="Deine persönliche Analyse-Geschichte"/>
            {loadingHist?<Loader text="LADE…"/>:myHistory.length===0?(
              <div style={{textAlign:"center",padding:"40px 0",color:G.muted,fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3}}>NOCH KEINE ANALYSEN</div>
            ):myHistory.map((s,i)=>(
              <div key={s.id||i} style={{...glassCard,padding:"13px 15px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(3,2,1,.72)"}}>
                <div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:G.gold,marginBottom:3}}>{s.vibe_score} · {s.dynamik}</div>
                  <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:G.muted}}>{new Date(s.created_at).toLocaleDateString("de-DE")} · {s.tone}{s.situation?` · ${s.situation}`:""}</div>
                  {s.used_label&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:"rgba(212,175,55,.4)",marginTop:2}}>Genutzt: {s.used_label}</div>}
                </div>
                <div style={{fontSize:18}}>{s.feedback_type==="worked"?"✅":s.feedback_type==="failed"?"❌":s.feedback_type==="mixed"?"➡️":"⏳"}</div>
              </div>
            ))}
          </div>
        )}

        {/* ══ TIPS ══ */}
        {tab==="tips"&&(
          <div style={{animation:"fadeUp .3s ease"}}>
            <SectionTitle icon="💡" title="KOMMUNIKATIONS-PRINZIPIEN" sub="Was wirklich funktioniert – Psychologie und Community-Daten"/>
            {[
              ["⚡","Kürze erzeugt Spannung","Weniger schreiben als sie. 5 Sätze → 2. Leere erzeugt Neugier.","Reaktanz-Theorie: Menschen wollen mehr von dem was sie nicht vollständig haben."],
              ["💬","Opener: Spezifisch statt generisch","Konkreter Bezug auf ihr Profil. Nie generisch.","Spezifität unterscheidet dich von 90% der Männer."],
              ["😄","Humor der verbindet","Selbstironie und gemeinsames Lachen. Nie auf ihre Kosten.","Lachen baut Oxytocin auf – denselben Stoff wie Umarmungen."],
              ["🎯","Konkret statt vage","'Dienstag 19 Uhr, Café XY' statt 'lass uns mal treffen'.","Konkrete Einladungen zeigen Selbstsicherheit."],
              ["🌍","Sprich ihre Sprache","Antworte in der Sprache in der sie schreibt.","Sprachliche Anpassung baut unbewusst Vertrauen auf."],
              ["⏰","Timing ist alles","20-60 Min. Abstand zeigt: du hast ein Leben.","Konstante Sofortantworten senken deinen wahrgenommenen Wert."],
              ["🔍","Echtes Interesse schlägt alles","Frag konkret nach etwas das sie gesagt hat.","Menschen spüren sofort ob Interesse echt oder performt ist."],
              ["🚀","Der Move zur richtigen Zeit","Wenn der Vibe stimmt: Mach den Move. Zögern tötet Momentum.","Entschlossenheit ist attraktiv."],
            ].map(([icon,title,desc,science])=>(
              <div key={title} style={{...glassCard,padding:"13px 16px",marginBottom:9,borderLeft:`3px solid ${G.gold}`,background:"rgba(3,2,1,.72)"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                  <span style={{fontSize:16}}>{icon}</span>
                  <span style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:700,color:G.gold,letterSpacing:1}}>{title}</span>
                </div>
                <BodyText>{desc}</BodyText>
                <SmText>🔬 {science}</SmText>
              </div>
            ))}
          </div>
        )}

        <div style={{textAlign:"center",marginTop:30,fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:5,color:"rgba(212,175,55,.14)"}}>
          MANPOWER BRUDERSCHAFT · {localMem.totalAnalyses||0} ANALYSEN · {localMem.totalOpeners||0} OPENER
        </div>
      </div>
    </div>
  );
}

// ── COMPONENTS ───────────────────────────────────────────────────────────────
function StatBadge({val,label,color}){return(
  <div style={{textAlign:"center"}}>
    <span style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:900,color,textShadow:`0 0 12px ${color}66`}}>{val}</span>
    <span style={{fontFamily:"'Lato',sans-serif",fontSize:7,color:"rgba(245,237,232,.3)",letterSpacing:1,marginLeft:5}}>{label.toUpperCase()}</span>
  </div>
);}
function Divider(){return <div style={{width:1,height:18,background:"rgba(212,175,55,.2)"}}/>;}
function SL({children}){return <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.42)",marginBottom:10,textTransform:"uppercase"}}>{children}</div>;}
function SectionTitle({icon,title,sub}){return(
  <div style={{marginBottom:20}}>
    <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:5}}>
      <span style={{fontSize:17}}>{icon}</span>
      <span style={{fontFamily:"'Cinzel',serif",fontSize:13,fontWeight:700,color:G.gold,letterSpacing:2,textShadow:`0 0 16px ${G.gold}44`}}>{title}</span>
    </div>
    <div style={{fontFamily:"'Lato',sans-serif",fontSize:11,color:G.muted,lineHeight:1.6,paddingLeft:26}}>{sub}</div>
    <div style={{height:1,background:"linear-gradient(90deg,rgba(212,175,55,.35),rgba(201,103,125,.18),transparent)",marginTop:11}}/>
  </div>
);}
function MegaButton({children,onClick,disabled,icon}){return(
  <button className="mgbtn" onClick={onClick} disabled={disabled}
    style={{
      width:"100%",
      background:disabled
        ?"rgba(212,175,55,.06)"
        :"linear-gradient(135deg,#3d2800 0%,#7a5500 15%,#D4AF37 35%,#F5E27A 50%,#D4AF37 65%,#7a5500 85%,#3d2800 100%)",
      backgroundSize:"250% auto",
      border:disabled?"1px solid rgba(212,175,55,.12)":"none",
      borderRadius:12,
      padding:"17px 20px",
      color:disabled?"rgba(212,175,55,.22)":"#1a0d00",
      fontFamily:"'Cinzel',serif",
      fontWeight:900,
      fontSize:13,
      letterSpacing:5,
      cursor:disabled?"not-allowed":"pointer",
      marginBottom:20,
      animation:disabled?"none":"shimmer 3s linear infinite",
      boxShadow:disabled?"none":"0 6px 28px rgba(212,175,55,.4), 0 0 0 1px rgba(212,175,55,.25), inset 0 1px 0 rgba(255,248,200,.3)",
      textShadow:disabled?"none":"0 1px 3px rgba(0,0,0,.5)",
      position:"relative",
      overflow:"hidden",
    }}>
    {!disabled&&<div style={{position:"absolute",inset:0,background:"linear-gradient(to bottom,rgba(255,248,200,.12) 0%,transparent 50%)",pointerEvents:"none"}}/>}
    <span style={{position:"relative"}}>{icon} {children}</span>
  </button>
);}
function InfoCard({icon,label,bl,children,small}){return(
  <div style={{...glassCard,padding:small?"11px 13px":"13px 15px",marginBottom:10,borderLeft:`3px solid ${bl||G.gold}`,background:"rgba(3,2,1,.72)"}}>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.4)",marginBottom:small?5:9}}>{icon} {label}</div>
    {children}
  </div>
);}
function ScoreCard({label,val,color,right}){return(
  <div style={{...glassCard,flex:1,padding:"14px 15px",textAlign:right?"right":"left",background:"rgba(3,2,1,.75)"}}>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.4)",marginBottom:5}}>{label}</div>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:24,fontWeight:900,color,textShadow:`0 0 16px ${color}55`}}>{val}</div>
  </div>
);}
function BodyText({children}){return <p style={{fontFamily:"'Lato',sans-serif",color:"rgba(245,237,232,.74)",fontSize:13,lineHeight:1.76,margin:"0 0 3px"}}>{children}</p>;}
function SmText({children}){return <p style={{fontFamily:"'Lato',sans-serif",color:"rgba(245,237,232,.36)",fontSize:10,lineHeight:1.5,margin:"2px 0 2px",fontStyle:"italic"}}>{children}</p>;}
function Loader({text}){return(
  <div style={{textAlign:"center",padding:"22px 0"}}>
    <div style={{width:36,height:36,margin:"0 auto 11px",border:"2px solid rgba(212,175,55,.12)",borderTopColor:G.gold,borderRightColor:"rgba(212,175,55,.4)",borderRadius:"50%",animation:"spin 0.9s linear infinite"}}/>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.42)",animation:"pulse 1.5s ease infinite"}}>{text}</div>
  </div>
);}
function ErrBox({children}){return <div style={{background:"rgba(224,92,106,.08)",border:"1px solid rgba(224,92,106,.22)",borderRadius:10,padding:"11px 15px",color:"#ff8a95",fontFamily:"'Lato',sans-serif",fontSize:12,marginBottom:14,backdropFilter:"blur(8px)"}}>{children}</div>;}
