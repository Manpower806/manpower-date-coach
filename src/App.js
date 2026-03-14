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
const STORAGE_KEY = "mp_local_v6";
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
function fileToB64(file, maxWidth=1200, quality=0.72) {
  return new Promise((res,rej)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement("canvas");
        let w=img.width, h=img.height;
        if(w>maxWidth){h=Math.round(h*maxWidth/w);w=maxWidth;}
        canvas.width=w; canvas.height=h;
        canvas.getContext("2d").drawImage(img,0,0,w,h);
        const dataUrl=canvas.toDataURL("image/jpeg",quality);
        res({base64:dataUrl.split(",")[1],mediaType:"image/jpeg",dataUrl});
      };
      img.onerror=rej;
      img.src=e.target.result;
    };
    reader.onerror=rej;
    reader.readAsDataURL(file);
  });
}

// Upload dataUrl to Supabase Storage and return public URL
async function uploadDataUrlToStorage(supabaseClient, dataUrl, folder="images") {
  const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
  // Compress dataUrl via canvas
  const blob = await new Promise(res=>{
    const img = new Image();
    img.onload = ()=>{
      const c = document.createElement("canvas");
      let w=img.width, h=img.height;
      const maxW=1080;
      if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
      c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      c.toBlob(b=>res(b),"image/jpeg",0.75);
    };
    img.src=dataUrl;
  });
  const {error} = await supabaseClient.storage
    .from("bible-images")
    .upload(fileName, blob, {contentType:"image/jpeg", upsert:false});
  if(error) throw new Error(error.message);
  const {data:urlData} = supabaseClient.storage.from("bible-images").getPublicUrl(fileName);
  return urlData.publicUrl;
}

const G = {
  gold:"#D4AF37", gold2:"#8B6914", gold3:"#F5E27A",
  rose:"#c9677d", rose2:"#e8a0b0",
  text:"#f5ede8", muted:"rgba(245,237,232,.42)",
  green:"#5cb87a", red:"#e05c6a",
};
const gc = {
  background:"rgba(5,3,1,0.78)",
  backdropFilter:"blur(20px)",
  WebkitBackdropFilter:"blur(20px)",
  border:"1px solid rgba(212,175,55,.18)",
  borderRadius:12,
};

export default function App({ user, onLogout }) {
  const isAdmin = user?.username?.toLowerCase() === ADMIN_USERNAME;
  const [mainTab, setMainTab] = useState(null); // null=menu, coach, bible
  const [tab, setTab] = useState("opener");
  const [tone, setTone] = useState("charming");
  const [localMem, setLocalMem] = useState(loadLocal);
  const apiKey = process.env.REACT_APP_ANTHROPIC_KEY || "";

  // opener
  const [profileImgs, setProfileImgs] = useState([]);
  const [profileNote, setProfileNote] = useState("");
  const [openerLang, setOpenerLang] = useState("auto");
  const [genOpener, setGenOpener] = useState(false);
  const [openerResult, setOpenerResult] = useState(null);
  const [openerErr, setOpenerErr] = useState(null);
  const [openerDrag, setOpenerDrag] = useState(false);
  const [copiedOpener, setCopiedOpener] = useState(null);
  const profileRef = useRef();

  // analyse
  const [chatImg, setChatImg] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [chatResult, setChatResult] = useState(null);
  const [chatErr, setChatErr] = useState(null);
  const [chatDrag, setChatDrag] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const chatRef = useRef();

  // community + history
  const [commStats, setCommStats] = useState(null);
  const [commInsights, setCommInsights] = useState([]);
  const [loadingComm, setLoadingComm] = useState(false);
  const [myHistory, setMyHistory] = useState([]);
  const [loadingHist, setLoadingHist] = useState(false);

  // bible
  const [bibleEntries, setBibleEntries] = useState([]);
  const [loadingBible, setLoadingBible] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [showNewPost, setShowNewPost] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newImages, setNewImages] = useState([]); // up to 20
  const [blendModes, setBlendModes] = useState([]); // per-image blend mode
  const [newBgImage, setNewBgImage] = useState(null);
  const [useBgImage, setUseBgImage] = useState(false);
  const [savingPost, setSavingPost] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const bibleImageRef = useRef();
  const bibleBgRef = useRef();
  const [carouselIdx, setCarouselIdx] = useState(0);

  useEffect(()=>{
    if(mainTab==="bible") loadBible();
    if(tab==="community") loadComm();
    if(tab==="history") loadHist();
  },[mainTab, tab]);

  const loadBible = async()=>{
    setLoadingBible(true);
    const{data}=await supabase.from("library").select("*").order("created_at",{ascending:false});
    if(data) setBibleEntries(data);
    setLoadingBible(false);
  };

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

  // Bible functions
  const handleBgImage = async(file)=>{
    if(!file||!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => setNewBgImage({dataUrl: e.target.result});
    reader.readAsDataURL(file);
  };

  const handleBibleImages = async(files)=>{
    const arr = Array.from(files).filter(f=>f.type.startsWith("image/")).slice(0,20);
    const conv = await Promise.all(arr.map(file=>new Promise(res=>{
      const reader=new FileReader();
      reader.onload=e=>res({dataUrl:e.target.result});
      reader.readAsDataURL(file);
    })));
    setNewImages(prev=>[...prev,...conv].slice(0,20));
  };

  const savePost = async()=>{
    if(!newTitle.trim()&&!newContent.trim()&&newImages.length===0) return;
    setSavingPost(true);
    try {
      const imageUrls = [];
      for(let i=0; i<newImages.length; i++){
        setSaveStatus(`BILD ${i+1} VON ${newImages.length}…`);
        const url = await uploadDataUrlToStorage(supabase, newImages[i].dataUrl, "images");
        imageUrls.push(url);
      }
      let bgUrl = null;
      if(useBgImage && newBgImage?.dataUrl){
        setSaveStatus("HINTERGRUNDBILD…");
        bgUrl = await uploadDataUrlToStorage(supabase, newBgImage.dataUrl, "backgrounds");
      }
      setSaveStatus("SPEICHERE…");
      const {error} = await supabase.from("library").insert({
        title: newTitle.trim(),
        content: newContent.trim(),
        image_url: imageUrls.length>0 ? JSON.stringify(imageUrls) : null,
        bg_image: bgUrl || null,
        blend_modes: blendModes.length>0 ? JSON.stringify(blendModes) : null,
        created_by: user.username,
      });
      if(error){ alert("Fehler: "+error.message); setSavingPost(false); setSaveStatus(""); return; }
      setNewTitle(""); setNewContent(""); setNewImages([]); setBlendModes([]); setNewBgImage(null); setUseBgImage(false); setShowNewPost(false);
      await loadBible();
    } catch(e){
      alert("Fehler beim Speichern: "+e.message);
    }
    setSavingPost(false);
    setSaveStatus("");
  };

  const openEntry = (entry)=>{ setSelectedEntry(entry); setCarouselIdx(0); setEditingEntry(null); };

  const startEdit = (entry)=>{
    setEditingEntry(entry);
    setNewTitle(entry.title||"");
    setNewContent(entry.content||"");
    setNewImages([]); // Can't restore old images to file objects, user re-uploads if needed
    setBlendModes(entry.blend_modes?JSON.parse(entry.blend_modes):[]);
    setUseBgImage(!!entry.bg_image);
    setNewBgImage(entry.bg_image?{dataUrl:entry.bg_image}:null);
  };

  const saveEdit = async()=>{
    if(!editingEntry) return;
    setSavingPost(true);
    try {
      const imageUrls = [];
      // Upload any new images added during edit
      for(let i=0; i<newImages.length; i++){
        setSaveStatus(`BILD ${i+1} VON ${newImages.length}…`);
        const url = await uploadDataUrlToStorage(supabase, newImages[i].dataUrl, "images");
        imageUrls.push(url);
      }
      // Keep existing images if no new ones added
      let finalImageUrl = editingEntry.image_url;
      if(imageUrls.length>0){
        // Merge with existing
        let existing = [];
        try{ existing = JSON.parse(editingEntry.image_url||"[]"); }catch{}
        finalImageUrl = JSON.stringify([...existing, ...imageUrls]);
      }
      let bgUrl = editingEntry.bg_image;
      if(useBgImage && newBgImage?.dataUrl && newBgImage.dataUrl !== editingEntry.bg_image){
        setSaveStatus("HINTERGRUNDBILD…");
        bgUrl = await uploadDataUrlToStorage(supabase, newBgImage.dataUrl, "backgrounds");
      }
      if(!useBgImage) bgUrl = null;
      setSaveStatus("SPEICHERE…");
      const {error} = await supabase.from("library").update({
        title: newTitle.trim()||editingEntry.title,
        content: newContent.trim(),
        image_url: finalImageUrl,
        bg_image: bgUrl,
        blend_modes: blendModes.length>0 ? JSON.stringify(blendModes) : null,
      }).eq("id", editingEntry.id);
      if(error){ alert("Fehler: "+error.message); setSavingPost(false); setSaveStatus(""); return; }
      await loadBible();
      // Refresh selected entry
      const {data} = await supabase.from("library").select("*").eq("id",editingEntry.id).single();
      if(data){ setSelectedEntry(data); setCarouselIdx(0); }
      setEditingEntry(null);
      setNewTitle(""); setNewContent(""); setNewImages([]); setBlendModes([]); setNewBgImage(null); setUseBgImage(false);
    } catch(e){ alert("Fehler: "+e.message); }
    setSavingPost(false);
    setSaveStatus("");
  };

  const deletePost = async(id)=>{
    setDeletingId(id);
    await supabase.from("library").delete().eq("id",id);
    await loadBible();
    if(selectedEntry?.id===id) setSelectedEntry(null);
    setDeletingId(null);
  };

  // Opener
  const handleProfileFiles=async files=>{
    const arr=Array.from(files).filter(f=>f.type.startsWith("image/")).slice(0,5);
    const conv=await Promise.all(arr.map(fileToB64));
    setProfileImgs(prev=>[...prev,...conv].slice(0,5));
    setOpenerResult(null);setOpenerErr(null);
  };
  const onProfileDrop=useCallback(async e=>{e.preventDefault();setOpenerDrag(false);await handleProfileFiles(e.dataTransfer.files);},[]);

  const generateOpener=async()=>{
    if(!profileImgs.length&&!profileNote.trim()){setOpenerErr("Bitte Bild oder Beschreibung eingeben.");return;}
    if(!apiKey.trim()){setOpenerErr("API Key nicht konfiguriert.");return;}
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

  const COACH_TABS=[["opener","💬"],["analyze","⚔"],["community","🌐"],["history","📊"],["tips","💡"]];
  const COACH_LABELS={opener:"Opener",analyze:"Analyse",community:"Community",history:"Verlauf",tips:"Prinzipien"};

  return (
    <div style={{minHeight:"100vh",color:G.text,fontFamily:"Georgia,serif",overflowX:"hidden",position:"relative",maxWidth:"100vw"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Lato:wght@300;400;700&display=swap');
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:-250% center}100%{background-position:250% center}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}
        @keyframes glow{0%,100%{box-shadow:0 0 12px rgba(212,175,55,.25)}50%{box-shadow:0 0 30px rgba(212,175,55,.6)}}
        @keyframes heartbeat{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
        body{margin:0;padding:0;}
        .mgbtn:not(:disabled):hover{transform:translateY(-3px)!important;filter:brightness(1.12)!important;}
        .mgbtn:not(:disabled):active{transform:translateY(0)!important;}
        .mgbtn{transition:all .25s!important;}
        .rc{transition:all .2s;cursor:pointer;}
        .rc:active{background:rgba(212,175,55,.1)!important;}
        .tp{transition:all .18s;cursor:pointer;}
        .dz{transition:all .22s;cursor:pointer;}
        .fbbtn{transition:all .18s;cursor:pointer;}
        .fbbtn:active{transform:scale(.97)!important;}
        .maintab{transition:all .2s;cursor:pointer;}
        input,textarea{outline:none;-webkit-appearance:none;}
        ::placeholder{color:rgba(245,237,232,.22);}
        ::-webkit-scrollbar{width:2px;}
        ::-webkit-scrollbar-thumb{background:#D4AF37;border-radius:2px;}
      `}</style>

      {/* BG */}
      <div style={{position:"fixed",inset:0,zIndex:0,backgroundImage:"url('/bg.jpg')",backgroundSize:"cover",backgroundPosition:"center top",backgroundAttachment:"scroll"}}/>
      <div style={{position:"fixed",inset:0,zIndex:1,background:"linear-gradient(to bottom,rgba(3,2,1,0.82) 0%,rgba(3,2,1,0.76) 50%,rgba(3,2,1,0.88) 100%)"}}/>
      <div style={{position:"fixed",inset:0,zIndex:2,background:"radial-gradient(ellipse 100% 30% at 50% 0%,rgba(212,175,55,.09) 0%,transparent 60%)",pointerEvents:"none"}}/>

      <div style={{position:"relative",zIndex:3,maxWidth:480,margin:"0 auto",padding:"0 12px 80px"}}>

        {/* HEADER */}
        <header style={{textAlign:"center",padding:"20px 0 16px",marginBottom:14,position:"relative"}}>
          <div style={{position:"absolute",bottom:0,left:"5%",right:"5%",height:1,background:"linear-gradient(90deg,transparent,rgba(212,175,55,.3),rgba(212,175,55,.3),transparent)"}}/>
          <div style={{width:54,height:54,margin:"0 auto 8px",position:"relative"}}>
            <div style={{width:"100%",height:"100%",border:"2px solid",borderColor:G.gold,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(3,2,1,0.7)",backdropFilter:"blur(10px)",animation:"glow 4s ease infinite"}}>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:21,fontWeight:900,background:`linear-gradient(135deg,${G.gold3},${G.gold})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>M</span>
            </div>
            <div style={{position:"absolute",top:-2,right:-1,width:9,height:9,background:G.rose,borderRadius:"50%",border:"2px solid rgba(3,2,1,.9)",animation:"heartbeat 2s ease infinite"}}/>
          </div>
          <div style={{fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:"clamp(18px,5vw,26px)",letterSpacing:5,background:`linear-gradient(90deg,${G.gold2},${G.gold},${G.gold3},${G.gold},${G.gold2})`,backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",animation:"shimmer 5s linear infinite",marginBottom:2}}>MANPOWER</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:7,color:"rgba(212,175,55,.45)",marginBottom:10}}>BRUDERSCHAFT</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:"rgba(212,175,55,.4)"}}>{isAdmin?"👑":"👤"} {user?.username?.toUpperCase()}</span>
            <span style={{color:"rgba(212,175,55,.2)",fontSize:10}}>|</span>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:1,color:"rgba(212,175,55,.35)"}}>{localMem.totalAnalyses||0} Analysen · {localMem.totalOpeners||0} Opener</span>
            <button onClick={onLogout} style={{...gc,background:"rgba(3,2,1,.6)",color:"rgba(212,175,55,.4)",padding:"3px 10px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,borderRadius:16,border:"1px solid rgba(212,175,55,.15)"}}>LOGOUT</button>
          </div>
        </header>

        {/* MAIN TAB SWITCHER */}
        {!mainTab ? (
          <div style={{display:"flex",flexDirection:"column",gap:14,marginTop:10,marginBottom:16}}>
            {[["coach","🍑🫦","KI DATE COACH","Opener · Analyse · Community"],["bible","📖","MANPOWER-BIBEL","Wissen · Prinzipien · Lektionen"]].map(([key,icon,label,sub])=>(
              <div key={key} className="maintab" onClick={()=>setMainTab(key)}
                style={{...gc,padding:"30px 20px",textAlign:"center",cursor:"pointer",
                  background:"rgba(3,2,1,.78)",borderColor:"rgba(212,175,55,.22)",
                  position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 80% 60% at 50% 0%,rgba(212,175,55,.07),transparent 70%)",pointerEvents:"none"}}/>
                <div style={{fontSize:40,marginBottom:10}}>{icon}</div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:15,fontWeight:900,letterSpacing:3,
                  background:"linear-gradient(90deg,#8B6914,#D4AF37,#F5E27A,#D4AF37,#8B6914)",
                  backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
                  backgroundClip:"text",animation:"shimmer 4s linear infinite",marginBottom:7}}>{label}</div>
                <div style={{fontFamily:"'Lato',sans-serif",fontSize:12,color:"rgba(212,175,55,.45)",letterSpacing:1,marginBottom:14}}>{sub}</div>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:3,color:"rgba(212,175,55,.5)",
                  border:"1px solid rgba(212,175,55,.22)",borderRadius:18,padding:"5px 16px",display:"inline-block"}}>
                  BETRETEN →
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <button onClick={()=>setMainTab(null)}
              style={{...gc,background:"rgba(3,2,1,.7)",color:"rgba(212,175,55,.45)",padding:"8px 14px",
                cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2,
                border:"1px solid rgba(212,175,55,.18)",borderRadius:10,whiteSpace:"nowrap"}}>← MENÜ</button>
            <div style={{...gc,flex:1,padding:"9px 12px",textAlign:"center",
              background:"rgba(212,175,55,.1)",borderColor:"rgba(212,175,55,.4)"}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:9,fontWeight:700,letterSpacing:2,color:"#D4AF37"}}>
                {mainTab==="coach"?"🍑🫦  KI DATE COACH":"📖  MANPOWER-BIBEL"}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════ */}
        {/* MAIN: KI DATE COACH           */}
        {/* ══════════════════════════════ */}
        {mainTab==="coach"&&(
          <div style={{animation:"fadeUp .3s ease"}}>
            {/* Tone */}
            <div style={{...gc,padding:"8px",marginBottom:12,background:"rgba(3,2,1,.72)"}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:3,color:"rgba(212,175,55,.38)",textAlign:"center",marginBottom:6}}>KOMMUNIKATIONSSTIL</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
                {TONES.map(t=>(
                  <div key={t.key} className="tp" onClick={()=>setTone(t.key)}
                    style={{...gc,padding:"9px 4px",textAlign:"center",background:tone===t.key?"rgba(212,175,55,.13)":"rgba(3,2,1,.5)",borderColor:tone===t.key?"rgba(212,175,55,.5)":"rgba(212,175,55,.1)",boxShadow:tone===t.key?"0 0 14px rgba(212,175,55,.15)":"none"}}>
                    <div style={{fontSize:16,marginBottom:2}}>{t.emoji}</div>
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:1,color:tone===t.key?G.gold:"rgba(212,175,55,.35)"}}>{t.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Coach sub-tabs */}
            <div style={{...gc,display:"flex",marginBottom:14,padding:"0 4px",background:"rgba(3,2,1,.78)",overflowX:"auto"}}>
              {COACH_TABS.map(([key,icon])=>(
                <div key={key} className="tp" onClick={()=>setTab(key)}
                  style={{flex:1,padding:"9px 4px",textAlign:"center",fontFamily:"'Cinzel',serif",fontSize:11,
                    color:tab===key?G.gold:"rgba(212,175,55,.3)",
                    borderBottom:tab===key?`2px solid ${G.gold}`:"2px solid transparent",
                    marginBottom:-1,minWidth:44}}>
                  <div>{icon}</div>
                  <div style={{fontSize:5,letterSpacing:1,marginTop:1}}>{COACH_LABELS[key].toUpperCase()}</div>
                </div>
              ))}
            </div>

            {/* ── OPENER ── */}
            {tab==="opener"&&(
              <div style={{animation:"fadeUp .3s ease"}}>
                <SecTitle icon="💬" title="OPENER GENERATOR" sub="Profilbilder hochladen → 5 Nachrichten in ihrer Sprache"/>

                <SL>🌍 SPRACHE</SL>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:12}}>
                  {LANGS.map(([k,l])=>(
                    <div key={k} className="tp" onClick={()=>setOpenerLang(k)}
                      style={{...gc,padding:"4px 9px",borderRadius:16,fontFamily:"'Lato',sans-serif",fontSize:11,color:openerLang===k?G.gold:"rgba(212,175,55,.38)",borderColor:openerLang===k?"rgba(212,175,55,.45)":"rgba(212,175,55,.1)",background:openerLang===k?"rgba(212,175,55,.1)":"rgba(3,2,1,.6)"}}>
                      {l}
                    </div>
                  ))}
                </div>

                <SL>📸 PROFILBILDER (bis zu 5)</SL>
                <div className="dz"
                  style={{...gc,padding:"20px 16px",textAlign:"center",marginBottom:8,borderStyle:"dashed",borderColor:openerDrag?"rgba(212,175,55,.5)":"rgba(212,175,55,.16)",background:"rgba(3,2,1,.6)"}}
                  onClick={()=>profileRef.current?.click()}
                  onDragOver={e=>{e.preventDefault();setOpenerDrag(true);}}
                  onDragLeave={()=>setOpenerDrag(false)}
                  onDrop={onProfileDrop}>
                  <div style={{fontSize:22,marginBottom:6,opacity:.5}}>📸</div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:1,color:G.gold,marginBottom:2}}>Profilbilder hinzufügen</div>
                  <div style={{fontFamily:"'Lato',sans-serif",color:G.muted,fontSize:11}}>Bio · Fotos · Hobbys</div>
                </div>
                <input ref={profileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={async e=>await handleProfileFiles(e.target.files)}/>

                {profileImgs.length>0&&(
                  <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4,marginBottom:10}}>
                    {profileImgs.map((img,i)=>(
                      <div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",border:"1px solid rgba(212,175,55,.2)"}}>
                        <img src={img.dataUrl} alt="" style={{width:"100%",height:56,objectFit:"cover",display:"block"}}/>
                        <button onClick={()=>setProfileImgs(prev=>prev.filter((_,j)=>j!==i))}
                          style={{position:"absolute",top:2,right:2,background:"rgba(0,0,0,.85)",border:"none",color:"#ff7b7b",width:16,height:16,borderRadius:"50%",cursor:"pointer",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                      </div>
                    ))}
                    {profileImgs.length<5&&<div className="dz" onClick={()=>profileRef.current?.click()} style={{height:56,border:"1px dashed rgba(212,175,55,.2)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(212,175,55,.3)",fontSize:18,background:"rgba(3,2,1,.5)"}}>+</div>}
                  </div>
                )}

                <SL>✍️ PROFIL BESCHREIBEN (optional)</SL>
                <textarea value={profileNote} onChange={e=>setProfileNote(e.target.value)}
                  placeholder="z.B. Sie ist 26, Ärztin, liebt Reisen. Bio: 'Kaffee > Menschen'."
                  rows={3} style={{...gc,width:"100%",padding:"9px 11px",color:G.text,fontFamily:"'Lato',sans-serif",fontSize:13,resize:"none",lineHeight:1.6,marginBottom:14,borderColor:"rgba(212,175,55,.14)",background:"rgba(3,2,1,.65)"}}/>

                <MBtn onClick={generateOpener} disabled={genOpener}>
                  {genOpener?"✨  GENERIERE…":"💬  OPENER GENERIEREN"}
                </MBtn>

                {genOpener&&<Spin text="KI ANALYSIERT PROFIL…"/>}
                {openerErr&&<Err>{openerErr}</Err>}

                {openerResult&&(
                  <div style={{animation:"fadeUp .35s ease"}}>
                    <Card icon="🌍" label="SPRACHE" bl={G.rose}><div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:G.rose2}}>{openerResult.detectedLanguage}</div></Card>
                    <Card icon="🔍" label="PROFIL-ANALYSE" bl={G.gold}><Bod>{openerResult.profileAnalysis}</Bod></Card>
                    <SL>💬 ANTIPPEN ZUM KOPIEREN</SL>
                    <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:12}}>
                      {openerResult.openers?.map((o,i)=>(
                        <div key={i} className="rc" onClick={()=>copyOpener(o.text,i)}
                          style={{...gc,padding:"12px 13px",borderColor:copiedOpener===i?"rgba(212,175,55,.45)":"rgba(212,175,55,.14)",background:"rgba(3,2,1,.75)"}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                            <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:G.gold,opacity:.7}}>{o.style?.toUpperCase()}</span>
                            <span style={{fontFamily:"'Cinzel',serif",fontSize:7,color:copiedOpener===i?G.gold:"rgba(212,175,55,.25)"}}>{copiedOpener===i?"✓":"COPY"}</span>
                          </div>
                          <div style={{fontFamily:"'Lato',sans-serif",fontSize:14,lineHeight:1.6,color:G.text,marginBottom:5,fontWeight:500}}>{o.text}</div>
                          {o.warum&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(212,175,55,.4)",fontStyle:"italic"}}>💡 {o.warum}</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7,marginBottom:10}}>
                      <Card icon="💡" label="TIPP" bl={G.green}><Bod>{openerResult.profilTipp}</Bod></Card>
                      <Card icon="🚫" label="VERMEIDEN" bl={G.red}><Bod>{openerResult.vermeiden}</Bod></Card>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <button onClick={()=>{setProfileImgs([]);setProfileNote("");setOpenerResult(null);setOpenerLang("auto");}}
                        style={{...gc,background:"rgba(3,2,1,.7)",color:"rgba(212,175,55,.4)",padding:"6px 18px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,borderRadius:18,border:"1px solid rgba(212,175,55,.14)"}}>
                        🔄 NEUES PROFIL
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── ANALYSE ── */}
            {tab==="analyze"&&(
              <div style={{animation:"fadeUp .3s ease"}}>
                <SecTitle icon="⚔" title="CHAT-ANALYSE" sub="Screenshot → KI erkennt Sprache → Antworten in Chat-Sprache"/>
                <div className="dz"
                  style={{...gc,padding:chatImg?0:"32px 18px",textAlign:"center",cursor:chatImg?"default":"pointer",marginBottom:14,overflow:"hidden",borderColor:chatDrag?"rgba(212,175,55,.45)":"rgba(212,175,55,.14)",background:"rgba(3,2,1,.65)"}}
                  onClick={()=>!chatImg&&chatRef.current?.click()}
                  onDragOver={e=>{e.preventDefault();setChatDrag(true);}}
                  onDragLeave={()=>setChatDrag(false)}
                  onDrop={onChatDrop}>
                  {chatImg?(
                    <div style={{position:"relative"}}>
                      <img src={chatImg.dataUrl} alt="" style={{width:"100%",maxHeight:240,objectFit:"cover",display:"block"}}/>
                      <div style={{position:"absolute",inset:0,background:"linear-gradient(to top,rgba(3,2,1,.65) 0%,transparent 45%)"}}/>
                      <div style={{position:"absolute",bottom:9,left:11,right:11,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:G.gold}}>✓ BEREIT</span>
                        <button onClick={e=>{e.stopPropagation();setChatImg(null);setChatResult(null);setFeedback(null);}}
                          style={{background:"rgba(0,0,0,.8)",border:"1px solid rgba(212,175,55,.25)",color:G.gold,padding:"3px 8px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,borderRadius:4}}>ÄNDERN</button>
                      </div>
                    </div>
                  ):(
                    <>
                      <div style={{fontSize:22,marginBottom:7,opacity:.45}}>📸</div>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:11,letterSpacing:1,color:G.gold,marginBottom:2}}>Chat-Screenshot hinzufügen</div>
                      <div style={{fontFamily:"'Lato',sans-serif",color:G.muted,fontSize:11}}>Tippen oder ziehen</div>
                    </>
                  )}
                </div>
                <input ref={chatRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleChatFile(e.target.files[0])}/>
                <MBtn onClick={analyzeChat} disabled={!chatImg||analyzing}>
                  {analyzing?"✨  ANALYSIERE…":"⚔  TIEFENANALYSE STARTEN"}
                </MBtn>
                {analyzing&&<Spin text="KI ANALYSIERT…"/>}
                {chatErr&&<Err>{chatErr}</Err>}
                {chatResult&&(
                  <div style={{animation:"fadeUp .38s ease"}}>
                    {chatResult.detectedLanguage&&(
                      <div style={{...gc,padding:"7px 12px",marginBottom:8,display:"flex",alignItems:"center",gap:7,background:"rgba(3,2,1,.72)"}}>
                        <span>🌍</span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:"rgba(212,175,55,.42)"}}>SPRACHE · </span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:G.gold,fontWeight:700}}>{chatResult.detectedLanguage}</span>
                      </div>
                    )}
                    <div style={{display:"flex",gap:6,marginBottom:8}}>
                      <ScCard label="VIBE" val={chatResult.vibeScore} color={G.gold}/>
                      <ScCard label="DYNAMIK" val={chatResult.dynamik} color={POWER_COLORS[chatResult.dynamik]||G.gold} right/>
                    </div>
                    <Card icon="🔍" label="ANALYSE" bl={G.gold}><Bod>{chatResult.kurzanalyse}</Bod></Card>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:7}}>
                      <Card icon="✅" label="STÄRKEN" bl={G.green} sm>{(chatResult.staerken||[]).map((s,i)=><Sm key={i}>· {s}</Sm>)}</Card>
                      <Card icon="⚡" label="VERBESSERN" bl="#e67e22" sm>{(chatResult.verbesserungen||[]).map((v,i)=><Sm key={i}>· {v}</Sm>)}</Card>
                    </div>
                    <Card icon="🧠" label="PSYCHO-INSIGHT" bl="#9b59b6"><Bod>{chatResult.psychoInsight}</Bod></Card>
                    <Card icon="🎯" label="NÄCHSTER SCHRITT" bl={G.rose}>
                      <div style={{fontFamily:"'Lato',sans-serif",color:G.rose2,fontSize:13,fontWeight:700,lineHeight:1.65}}>{chatResult.naechsterSchritt}</div>
                    </Card>
                    <SL>ANTWORTEN — ANTIPPEN</SL>
                    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                      {chatResult.replies?.map((r,i)=>(
                        <div key={i} className="rc" onClick={()=>copyReply(r.text,i,r.label)}
                          style={{...gc,padding:"11px 12px",borderColor:copiedIdx===i?"rgba(212,175,55,.45)":"rgba(212,175,55,.12)",background:"rgba(3,2,1,.74)"}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                            <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:G.gold,opacity:.65}}>{r.label?.toUpperCase()}</span>
                            <span style={{fontFamily:"'Cinzel',serif",fontSize:7,color:copiedIdx===i?G.gold:"rgba(212,175,55,.22)"}}>{copiedIdx===i?"✓":"COPY"}</span>
                          </div>
                          <div style={{fontFamily:"'Lato',sans-serif",fontSize:14,lineHeight:1.6,color:G.text,marginBottom:4}}>{r.text}</div>
                          {r.warum&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(212,175,55,.38)",fontStyle:"italic"}}>💡 {r.warum}</div>}
                        </div>
                      ))}
                    </div>
                    <div style={{...gc,padding:"12px",borderColor:"rgba(212,175,55,.18)",background:"rgba(3,2,1,.78)"}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.45)",textAlign:"center",marginBottom:3}}>🌐 COMMUNITY FEEDBACK</div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:G.muted,textAlign:"center",marginBottom:10}}>Verbessert die App für alle</div>
                      {!feedback?(
                        <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
                          {[["worked","✅ Geklappt","rgba(92,184,122,.14)","rgba(92,184,122,.4)"],
                            ["mixed","➡️ Teils","rgba(230,126,34,.14)","rgba(230,126,34,.4)"],
                            ["failed","❌ Nicht","rgba(224,92,106,.14)","rgba(224,92,106,.4)"]].map(([type,label,bg,border])=>(
                            <button key={type} className="fbbtn" onClick={()=>markFeedback(type)}
                              style={{background:bg,border:`1px solid ${border}`,color:G.text,padding:"8px 14px",cursor:"pointer",borderRadius:18,fontFamily:"'Lato',sans-serif",fontSize:11,fontWeight:700}}>
                              {label}
                            </button>
                          ))}
                        </div>
                      ):(
                        <div style={{textAlign:"center",fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2,color:G.gold}}>
                          {feedback==="worked"?"✅ Gespeichert!":feedback==="mixed"?"➡️ Notiert.":"❌ Notiert."}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── COMMUNITY ── */}
            {tab==="community"&&(
              <div style={{animation:"fadeUp .3s ease"}}>
                <SecTitle icon="🌐" title="COMMUNITY STATS" sub="Gesammelte Erkenntnisse der Bruderschaft"/>
                {commStats&&(
                  <>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:10}}>
                      {[[commStats.total,"Analysen",G.gold],[commStats.worked,"Erfolge",G.green],[commStats.rate+"%","Rate",G.rose]].map(([v,l,col])=>(
                        <div key={l} style={{...gc,padding:"11px 6px",textAlign:"center",background:"rgba(3,2,1,.75)"}}>
                          <div style={{fontFamily:"'Cinzel',serif",fontSize:18,fontWeight:900,color:col,marginBottom:2}}>{v}</div>
                          <div style={{fontFamily:"'Lato',sans-serif",fontSize:8,color:G.muted,letterSpacing:1}}>{l.toUpperCase()}</div>
                        </div>
                      ))}
                    </div>
                    {commStats.bestTone&&(
                      <div style={{...gc,padding:"9px 13px",marginBottom:12,textAlign:"center",background:"rgba(3,2,1,.75)"}}>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:"rgba(212,175,55,.42)"}}>🏆 BESTER STIL · </span>
                        <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:G.gold,fontWeight:700}}>{commStats.bestTone.toUpperCase()}</span>
                      </div>
                    )}
                  </>
                )}
                {loadingComm?<Spin text="LADE…"/>:commInsights.map((ins,i)=>(
                  <div key={ins.id||i} style={{...gc,padding:"10px 13px",marginBottom:7,borderLeft:`2px solid ${G.gold}`,background:"rgba(3,2,1,.72)"}}>
                    <Bod>{ins.insight}</Bod>
                    <div style={{display:"flex",justifyContent:"space-between"}}>
                      {ins.category&&<Sm>{ins.category.toUpperCase()}</Sm>}
                      <Sm>👍 {ins.upvotes}</Sm>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── HISTORY ── */}
            {tab==="history"&&(
              <div style={{animation:"fadeUp .3s ease"}}>
                <SecTitle icon="📊" title="MEIN VERLAUF" sub="Deine Analyse-Geschichte"/>
                {loadingHist?<Spin text="LADE…"/>:myHistory.length===0?(
                  <div style={{textAlign:"center",padding:"32px 0",color:G.muted,fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3}}>NOCH KEINE ANALYSEN</div>
                ):myHistory.map((s,i)=>(
                  <div key={s.id||i} style={{...gc,padding:"11px 13px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",background:"rgba(3,2,1,.72)"}}>
                    <div>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:G.gold,marginBottom:2}}>{s.vibe_score} · {s.dynamik}</div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:G.muted}}>{new Date(s.created_at).toLocaleDateString("de-DE")} · {s.tone}{s.situation?` · ${s.situation}`:""}</div>
                    </div>
                    <div style={{fontSize:15}}>{s.feedback_type==="worked"?"✅":s.feedback_type==="failed"?"❌":s.feedback_type==="mixed"?"➡️":"⏳"}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ── TIPS ── */}
            {tab==="tips"&&(
              <div style={{animation:"fadeUp .3s ease"}}>
                <SecTitle icon="💡" title="PRINZIPIEN" sub="Was wirklich funktioniert"/>
                {[
                  ["⚡","Kürze erzeugt Spannung","Weniger schreiben als sie. Leere erzeugt Neugier."],
                  ["💬","Spezifisch statt generisch","Konkreter Bezug auf ihr Profil. Nie generisch."],
                  ["😄","Humor der verbindet","Selbstironie. Nie auf ihre Kosten."],
                  ["🎯","Konkret statt vage","'Dienstag 19 Uhr, Café XY' statt vage Floskeln."],
                  ["🌍","Sprich ihre Sprache","Antworte in der Sprache in der sie schreibt."],
                  ["⏰","Timing ist alles","20-60 Min. Abstand zeigt: du hast ein Leben."],
                  ["🔍","Echtes Interesse","Frag konkret nach etwas das sie gesagt hat."],
                  ["🚀","Der Move","Wenn der Vibe stimmt: Mach den Move."],
                ].map(([icon,title,desc])=>(
                  <div key={title} style={{...gc,padding:"11px 13px",marginBottom:7,borderLeft:`2px solid ${G.gold}`,background:"rgba(3,2,1,.72)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                      <span style={{fontSize:14}}>{icon}</span>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:9,fontWeight:700,color:G.gold,letterSpacing:1}}>{title}</span>
                    </div>
                    <Bod>{desc}</Bod>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════ */}
        {/* MAIN: MANPOWER-BIBEL          */}
        {/* ══════════════════════════════ */}
        {mainTab==="bible"&&(
          <div style={{animation:"fadeUp .3s ease"}}>

            {/* Header */}
            <div style={{textAlign:"center",marginBottom:16}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:900,color:G.gold,letterSpacing:3,marginBottom:4}}>📖 MANPOWER-BIBEL</div>
              <div style={{fontFamily:"'Lato',sans-serif",fontSize:12,color:G.muted,lineHeight:1.6}}>Wissen · Prinzipien · Lektionen der Bruderschaft</div>
              <div style={{height:1,background:`linear-gradient(90deg,transparent,rgba(212,175,55,.35),transparent)`,marginTop:10}}/>
            </div>

            {/* Admin: Neuer Beitrag Button */}
            {isAdmin&&!showNewPost&&!selectedEntry&&(
              <MBtn onClick={()=>setShowNewPost(true)}>
                ✍️  NEUEN BEITRAG ERSTELLEN
              </MBtn>
            )}

            {/* Admin: Neuer Beitrag Form */}
            {isAdmin&&showNewPost&&(
              <div style={{...gc,padding:"16px",marginBottom:16,background:"rgba(3,2,1,.82)",borderColor:"rgba(212,175,55,.28)"}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3,color:G.gold,marginBottom:12}}>✍️ NEUER BEITRAG</div>
                <SL>TITEL</SL>
                <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="Titel (optional)..."
                  style={{...gc,width:"100%",padding:"9px 11px",color:G.text,fontFamily:"'Lato',sans-serif",fontSize:13,marginBottom:10,background:"rgba(3,2,1,.65)",borderColor:"rgba(212,175,55,.2)"}}/>
                <SL>BILD HINZUFÜGEN (optional)</SL>
                <div className="dz" onClick={()=>bibleImageRef.current?.click()}
                  style={{...gc,padding:"12px",textAlign:"center",marginBottom:8,borderStyle:"dashed",borderColor:"rgba(212,175,55,.2)",background:"rgba(3,2,1,.6)",cursor:"pointer"}}>
                  <div style={{fontSize:18,opacity:.4,marginBottom:3}}>🖼️</div>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:G.gold}}>Bilder hinzufügen (bis zu 20)</div>
                  <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:G.muted,marginTop:2}}>{newImages.length}/20 ausgewählt</div>
                </div>
                <input ref={bibleImageRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>handleBibleImages(e.target.files)}/>
                {/* BG Image Option */}
                <div style={{...gc,padding:"12px",marginBottom:10,borderColor:"rgba(212,175,55,.2)",background:"rgba(3,2,1,.65)"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:useBgImage?10:0}}>
                    <div>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2,color:G.gold,marginBottom:2}}>🖼️ HINTERGRUNDBILD</div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:G.muted}}>Eigenes Bild leicht transparent im Hintergrund</div>
                    </div>
                    <div onClick={()=>setUseBgImage(s=>!s)}
                      style={{width:44,height:24,borderRadius:12,background:useBgImage?"rgba(212,175,55,.8)":"rgba(255,255,255,.1)",cursor:"pointer",position:"relative",transition:"all .25s",border:"1px solid rgba(212,175,55,.3)"}}>
                      <div style={{position:"absolute",top:2,left:useBgImage?20:2,width:18,height:18,borderRadius:"50%",background:useBgImage?G.gold3:"rgba(212,175,55,.4)",transition:"all .25s"}}/>
                    </div>
                  </div>
                  {useBgImage&&(
                    <div>
                      <div className="dz" onClick={()=>bibleBgRef.current?.click()}
                        style={{...gc,padding:"10px",textAlign:"center",borderStyle:"dashed",borderColor:"rgba(212,175,55,.2)",background:"rgba(3,2,1,.5)",cursor:"pointer"}}>
                        {newBgImage?(
                          <div style={{position:"relative"}}>
                            <img src={newBgImage.dataUrl} alt="" style={{width:"100%",height:80,objectFit:"cover",borderRadius:8,display:"block",opacity:.7}}/>
                            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Cinzel',serif",fontSize:8,color:G.gold,letterSpacing:2}}>ÄNDERN</div>
                            <button onClick={e=>{e.stopPropagation();setNewBgImage(null);}}
                              style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,.8)",border:"none",color:"#ff7b7b",width:18,height:18,borderRadius:"50%",cursor:"pointer",fontSize:10}}>✕</button>
                          </div>
                        ):(
                          <>
                            <div style={{fontSize:18,opacity:.4,marginBottom:3}}>🌅</div>
                            <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:G.gold}}>Hintergrundbild wählen</div>
                          </>
                        )}
                      </div>
                      <input ref={bibleBgRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleBgImage(e.target.files[0])}/>
                    </div>
                  )}
                </div>
                {newImages.length>0&&(
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
                    {newImages.map((img,i)=>(
                      <div key={i} style={{...gc,overflow:"hidden",borderColor:"rgba(212,175,55,.2)"}}>
                        <div style={{position:"relative"}}>
                          <img src={img.dataUrl} alt="" style={{width:"100%",height:80,objectFit:"cover",display:"block"}}/>
                          <button onClick={()=>setNewImages(prev=>prev.filter((_,j)=>j!==i))}
                            style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,.85)",border:"none",color:"#ff7b7b",width:18,height:18,borderRadius:"50%",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                          <div style={{position:"absolute",bottom:4,left:6,fontFamily:"'Cinzel',serif",fontSize:7,color:"rgba(212,175,55,.7)",background:"rgba(0,0,0,.6)",padding:"2px 6px",borderRadius:8}}>Bild {i+1}</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",background:"rgba(3,2,1,.6)"}}>
                          <div>
                            <div style={{fontFamily:"'Cinzel',serif",fontSize:7,color:G.gold,letterSpacing:1}}>TEXT-BLEND MODUS</div>
                            <div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:G.muted}}>Schwarzer Hintergrund wird unsichtbar</div>
                          </div>
                          <div onClick={()=>setBlendModes(prev=>{const n=[...prev];n[i]=!n[i];return n;})}
                            style={{width:38,height:20,borderRadius:10,background:blendModes[i]?"rgba(212,175,55,.8)":"rgba(255,255,255,.1)",cursor:"pointer",position:"relative",transition:"all .25s",border:"1px solid rgba(212,175,55,.25)",flexShrink:0}}>
                            <div style={{position:"absolute",top:2,left:blendModes[i]?18:2,width:14,height:14,borderRadius:"50%",background:blendModes[i]?G.gold3:"rgba(212,175,55,.4)",transition:"all .25s"}}/>
                          </div>
                        </div>
                      </div>
                    ))}
                    {newImages.length<20&&(
                      <div className="dz" onClick={()=>bibleImageRef.current?.click()}
                        style={{padding:"12px",textAlign:"center",border:"1px dashed rgba(212,175,55,.2)",borderRadius:10,color:"rgba(212,175,55,.35)",fontSize:13,background:"rgba(3,2,1,.5)",fontFamily:"'Cinzel',serif",letterSpacing:2}}>
                        + BILD HINZUFÜGEN
                      </div>
                    )}
                  </div>
                )}
                <SL>INHALT</SL>
                <textarea value={newContent} onChange={e=>setNewContent(e.target.value)} placeholder="Inhalt (optional)..."
                  rows={6} style={{...gc,width:"100%",padding:"9px 11px",color:G.text,fontFamily:"'Lato',sans-serif",fontSize:13,resize:"none",lineHeight:1.7,marginBottom:14,background:"rgba(3,2,1,.65)",borderColor:"rgba(212,175,55,.2)"}}/>
                <div style={{display:"flex",gap:8}}>
                  <MBtn onClick={savePost} disabled={savingPost}>
                    {savingPost?(saveStatus||"KOMPRIMIERE…"):"💾  SPEICHERN"}
                  </MBtn>
                  <button onClick={()=>{setShowNewPost(false);setNewTitle("");setNewContent("");setNewImages([]);setBlendModes([]);setNewBgImage(null);setUseBgImage(false);}}
                    style={{...gc,flex:"0 0 auto",background:"rgba(3,2,1,.7)",color:"rgba(212,175,55,.4)",padding:"12px 16px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1,borderRadius:10,border:"1px solid rgba(212,175,55,.15)"}}>
                    ABBRECHEN
                  </button>
                </div>
              </div>
            )}

            {/* Single entry view */}
            {selectedEntry&&(
              <div style={{animation:"fadeUp .3s ease",position:"relative"}}>
                {/* Background image overlay */}
                {selectedEntry.bg_image&&(
                  <div style={{position:"fixed",inset:0,zIndex:0,backgroundImage:`url(${selectedEntry.bg_image})`,backgroundSize:"cover",backgroundPosition:"center",opacity:.18,pointerEvents:"none"}}/>
                )}
                <div style={{position:"relative",zIndex:1}}>
                <button onClick={()=>setSelectedEntry(null)}
                  style={{...gc,background:"rgba(3,2,1,.7)",color:G.gold,padding:"8px 16px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2,borderRadius:18,border:`1px solid rgba(212,175,55,.2)`,marginBottom:14,display:"flex",alignItems:"center",gap:6}}>
                  ← ZURÜCK
                </button>
                {selectedEntry.image_url&&(()=>{
                  let imgs=[];
                  try{imgs=JSON.parse(selectedEntry.image_url);}catch{imgs=[selectedEntry.image_url];}
                  if(!imgs.length) return null;
                  return (
                    <div style={{position:"relative",marginBottom:12,borderRadius:12,overflow:"hidden",border:"1px solid rgba(212,175,55,.2)"}}>
                      {/* Main image */}
                      <div style={{position:"relative",width:"100%",paddingBottom:"100%",background:"rgba(3,2,1,.8)"}}>
                        <img src={imgs[carouselIdx]} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:"block",mixBlendMode:(()=>{try{const bm=JSON.parse(entry.blend_modes||selectedEntry?.blend_modes||"[]");return bm[carouselIdx]?"screen":"normal";}catch{return "normal";}})()}}/>
                        {/* Left arrow */}
                        {imgs.length>1&&carouselIdx>0&&(
                          <button onClick={()=>setCarouselIdx(i=>i-1)}
                            style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",background:"rgba(0,0,0,.55)",border:"none",color:"#fff",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>‹</button>
                        )}
                        {/* Right arrow */}
                        {imgs.length>1&&carouselIdx<imgs.length-1&&(
                          <button onClick={()=>setCarouselIdx(i=>i+1)}
                            style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"rgba(0,0,0,.55)",border:"none",color:"#fff",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}}>›</button>
                        )}
                        {/* Counter top right */}
                        {imgs.length>1&&(
                          <div style={{position:"absolute",top:10,right:10,background:"rgba(0,0,0,.6)",color:"#fff",fontFamily:"'Lato',sans-serif",fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:12,backdropFilter:"blur(4px)"}}>
                            {carouselIdx+1}/{imgs.length}
                          </div>
                        )}
                      </div>
                      {/* Dot indicators */}
                      {imgs.length>1&&(
                        <div style={{display:"flex",justifyContent:"center",gap:5,padding:"8px 0",background:"rgba(3,2,1,.6)"}}>
                          {imgs.map((_,i)=>(
                            <div key={i} onClick={()=>setCarouselIdx(i)}
                              style={{width:carouselIdx===i?18:6,height:6,borderRadius:3,background:carouselIdx===i?"#D4AF37":"rgba(212,175,55,.3)",cursor:"pointer",transition:"all .25s"}}/>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div style={{...gc,padding:"16px",background:"rgba(3,2,1,.78)"}}>
                  <div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:700,color:G.gold,marginBottom:8,lineHeight:1.4}}>{selectedEntry.title}</div>
                  <div style={{fontFamily:"'Lato',sans-serif",fontSize:13,color:"rgba(245,237,232,.72)",lineHeight:1.85,whiteSpace:"pre-wrap"}}>{selectedEntry.content}</div>
                  <div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:G.muted,marginTop:12}}>
                    {new Date(selectedEntry.created_at).toLocaleDateString("de-DE")}
                  </div>
                  {isAdmin&&!editingEntry&&(
                    <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
                      <button onClick={()=>startEdit(selectedEntry)}
                        style={{background:"rgba(212,175,55,.1)",border:"1px solid rgba(212,175,55,.3)",color:G.gold,padding:"7px 16px",cursor:"pointer",borderRadius:18,fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2}}>
                        ✏️ BEARBEITEN
                      </button>
                      <button onClick={()=>deletePost(selectedEntry.id)} disabled={deletingId===selectedEntry.id}
                        style={{background:"rgba(224,92,106,.1)",border:"1px solid rgba(224,92,106,.3)",color:"#ff8a95",padding:"7px 16px",cursor:"pointer",borderRadius:18,fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2}}>
                        {deletingId===selectedEntry.id?"LÖSCHE…":"🗑️ LÖSCHEN"}
                      </button>
                    </div>
                  )}
                  {isAdmin&&editingEntry&&(
                    <div style={{marginTop:14}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:3,color:G.gold,marginBottom:10}}>✏️ BEITRAG BEARBEITEN</div>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:G.muted,marginBottom:6}}>TITEL</div>
                      <input value={newTitle} onChange={e=>setNewTitle(e.target.value)}
                        style={{...gc,width:"100%",padding:"9px 11px",color:G.text,fontFamily:"'Lato',sans-serif",fontSize:13,marginBottom:10,background:"rgba(3,2,1,.65)",borderColor:"rgba(212,175,55,.2)"}}/>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:G.muted,marginBottom:6}}>INHALT</div>
                      <textarea value={newContent} onChange={e=>setNewContent(e.target.value)} rows={5}
                        style={{...gc,width:"100%",padding:"9px 11px",color:G.text,fontFamily:"'Lato',sans-serif",fontSize:13,resize:"none",lineHeight:1.65,marginBottom:10,background:"rgba(3,2,1,.65)",borderColor:"rgba(212,175,55,.2)"}}/>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:G.muted,marginBottom:6}}>WEITERE BILDER HINZUFÜGEN (optional)</div>
                      <div className="dz" onClick={()=>bibleImageRef.current?.click()}
                        style={{...gc,padding:"10px",textAlign:"center",marginBottom:10,borderStyle:"dashed",borderColor:"rgba(212,175,55,.18)",background:"rgba(3,2,1,.5)",cursor:"pointer"}}>
                        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:G.gold}}>+ Neue Bilder hinzufügen</div>
                        <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:G.muted,marginTop:2}}>Bestehende Bilder bleiben erhalten</div>
                      </div>
                      <input ref={bibleImageRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={async e=>await handleBibleImages(e.target.files)}/>
                      {newImages.length>0&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:G.green,marginBottom:8}}>✓ {newImages.length} neue Bilder werden hinzugefügt</div>}
                      <div style={{display:"flex",gap:8}}>
                        <MBtn onClick={saveEdit} disabled={savingPost}>
                          {savingPost?(saveStatus||"SPEICHERE…"):"💾  ÄNDERUNGEN SPEICHERN"}
                        </MBtn>
                        <button onClick={()=>{setEditingEntry(null);setNewTitle("");setNewContent("");setNewImages([]);setBlendModes([]);setNewBgImage(null);setUseBgImage(false);}}
                          style={{...gc,flex:"0 0 auto",background:"rgba(3,2,1,.7)",color:"rgba(212,175,55,.4)",padding:"12px 14px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,borderRadius:10,border:"1px solid rgba(212,175,55,.15)"}}>
                          ABBRECHEN
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                </div>{/* end relative z-1 */}
              </div>
            )}

            {/* Entry list */}
            {!selectedEntry&&!showNewPost&&(
              <>
                {loadingBible?<Spin text="LADE MANPOWER-BIBEL…"/>:bibleEntries.length===0?(
                  <div style={{textAlign:"center",padding:"40px 16px",color:G.muted}}>
                    <div style={{fontSize:32,marginBottom:12,opacity:.4}}>📖</div>
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3,marginBottom:8}}>NOCH KEINE BEITRÄGE</div>
                    {isAdmin&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:12}}>Erstelle den ersten Beitrag mit dem Button oben</div>}
                  </div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:9}}>
                    {bibleEntries.map(entry=>(
                      <div key={entry.id} className="rc" onClick={()=>openEntry(entry)}
                        style={{...gc,overflow:"hidden",borderColor:"rgba(212,175,55,.16)",background:"rgba(3,2,1,.74)"}}>
                        {entry.image_url&&(()=>{
                          let imgs=[];
                          try{imgs=JSON.parse(entry.image_url);}catch{imgs=[entry.image_url];}
                          return imgs[0]&&<img src={imgs[0]} alt="" style={{width:"100%",height:130,objectFit:"cover",display:"block"}}/>;
                        })()}
                        <div style={{padding:"12px 13px"}}>
                          <div style={{fontFamily:"'Cinzel',serif",fontSize:12,fontWeight:700,color:G.gold,marginBottom:5,lineHeight:1.4}}>{entry.title}</div>
                          <div style={{fontFamily:"'Lato',sans-serif",fontSize:12,color:"rgba(245,237,232,.55)",lineHeight:1.6,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>
                            {entry.content}
                          </div>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                            <div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:G.muted}}>{new Date(entry.created_at).toLocaleDateString("de-DE")}</div>
                            <div style={{fontFamily:"'Cinzel',serif",fontSize:8,color:G.gold,letterSpacing:1}}>LESEN →</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div style={{textAlign:"center",marginTop:24,fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:4,color:"rgba(212,175,55,.12)"}}>
          MANPOWER BRUDERSCHAFT · {localMem.totalAnalyses||0} ANALYSEN
        </div>
      </div>
    </div>
  );
}

// ── COMPONENTS ──────────────────────────────────────────────────────────────
const gc2 = {background:"rgba(5,3,1,0.78)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:"1px solid rgba(212,175,55,.18)",borderRadius:12};
function SL({children}){return <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.4)",marginBottom:8,textTransform:"uppercase"}}>{children}</div>;}
function SecTitle({icon,title,sub}){return(
  <div style={{marginBottom:14}}>
    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
      <span style={{fontSize:15}}>{icon}</span>
      <span style={{fontFamily:"'Cinzel',serif",fontSize:12,fontWeight:700,color:"#D4AF37",letterSpacing:1}}>{title}</span>
    </div>
    <div style={{fontFamily:"'Lato',sans-serif",fontSize:11,color:"rgba(245,237,232,.38)",lineHeight:1.55,paddingLeft:22}}>{sub}</div>
    <div style={{height:1,background:"linear-gradient(90deg,rgba(212,175,55,.3),transparent)",marginTop:8}}/>
  </div>
);}
function MBtn({children,onClick,disabled}){return(
  <button className="mgbtn" onClick={onClick} disabled={disabled}
    style={{width:"100%",background:disabled?"rgba(212,175,55,.06)":"linear-gradient(135deg,#3d2800,#7a5500,#D4AF37,#F5E27A,#D4AF37,#7a5500,#3d2800)",backgroundSize:"250% auto",border:"none",borderRadius:10,padding:"15px 16px",color:disabled?"rgba(212,175,55,.22)":"#1a0d00",fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:12,letterSpacing:4,cursor:disabled?"not-allowed":"pointer",marginBottom:14,animation:disabled?"none":"shimmer 3s linear infinite",boxShadow:disabled?"none":"0 5px 24px rgba(212,175,55,.38),inset 0 1px 0 rgba(255,248,200,.25)",textShadow:disabled?"none":"0 1px 2px rgba(0,0,0,.5)",position:"relative",overflow:"hidden"}}>
    {children}
  </button>
);}
function Card({icon,label,bl,children,sm}){return(
  <div style={{...gc2,padding:sm?"9px 11px":"11px 13px",marginBottom:8,borderLeft:`3px solid ${bl||"#D4AF37"}`,background:"rgba(3,2,1,.74)"}}>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:4,color:"rgba(212,175,55,.38)",marginBottom:sm?4:7}}>{icon} {label}</div>
    {children}
  </div>
);}
function ScCard({label,val,color,right}){return(
  <div style={{...gc2,flex:1,padding:"11px 12px",textAlign:right?"right":"left",background:"rgba(3,2,1,.76)"}}>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:3,color:"rgba(212,175,55,.38)",marginBottom:4}}>{label}</div>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:20,fontWeight:900,color,textShadow:`0 0 12px ${color}55`}}>{val}</div>
  </div>
);}
function Bod({children}){return <p style={{fontFamily:"'Lato',sans-serif",color:"rgba(245,237,232,.72)",fontSize:13,lineHeight:1.72,margin:"0 0 3px"}}>{children}</p>;}
function Sm({children}){return <p style={{fontFamily:"'Lato',sans-serif",color:"rgba(245,237,232,.38)",fontSize:10,lineHeight:1.5,margin:"1px 0",fontStyle:"italic"}}>{children}</p>;}
function Spin({text}){return(
  <div style={{textAlign:"center",padding:"18px 0"}}>
    <div style={{width:32,height:32,margin:"0 auto 9px",border:"2px solid rgba(212,175,55,.12)",borderTopColor:"#D4AF37",borderRadius:"50%",animation:"spin 0.9s linear infinite"}}/>
    <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:4,color:"rgba(212,175,55,.38)",animation:"pulse 1.5s ease infinite"}}>{text}</div>
  </div>
);}
function Err({children}){return <div style={{background:"rgba(224,92,106,.08)",border:"1px solid rgba(224,92,106,.22)",borderRadius:8,padding:"9px 12px",color:"#ff8a95",fontFamily:"'Lato',sans-serif",fontSize:12,marginBottom:12}}>{children}</div>;}
