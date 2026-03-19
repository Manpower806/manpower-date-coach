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
// Generate stable device ID
function getDeviceId() {
  let id = localStorage.getItem("mp_device_id");
  if(!id){
    id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
    localStorage.setItem("mp_device_id", id);
  }
  return id;
}

// Generate session token
function genToken() {
  return "sess_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,10);
}

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
  // Compress aggressively for mobile
  const blob = await new Promise(res=>{
    const img = new Image();
    img.onload = ()=>{
      const c = document.createElement("canvas");
      let w=img.width, h=img.height;
      const maxW=800; // reduced from 1080
      if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
      c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      c.toBlob(b=>res(b),"image/jpeg",0.65); // reduced from 0.75
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
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [loginLogs, setLoginLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [members, setMembers] = useState([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [readEntries, setReadEntries] = useState({});
  const [entryReactions, setEntryReactions] = useState({});
  const [entryComments, setEntryComments] = useState({});
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [bibleCategory, setBibleCategory] = useState("alle");
  const [newCategory, setNewCategory] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState({display_name:"",city:"",bio:"",avatar_color:""});
  const [savingProfile, setSavingProfile] = useState(false);
  const [inviteLinks, setInviteLinks] = useState([]);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [dailyMotiv, setDailyMotiv] = useState(null);

  const DAILY_MOTIVATIONS = {
    de: ["💪 Kein Mann wurde jemals schwächer durch Disziplin.","👑 Du bist nicht hier um zu überleben. Du bist hier um zu dominieren.","🔥 Andere schlafen. Du wächst. Das ist der Unterschied.","⚔️ Schmerz ist temporär. Stärke ist permanent.","🎯 Heute ist ein weiterer Tag um besser zu werden als gestern.","👁️ Die Welt respektiert Männer die sich selbst respektieren.","💎 Routine ist die Waffe des Siegers.","🦁 Ein Löwe fragt nicht um Erlaubnis."],
    en: ["💪 No man ever became weaker through discipline.","👑 You're not here to survive. You're here to dominate.","🔥 Others sleep. You grow. That's the difference.","⚔️ Pain is temporary. Strength is permanent.","🎯 Today is another day to be better than yesterday.","👁️ The world respects men who respect themselves.","💎 Routine is the weapon of the winner.","🦁 A lion doesn't ask for permission."],
    tr: ["💪 Hiçbir adam disiplinle zayıflamadı.","👑 Burada hayatta kalmak için değil, hükmetmek için varsın.","🔥 Diğerleri uyuyor. Sen büyüyorsun. İşte fark bu.","⚔️ Acı geçicidir. Güç kalıcıdır.","🎯 Bugün dünden daha iyi olmak için bir gün daha.","👁️ Dünya kendine saygı duyan erkeklere saygı duyar.","💎 Rutin, kazananın silahıdır.","🦁 Aslan izin istemez."],
    ar: ["💪 لم يضعف رجل قط بسبب الانضباط.","👑 أنت هنا لتسود، لا لتبقى فحسب.","🔥 الآخرون نائمون. أنت تنمو. هذا هو الفرق.","⚔️ الألم مؤقت. القوة دائمة.","🎯 اليوم يوم آخر لتكون أفضل من الأمس.","👁️ العالم يحترم الرجال الذين يحترمون أنفسهم.","💎 الروتين هو سلاح الفائز.","🦁 الأسد لا يطلب الإذن."],
    es: ["💪 Ningún hombre se volvió más débil por la disciplina.","👑 No estás aquí para sobrevivir. Estás aquí para dominar.","🔥 Otros duermen. Tú creces. Esa es la diferencia.","⚔️ El dolor es temporal. La fuerza es permanente.","🎯 Hoy es otro día para ser mejor que ayer.","👁️ El mundo respeta a los hombres que se respetan.","💎 La rutina es el arma del ganador.","🦁 Un león no pide permiso."],
    it: ["💪 Nessun uomo è mai diventato più debole grazie alla disciplina.","👑 Non sei qui per sopravvivere. Sei qui per dominare.","🔥 Gli altri dormono. Tu cresci. Questa è la differenza.","⚔️ Il dolore è temporaneo. La forza è permanente.","🎯 Oggi è un altro giorno per essere migliore di ieri.","👁️ Il mondo rispetta gli uomini che rispettano se stessi.","💎 La routine è l'arma del vincitore.","🦁 Un leone non chiede il permesso."],
    fr: ["💪 Aucun homme n'est jamais devenu plus faible grâce à la discipline.","👑 Tu n'es pas ici pour survivre. Tu es ici pour dominer.","🔥 Les autres dorment. Tu grandis. C'est la différence.","⚔️ La douleur est temporaire. La force est permanente.","🎯 Aujourd'hui est un autre jour pour être meilleur qu'hier.","👁️ Le monde respecte les hommes qui se respectent.","💎 La routine est l'arme du gagnant.","🦁 Un lion ne demande pas la permission."],
    ru: ["💪 Ни один мужчина не стал слабее от дисциплины.","👑 Ты здесь не чтобы выживать. Ты здесь чтобы доминировать.","🔥 Другие спят. Ты растёшь. В этом разница.","⚔️ Боль временна. Сила постоянна.","🎯 Сегодня ещё один день стать лучше, чем вчера.","👁️ Мир уважает мужчин, которые уважают себя.","💎 Рутина — оружие победителя.","🦁 Лев не спрашивает разрешения."],
  };
  const [pushLoading, setPushLoading] = useState(false);

  const VAPID_PUBLIC = "BPqoXA8SUbq5-gXzvtk2rb8eP1nQNblj_74jEp8fWOEq3b3l9I-h0lATWm5JB0R6cKZU1eGmwjRFGq_qtlwBKdo";

  const urlBase64ToUint8Array = (base64String) => {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  };

  const subscribePush = async () => {
    setPushLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
      const lang = localStorage.getItem("mp_lang") || "de";
      await supabase.from("push_subscriptions").upsert({
        user_id: user.id,
        username: user.username,
        subscription: JSON.stringify(sub),
        lang,
      }, { onConflict: "user_id" });
      setPushEnabled(true);
      localStorage.setItem("mp_push_enabled", "1");
      alert("✅ Push Notifications aktiviert!");
    } catch(e) {
      alert("❌ Fehler: " + e.message);
    }
    setPushLoading(false);
  };

  const unsubscribePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await supabase.from("push_subscriptions").delete().eq("user_id", user.id);
      setPushEnabled(false);
      localStorage.removeItem("mp_push_enabled");
    } catch(e) {}
  };

  const sendPushToAll = async (title, body, type="general") => {
    const { data: subs } = await supabase.from("push_subscriptions").select("*");
    if (!subs?.length) return;
    const subscriptions = subs.map(s => ({ subscription: JSON.parse(s.subscription), lang: s.lang }));
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriptions, title, body, type }),
    });
  };
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
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIdx, setModalIdx] = useState(0);
  const modalTouchX = useRef(null);
  // Music
  const [newMusicUrl, setNewMusicUrl] = useState("");
  const [newMusicStart, setNewMusicStart] = useState(0);
  const [newMusicEnd, setNewMusicEnd] = useState(0);
  const [previewingMusic, setPreviewingMusic] = useState(false);
  const audioRef = useRef(null);
  const [musicFiles, setMusicFiles] = useState([]);
  const [loadingMusic, setLoadingMusic] = useState(false);

  // Auto-fetch MP3 files from Supabase Storage + GitHub
  useEffect(()=>{
    const fetchMusicFiles = async()=>{
      setLoadingMusic(true);
      const allSongs = [];
      // 1. Supabase Storage bucket "music" - direkte URL-Konstruktion als Fallback
      try {
        const {data:storageFiles, error:storageErr} = await supabase.storage.from("music").list("",{limit:100});
        if(storageFiles?.length){
          for(const f of storageFiles){
            if(!f.name || f.name===".emptyFolderPlaceholder") continue;
            const lname = f.name.toLowerCase();
            if(!lname.endsWith(".mp3") && !lname.endsWith(".m4a") && !lname.endsWith(".wav")) continue;
            // Direkte URL-Konstruktion (funktioniert auch ohne RLS)
            const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
            const publicUrl = `${supabaseUrl}/storage/v1/object/public/music/${encodeURIComponent(f.name)}`;
            allSongs.push({file:publicUrl, name:f.name.replace(/\.[^.]+$/,"").replace(/_/g," ").replace(/%20/g," ")});
          }
        }
      } catch(e){ console.warn("Supabase music fetch failed:",e); }
      // 2. GitHub public folder
      try {
        const res = await fetch("https://api.github.com/repos/Manpower806/manpower-date-coach/contents/public");
        const files = await res.json();
        if(Array.isArray(files)){
          files.filter(f=>f.name.toLowerCase().endsWith(".mp3"))
            .forEach(f=>allSongs.push({file:"/"+f.name, name:f.name.replace(".mp3","").replace(/_/g," ")}));
        }
      } catch(e){ console.warn("GitHub music fetch failed:",e); }
      if(allSongs.length) setMusicFiles(allSongs);
      setLoadingMusic(false);
    };
    fetchMusicFiles();
  },[]);
  const touchStartX = useRef(null);

  useEffect(()=>{
    // Check onboarding for new users
    if(!localStorage.getItem("mp_onboarded_"+user?.username) && !user?.isAdmin){
      setShowOnboarding(true);
    }
    // Check push status
    if(localStorage.getItem("mp_push_enabled")) setPushEnabled(true);
    // Load profile
    loadProfile();
    // Daily motivation - show once per day
    const today = new Date().toDateString();
    const lastShown = localStorage.getItem("mp_motiv_date_"+user?.username);
    if(lastShown !== today){
      const lang = localStorage.getItem("mp_lang")||"de";
      const msgs = DAILY_MOTIVATIONS[lang]||DAILY_MOTIVATIONS.de;
      const msg = msgs[new Date().getDay() % msgs.length];
      setTimeout(()=>{ setDailyMotiv(msg); localStorage.setItem("mp_motiv_date_"+user?.username, today); }, 1500);
    }
    if(mainTab==="bible") loadBible();
    if(tab==="community") loadComm();
    if(tab==="history") loadHist();
  },[mainTab, tab]);

  // Validate session every 60 seconds - detect account sharing
  useEffect(()=>{
    const checkSession = async()=>{
      if(!user?.sessionToken) return;
      // Admin bypass – no session/device restrictions
      if(user.isAdmin) return;
      const {data} = await supabase.from("members").select("session_token,active,expires_at").eq("id",user.id).single();
      if(!data) return;
      // If session token changed = someone else logged in
      // Only check if DB has a token (null = reset by admin, allow)
      if(data.session_token && data.session_token !== user.sessionToken){
        alert("⚠️ Dein Account wurde auf einem anderen Gerät geöffnet. Du wirst ausgeloggt.");
        onLogout();
        return;
      }
      // If deactivated
      if(!data.active){ alert("Dein Zugang wurde deaktiviert."); onLogout(); return; }
      // If expired
      if(data.expires_at && new Date(data.expires_at) < new Date()){ alert("Dein Zugang ist abgelaufen."); onLogout(); return; }
      // Update last_seen
      await supabase.from("members").update({last_seen: new Date().toISOString()}).eq("id",user.id);
    };
    checkSession();
    const interval = setInterval(checkSession, 60000);
    return ()=>clearInterval(interval);
  },[user?.sessionToken]);

  const loadAdminData = async()=>{
    setLoadingAdmin(true);
    const [{data:logs},{data:mems}] = await Promise.all([
      supabase.from("login_logs").select("*").order("created_at",{ascending:false}).limit(50),
      supabase.from("members").select("id,username,active,device_id,expires_at,last_seen,notes").order("created_at",{ascending:false}),
    ]);
    if(logs) setLoginLogs(logs);
    if(mems) setMembers(mems);
    setLoadingAdmin(false);
  };

  const resetDevice = async(memberId)=>{
    await supabase.from("members").update({device_id:null}).eq("id",memberId);
    await loadAdminData();
    alert("Gerät zurückgesetzt! Nutzer kann sich auf neuem Gerät einloggen.");
  };

  const setExpiry = async(memberId, days)=>{
    const date = days ? new Date(Date.now()+days*24*60*60*1000).toISOString() : null;
    await supabase.from("members").update({expires_at:date}).eq("id",memberId);
    await loadAdminData();
  };

  const toggleActive = async(memberId, current)=>{
    await supabase.from("members").update({active:!current}).eq("id",memberId);
    await loadAdminData();
  };

  const loadBible = async()=>{
    setLoadingBible(true);
    // Load entries first - show immediately
    const{data}=await supabase.from("library").select("*").order("created_at",{ascending:false});
    if(data) setBibleEntries(data);
    setLoadingBible(false);
    // Load social data in background (non-blocking)
    try{
      const[readsRes,reactRes,commRes]=await Promise.all([
        supabase.from("entry_reads").select("entry_id").eq("user_id",user.id),
        supabase.from("entry_reactions").select("entry_id,emoji,username"),
        supabase.from("entry_comments").select("entry_id,id"),
      ]);
      if(readsRes.data){ const r={}; readsRes.data.forEach(x=>r[x.entry_id]=true); setReadEntries(r); }
      if(reactRes.data){
        const g={};
        reactRes.data.forEach(r=>{ if(!g[r.entry_id])g[r.entry_id]={}; if(!g[r.entry_id][r.emoji])g[r.entry_id][r.emoji]=[]; if(!g[r.entry_id][r.emoji].includes(r.username))g[r.entry_id][r.emoji].push(r.username); });
        setEntryReactions(g);
      }
      if(commRes.data){
        const g={};
        commRes.data.forEach(c=>{ if(!g[c.entry_id])g[c.entry_id]=[]; g[c.entry_id].push(c.id); });
        setEntryComments(g);
      }
    }catch(e){ console.warn("Social load failed:",e); }
  };

  const markRead = async(entryId)=>{
    if(readEntries[entryId]) return;
    setReadEntries(r=>({...r,[entryId]:true}));
    await supabase.from("entry_reads").upsert({entry_id:entryId,user_id:user.id,username:user.username},{onConflict:"entry_id,user_id"});
  };

  const loadReactions = async(entryId)=>{
    const{data}=await supabase.from("entry_reactions").select("emoji,username").eq("entry_id",entryId);
    if(data){
      const grouped={};
      data.forEach(r=>{ grouped[r.emoji]=(grouped[r.emoji]||[]); if(!grouped[r.emoji].includes(r.username)) grouped[r.emoji].push(r.username); });
      setEntryReactions(r=>({...r,[entryId]:grouped}));
    }
  };

  const toggleReaction = async(entryId, emoji)=>{
    const current = entryReactions[entryId]?.[emoji]||[];
    const hasReacted = current.includes(user.username);
    if(hasReacted){
      await supabase.from("entry_reactions").delete().eq("entry_id",entryId).eq("username",user.username).eq("emoji",emoji);
    } else {
      await supabase.from("entry_reactions").upsert({entry_id:entryId,user_id:user.id,username:user.username,emoji},{onConflict:"entry_id,user_id,emoji"});
    }
    loadReactions(entryId);
  };

  const loadComments = async(entryId)=>{
    const{data}=await supabase.from("entry_comments").select("*").eq("entry_id",entryId).order("created_at",{ascending:true});
    if(data) setEntryComments(c=>({...c,[entryId]:data}));
  };

  const addComment = async(entryId)=>{
    if(!newComment.trim()) return;
    await supabase.from("entry_comments").insert({entry_id:entryId,user_id:user.id,username:user.username,text:newComment.trim()});
    setNewComment("");
    loadComments(entryId);
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

  const loadProfile = async()=>{
    const{data}=await supabase.from("members").select("display_name,city,bio,avatar_color").eq("id",user.id).single();
    if(data) setProfile({
      display_name:data.display_name||"",
      city:data.city||"",
      bio:data.bio||"",
      avatar_color:data.avatar_color||"#D4AF37"
    });
  };

  const saveProfile = async()=>{
    setSavingProfile(true);
    await supabase.from("members").update({
      display_name: profile.display_name.trim(),
      city: profile.city.trim(),
      bio: profile.bio.trim(),
      avatar_color: profile.avatar_color||"#D4AF37",
    }).eq("id",user.id);
    setSavingProfile(false);
    setShowProfile(false);
  };

  const loadInvites = async()=>{
    const{data}=await supabase.from("invite_links").select("*").order("created_at",{ascending:false}).limit(20);
    if(data) setInviteLinks(data);
  };

  const generateInvite = async()=>{
    setGeneratingInvite(true);
    const code = Math.random().toString(36).slice(2,10).toUpperCase() + Math.random().toString(36).slice(2,6).toUpperCase();
    const expires = new Date(Date.now() + 7*24*60*60*1000).toISOString(); // 7 days
    const{error}=await supabase.from("invite_links").insert({
      code, created_by: user.username, expires_at: expires
    });
    if(!error){
      await loadInvites();
      const link = `${window.location.origin}?invite=${code}`;
      if(navigator.share){
        navigator.share({title:"Manpower Bruderschaft Einladung", text:"Du wurdest eingeladen!", url:link});
      } else {
        navigator.clipboard.writeText(link).catch(()=>{});
        alert("✅ Link kopiert:\n" + link);
      }
    }
    setGeneratingInvite(false);
  };

  const deleteInvite = async(id)=>{
    await supabase.from("invite_links").delete().eq("id",id);
    await loadInvites();
  };

  const autoCategorizPost = async(title, textContent)=>{
    if(!title && !textContent) return "Mindset"; // default fallback
    try {
      const res = await fetch("/api/claude", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:10,
          messages:[{role:"user",content:`Kategorisiere diesen Beitrag in GENAU EINE Kategorie.

Kategorien: Mindset, Dating, Frauen, Finanzen, Fitness, Lifestyle

Titel: "${title||""}"
${textContent?`Inhalt: "${(textContent||"").slice(0,300)}"`:""} 

Regeln:
- Frauen/Beziehungen/Dynamik → "Frauen" oder "Dating"
- Motivation/Erfolg/Mentalität → "Mindset"  
- Geld/Business/Investitionen → "Finanzen"
- Sport/Ernährung/Körper → "Fitness"
- Reisen/Mode/Stil → "Lifestyle"

Antworte mit NUR einem Wort.`}]
        })
      });
      const data = await res.json();
      const cat = (data.content?.[0]?.text||"").trim().replace(/[^a-zA-ZäöüÄÖÜ]/g,"");
      const valid = ["Mindset","Dating","Frauen","Finanzen","Fitness","Lifestyle"];
      return valid.find(v=>cat.toLowerCase()===v.toLowerCase()) || 
             valid.find(v=>cat.toLowerCase().includes(v.toLowerCase())) || 
             "Mindset";
    } catch(e){ return "Mindset"; }
  };

  const bulkCategorize = async()=>{
    const uncategorized = bibleEntries.filter(e=>!e.category);
    if(!uncategorized.length){ alert("Alle Beiträge haben bereits eine Kategorie!"); return; }
    if(!window.confirm(`${uncategorized.length} Beiträge werden jetzt von der KI kategorisiert. Fortfahren?`)) return;
    let done=0;
    for(const entry of uncategorized){
      const cat = await autoCategorizPost(entry.title, entry.content);
      if(cat){
        await supabase.from("library").update({category:cat}).eq("id",entry.id);
      }
      done++;
      setSaveStatus(`${done}/${uncategorized.length} kategorisiert…`);
    }
    setSaveStatus("");
    setBibleCategory("alle");
    await loadBible();
    alert("✅ Fertig! Alle Beiträge wurden kategorisiert.");
  };

  const savePost = async()=>{
    if(!newTitle.trim()&&!newContent.trim()&&newImages.length===0) return;
    setSavingPost(true);
    try {
      const imageUrls = [];
      for(let i=0; i<newImages.length; i++){
        setSaveStatus(`BILD ${i+1} VON ${newImages.length} WIRD HOCHGELADEN…`);
        // Small delay to prevent freezing on mobile
        await new Promise(r=>setTimeout(r,100));
        const url = await uploadDataUrlToStorage(supabase, newImages[i].dataUrl, "images");
        imageUrls.push(url);
      }
      let bgUrl = null;
      if(useBgImage && newBgImage?.dataUrl){
        setSaveStatus("HINTERGRUNDBILD…");
        bgUrl = await uploadDataUrlToStorage(supabase, newBgImage.dataUrl, "backgrounds");
      }
      setSaveStatus("KATEGORIE WIRD ERMITTELT…");
      const finalCategory = newCategory || await autoCategorizPost(newTitle.trim(), newContent.trim());
      setSaveStatus("SPEICHERE…");
      const {error} = await supabase.from("library").insert({
        title: newTitle.trim(),
        content: newContent.trim(),
        image_url: imageUrls.length>0 ? JSON.stringify(imageUrls) : null,
        bg_image: bgUrl || null,
        blend_modes: blendModes.length>0 ? JSON.stringify(blendModes) : null,
        music_url: newMusicUrl || null,
        music_start: newMusicStart || 0,
        music_end: newMusicEnd || 0,
        created_by: user.username,
        category: finalCategory,
      });
      if(error){ alert("Fehler: "+error.message); setSavingPost(false); setSaveStatus(""); return; }
      setNewTitle(""); setNewContent(""); setNewImages([]); setBlendModes([]); setNewBgImage(null); setUseBgImage(false); setNewMusicUrl(""); setNewMusicStart(0); setNewMusicEnd(0); setShowNewPost(false); setNewCategory("");
      // Send push to all members
      sendPushToAll("📖 MANPOWER-BIBEL", "Neuer Beitrag: " + newTitle, "bible");
      await loadBible();
    } catch(e){
      alert("Fehler beim Speichern: "+e.message);
    }
    setSavingPost(false);
    setSaveStatus("");
  };

  const openEntry = (entry)=>{ 
    setSelectedEntry(entry); setCarouselIdx(0); setEditingEntry(null); setShowComments(false);
    markRead(entry.id);
    loadReactions(entry.id);
    loadComments(entry.id);
    // Start music if entry has one
    if(entry.music_url){
      if(audioRef.current){ audioRef.current.pause(); audioRef.current=null; }
      const audio = new Audio(entry.music_url.startsWith("http") ? entry.music_url : "/"+entry.music_url);
      const start = entry.music_start||0;
      const end = entry.music_end||0;
      audio.preload = "auto";
      audio.volume = 0.7;
      audio.currentTime = start;
      if(end>0){
        // Loop between start and end - use setInterval for reliable looping
        audio.ontimeupdate = ()=>{
          if(audio.currentTime >= end - 0.1){
            audio.currentTime = start;
            audio.play().catch(()=>{});
          }
        };
        // Extra safety: also catch onended in case it slips through
        audio.onended = ()=>{
          audio.currentTime = start;
          audio.play().catch(()=>{});
        };
      } else {
        // Loop whole song from start
        audio.onended = ()=>{
          audio.currentTime = start;
          audio.play().catch(()=>{});
        };
      }
      audio.loop = (end===0 && start===0); // native loop only when no custom range
      audio.play().catch(()=>{});
      audioRef.current = audio;
    }
  };

  const startEdit = (entry)=>{
    setEditingEntry(entry);
    setNewTitle(entry.title||"");
    setNewContent(entry.content||"");
    setNewImages([]); // Can't restore old images to file objects, user re-uploads if needed
    setBlendModes(entry.blend_modes?JSON.parse(entry.blend_modes):[]);
    setUseBgImage(!!entry.bg_image);
    setNewBgImage(entry.bg_image?{dataUrl:entry.bg_image}:null);
    setNewMusicUrl(entry.music_url||"");
    setNewMusicStart(entry.music_start||0);
    setNewMusicEnd(entry.music_end||0);
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
        music_url: newMusicUrl || null,
        music_start: newMusicStart || 0,
        music_end: newMusicEnd || 0,
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
      const res=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-opus-4-5",max_tokens:1500,messages:[{role:"user",content:parts}]})});
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
      const res=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,
        system:`Du bist der Chat-Coach der Manpower Bruderschaft. Farbige Blase=Nutzer, graue=sie. Analyse auf Deutsch, Antworten in Chat-Sprache. ${commCtx}
Nur JSON: {"detectedLanguage":"...","vibeScore":"7.5/10","dynamik":"STARK|AUSGEWOGEN|SCHWACH","kurzanalyse":"...","staerken":["..."],"verbesserungen":["..."],"psychoInsight":"...","naechsterSchritt":"...","replies":[{"label":"Selbstsicher","text":"...","warum":"..."},{"label":"Charmant","text":"...","warum":"..."},{"label":"Witzig","text":"...","warum":"..."}],"prinzip":"...","situation":"..."}`,
        messages:[{role:"user",content:[{type:"image",source:{type:"base64",media_type:chatImg.mediaType,data:chatImg.base64}},{type:"text",text:`Analysiere. Ton: ${TONE_DE[tone]}. Nur JSON.`}]}]})});
      if(!res) throw new Error("Netzwerkfehler – bitte nochmal versuchen.");
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
        <header style={{textAlign:"center",padding:"24px 0 20px",marginBottom:20,position:"relative"}}>
          <div style={{position:"absolute",bottom:0,left:"5%",right:"5%",height:1,background:"linear-gradient(90deg,transparent,rgba(212,175,55,.3),rgba(212,175,55,.3),transparent)"}}/>
          <div style={{width:54,height:54,margin:"0 auto 8px",position:"relative"}}>
            <div style={{width:"100%",height:"100%",border:"2px solid",borderColor:G.gold,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(3,2,1,0.7)",backdropFilter:"blur(10px)",animation:"glow 4s ease infinite"}}>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:21,fontWeight:900,background:`linear-gradient(135deg,${G.gold3},${G.gold})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>M</span>
            </div>
            <div style={{position:"absolute",top:-2,right:-1,width:9,height:9,background:G.rose,borderRadius:"50%",border:"2px solid rgba(3,2,1,.9)",animation:"heartbeat 2s ease infinite"}}/>
          </div>
          <div style={{fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:"clamp(18px,5vw,26px)",letterSpacing:5,background:`linear-gradient(90deg,${G.gold2},${G.gold},${G.gold3},${G.gold},${G.gold2})`,backgroundSize:"200% auto",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",animation:"shimmer 5s linear infinite",marginBottom:2}}>MANPOWER</div>
          <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:7,color:"rgba(212,175,55,.45)",marginBottom:14}}>BRUDERSCHAFT</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,flexWrap:"nowrap",overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:2,maxWidth:"100%"}}>
            <div onClick={()=>{setShowProfile(true);loadProfile();}} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(212,175,55,.08)",border:"1px solid rgba(212,175,55,.22)",borderRadius:18,padding:"4px 11px",cursor:"pointer"}}>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:11,fontWeight:900,color:G.gold,letterSpacing:1,textShadow:"0 0 10px rgba(212,175,55,.4)"}}>{isAdmin?"👑":"👤"}</span>
              <span style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:700,color:G.gold,letterSpacing:2,textShadow:"0 0 10px rgba(212,175,55,.4)"}}>{profile.display_name||user?.username?.toUpperCase()}</span>
            </div>
            <span style={{color:"rgba(212,175,55,.2)",fontSize:10}}>|</span>
            <span style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:0,color:"rgba(212,175,55,.35)"}}>{localMem.totalAnalyses||0} · {localMem.totalOpeners||0}</span>
            {isAdmin&&<button onClick={()=>{setShowAdminPanel(true);loadAdminData();}} style={{background:"rgba(201,103,125,.08)",border:"1px solid rgba(201,103,125,.25)",color:"#e8a0b0",padding:"4px 10px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:1,borderRadius:16}}>⚙️ ADMIN</button>}
            {"serviceWorker" in navigator && "PushManager" in window && (
              <button onClick={pushEnabled?unsubscribePush:subscribePush} disabled={pushLoading}
                style={{background:pushEnabled?"rgba(92,184,122,.1)":"rgba(212,175,55,.07)",border:`1px solid ${pushEnabled?"rgba(92,184,122,.3)":"rgba(212,175,55,.2)"}`,color:pushEnabled?"#5cb87a":"rgba(212,175,55,.5)",padding:"4px 10px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:1,borderRadius:16,transition:"all .2s"}}>
                {pushLoading?"…":pushEnabled?"🔔":"🔕"}
              </button>
            )}
            <button onClick={onLogout} style={{background:"rgba(212,175,55,.07)",border:"1px solid rgba(212,175,55,.2)",color:"rgba(212,175,55,.5)",padding:"4px 10px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:1,borderRadius:16,transition:"all .2s",display:"flex",alignItems:"center",gap:4}}>🚪 <span>LOGOUT</span></button>
          </div>
        </header>

        {/* ONBOARDING */}
        {showOnboarding&&(
          <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.95)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{maxWidth:380,width:"100%",background:"rgba(12,8,2,.95)",border:"1px solid rgba(212,175,55,.3)",borderRadius:12,padding:"32px 24px",textAlign:"center"}}>
              <div style={{fontSize:48,marginBottom:16}}>👑</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:18,fontWeight:900,color:"#D4AF37",marginBottom:8,letterSpacing:3}}>WILLKOMMEN</div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:4,color:"rgba(212,175,55,.5)",marginBottom:20}}>MANPOWER BRUDERSCHAFT</div>
              <div style={{fontFamily:"'Lato',sans-serif",fontSize:13,color:"rgba(245,237,232,.7)",lineHeight:1.8,marginBottom:24}}>
                Du bist jetzt Teil der Elite.<br/>
                Hier findest du KI-gestütztes Dating-Coaching, die Manpower-Bibel und das Wissen der Bruderschaft.
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24,textAlign:"left"}}>
                {[["🍑🫦","KI DATE COACH","Opener generieren, Chats analysieren, Antworten optimieren"],["📖","MANPOWER-BIBEL","Wissen, Prinzipien und Lektionen der Bruderschaft"]].map(([icon,title,desc])=>(
                  <div key={title} style={{background:"rgba(212,175,55,.06)",border:"1px solid rgba(212,175,55,.15)",borderRadius:8,padding:"12px 14px",display:"flex",gap:12,alignItems:"flex-start"}}>
                    <span style={{fontSize:20}}>{icon}</span>
                    <div>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:"#D4AF37",letterSpacing:2,marginBottom:3}}>{title}</div>
                      <div style={{fontFamily:"'Lato',sans-serif",fontSize:11,color:"rgba(245,237,232,.55)"}}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={()=>{setShowOnboarding(false);localStorage.setItem("mp_onboarded_"+user.username,"1");}}
                style={{width:"100%",background:"linear-gradient(135deg,#6B4F0A,#D4AF37,#F5E27A,#D4AF37,#6B4F0A)",backgroundSize:"200% auto",animation:"shimmer 3s linear infinite",border:"none",borderRadius:6,padding:"14px",color:"#0a0806",fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:11,letterSpacing:4,cursor:"pointer"}}>
                BETRETEN →
              </button>
            </div>
          </div>
        )}

        {/* DAILY MOTIVATION BANNER */}
        {dailyMotiv&&(
          <div style={{position:"fixed",bottom:24,left:12,right:12,zIndex:9990,animation:"fadeUp .4s ease"}}>
            <div style={{background:"linear-gradient(135deg,rgba(10,6,2,.97),rgba(20,12,2,.97))",border:"1px solid rgba(212,175,55,.35)",borderRadius:12,padding:"16px 18px",boxShadow:"0 8px 32px rgba(0,0,0,.6)",display:"flex",alignItems:"flex-start",gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.5)",marginBottom:6}}>MANPOWER · DAILY</div>
                <div style={{fontFamily:"'Lato',sans-serif",fontSize:13,color:"rgba(245,237,232,.9)",lineHeight:1.6}}>{dailyMotiv}</div>
              </div>
              <button onClick={()=>setDailyMotiv(null)}
                style={{background:"none",border:"none",color:"rgba(212,175,55,.4)",cursor:"pointer",fontSize:18,padding:0,flexShrink:0}}>✕</button>
            </div>
          </div>
        )}

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
          <div style={{display:"flex",justifyContent:"center",marginTop:16,marginBottom:28}}>
            <button onClick={()=>setMainTab(null)}
              style={{...gc,background:"rgba(3,2,1,.7)",color:"rgba(212,175,55,.45)",padding:"8px 20px",
                cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2,
                border:"1px solid rgba(212,175,55,.18)",borderRadius:10,whiteSpace:"nowrap"}}>← MENÜ</button>
          </div>
        )}

        {/* ══════════════════════════════ */}
        {/* MAIN: KI DATE COACH           */}
        {/* ══════════════════════════════ */}
        {mainTab==="coach"&&(
          <div style={{animation:"fadeUp .3s ease",paddingTop:4}}>
            {/* Tone */}
            <div style={{...gc,padding:"8px",marginBottom:12,background:"rgba(3,2,1,.72)"}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:3,color:"rgba(212,175,55,.7)",textAlign:"center",marginBottom:6}}>KOMMUNIKATIONSSTIL</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
                {TONES.map(t=>(
                  <div key={t.key} className="tp" onClick={()=>setTone(t.key)}
                    style={{...gc,padding:"9px 4px",textAlign:"center",background:tone===t.key?"rgba(212,175,55,.13)":"rgba(3,2,1,.5)",borderColor:tone===t.key?"rgba(212,175,55,.5)":"rgba(212,175,55,.1)",boxShadow:tone===t.key?"0 0 14px rgba(212,175,55,.15)":"none"}}>
                    <div style={{fontSize:16,marginBottom:2}}>{t.emoji}</div>
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:1,fontWeight:700,color:tone===t.key?G.gold:"rgba(212,175,55,.65)"}}>{t.label.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Coach sub-tabs */}
            <div style={{...gc,display:"flex",marginBottom:14,padding:"0 4px",background:"rgba(3,2,1,.78)",overflowX:"auto"}}>
              {COACH_TABS.map(([key,icon])=>(
                <div key={key} className="tp" onClick={()=>setTab(key)}
                  style={{flex:1,padding:"9px 4px",textAlign:"center",fontFamily:"'Cinzel',serif",fontSize:11,
                    color:tab===key?G.gold:"rgba(212,175,55,.6)",
                    borderBottom:tab===key?`2px solid ${G.gold}`:"2px solid transparent",
                    marginBottom:-1,minWidth:44}}>
                  <div>{icon}</div>
                  <div style={{fontSize:6,letterSpacing:1,marginTop:1,fontWeight:700}}>{COACH_LABELS[key].toUpperCase()}</div>
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
            <div style={{textAlign:"center",marginBottom:20,marginTop:6}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:900,color:G.gold,letterSpacing:3,marginBottom:4}}>📖 MANPOWER-BIBEL</div>
              <div style={{fontFamily:"'Lato',sans-serif",fontSize:12,color:G.muted,lineHeight:1.6}}>Wissen · Prinzipien · Lektionen der Bruderschaft</div>
              <div style={{height:1,background:`linear-gradient(90deg,transparent,rgba(212,175,55,.35),transparent)`,marginTop:10}}/>
            </div>

            {/* Category Filter */}
            {!selectedEntry&&!showNewPost&&(
              <div style={{overflowX:"auto",display:"flex",gap:8,paddingBottom:8,marginBottom:12,WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
                {["alle","Mindset","Dating","Frauen","Finanzen","Fitness","Lifestyle"].map(cat=>(
                  <button key={cat} onClick={()=>setBibleCategory(cat)}
                    style={{flexShrink:0,background:bibleCategory===cat?"rgba(212,175,55,.2)":"rgba(255,255,255,.05)",border:`1px solid ${bibleCategory===cat?"rgba(212,175,55,.6)":"rgba(255,255,255,.1)"}`,borderRadius:20,padding:"6px 14px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:1,color:bibleCategory===cat?"#D4AF37":"rgba(255,255,255,.5)",whiteSpace:"nowrap",transition:"all .2s"}}>
                    {cat==="alle"?"🔥 ALLE":cat.toUpperCase()}
                  </button>
                ))}
              </div>
            )}

            {/* Admin: Neuer Beitrag Button */}
            {isAdmin&&!showNewPost&&!selectedEntry&&(
              <>
                <MBtn onClick={()=>setShowNewPost(true)}>
                  ✍️  NEUEN BEITRAG ERSTELLEN
                </MBtn>
                <div style={{display:"flex",gap:8,marginBottom:14}}>
                  <button onClick={()=>{ setShowAdminPanel(s=>!s); if(!showAdminPanel) loadAdminData(); }}
                    style={{flex:1,background:"rgba(201,103,125,.08)",border:"1px solid rgba(201,103,125,.25)",color:"rgba(201,103,125,.7)",padding:"10px",cursor:"pointer",borderRadius:10,fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:3}}>
                    👑 ADMIN {showAdminPanel?"▲":"▼"}
                  </button>
                  <button onClick={()=>setShowStats(s=>!s)}
                    style={{flex:1,background:"rgba(92,184,122,.08)",border:"1px solid rgba(92,184,122,.25)",color:"rgba(92,184,122,.7)",padding:"10px",cursor:"pointer",borderRadius:10,fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:3}}>
                    📊 STATS {showStats?"▲":"▼"}
                  </button>
                  <button onClick={()=>{setShowInvites(s=>!s);if(!showInvites)loadInvites();}}
                    style={{flex:1,background:"rgba(212,175,55,.08)",border:"1px solid rgba(212,175,55,.25)",color:"rgba(212,175,55,.7)",padding:"10px",cursor:"pointer",borderRadius:10,fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:3}}>
                    🔗 INVITE {showInvites?"▲":"▼"}
                  </button>
                </div>
                {showStats&&(
                  <div style={{...gc,padding:"14px",marginBottom:16,borderColor:"rgba(92,184,122,.2)",background:"rgba(3,2,1,.85)"}}>
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:700,color:"rgba(92,184,122,.8)",letterSpacing:2,marginBottom:14}}>📊 STATISTIKEN</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
                      {[
                        ["📖","Beiträge",bibleEntries.length],
                        ["🔥","Reaktionen",Object.values(entryReactions).reduce((a,b)=>a+Object.values(b).reduce((c,d)=>c+(Array.isArray(d)?d.length:0),0),0)],
                        ["💬","Kommentare",Object.values(entryComments).reduce((a,b)=>a+(Array.isArray(b)?b.length:0),0)],
                        ["✓","Leser",Object.keys(readEntries).length],
                      ].map(([icon,label,val])=>(
                        <div key={label} style={{background:"rgba(92,184,122,.06)",border:"1px solid rgba(92,184,122,.15)",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
                          <div style={{fontSize:20,marginBottom:4}}>{icon}</div>
                          <div style={{fontFamily:"'Cinzel',serif",fontSize:16,fontWeight:900,color:"rgba(92,184,122,.9)"}}>{val}</div>
                          <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(92,184,122,.5)"}}>{label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2,color:"rgba(92,184,122,.5)",marginBottom:8}}>TOP BEITRÄGE</div>
                    {[...bibleEntries].sort((a,b)=>{
                      const ra=Object.values(entryReactions[a.id]||{}).reduce((x,y)=>x+(Array.isArray(y)?y.length:0),0);
                      const rb=Object.values(entryReactions[b.id]||{}).reduce((x,y)=>x+(Array.isArray(y)?y.length:0),0);
                      return rb-ra;
                    }).slice(0,5).map((e,i)=>{
                      const r=Object.values(entryReactions[e.id]||{}).reduce((x,y)=>x+(Array.isArray(y)?y.length:0),0);
                      const c=Array.isArray(entryComments[e.id])?entryComments[e.id].length:0;
                      return (
                        <div key={e.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid rgba(92,184,122,.08)"}}>
                          <span style={{fontFamily:"'Cinzel',serif",fontSize:11,color:"rgba(92,184,122,.4)",width:16}}>{i+1}</span>
                          <div style={{flex:1,fontFamily:"'Lato',sans-serif",fontSize:11,color:"rgba(245,237,232,.7)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.title}</div>
                          <span style={{fontSize:11}}>🔥{r}</span>
                          <span style={{fontSize:11}}>💬{c}</span>
                        </div>
                      );
                    })}
                    {/* Bulk categorize button */}
                    {bibleEntries.filter(e=>!e.category).length>0&&(
                      <button onClick={bulkCategorize}
                        style={{width:"100%",marginTop:12,background:"rgba(212,175,55,.1)",border:"1px solid rgba(212,175,55,.25)",color:"#D4AF37",padding:"10px",cursor:"pointer",borderRadius:8,fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2}}>
                        🤖 {bibleEntries.filter(e=>!e.category).length} BEITRÄGE AUTO-KATEGORISIEREN
                      </button>
                    )}
                    {saveStatus&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:11,color:"rgba(212,175,55,.6)",textAlign:"center",marginTop:8}}>{saveStatus}</div>}
                  </div>
                )}
                {showInvites&&(
                  <div style={{...gc,padding:"14px",marginBottom:16,borderColor:"rgba(212,175,55,.2)",background:"rgba(3,2,1,.85)"}}>
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:700,color:"#D4AF37",letterSpacing:2,marginBottom:14}}>🔗 EINLADUNGSLINKS</div>
                    <button onClick={generateInvite} disabled={generatingInvite}
                      style={{width:"100%",background:"linear-gradient(135deg,#3d2800,#D4AF37)",border:"none",borderRadius:8,padding:"12px",cursor:generatingInvite?"not-allowed":"pointer",fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3,color:"#0a0806",fontWeight:900,marginBottom:12}}>
                      {generatingInvite?"ERSTELLE…":"➕ NEUEN LINK GENERIEREN"}
                    </button>
                    <div style={{fontFamily:"'Lato',sans-serif",fontSize:11,color:"rgba(212,175,55,.4)",marginBottom:10}}>Links sind 7 Tage gültig · Einmalig verwendbar</div>
                    {inviteLinks.map(inv=>{
                      const used=!!inv.used_by;
                      const expired=new Date(inv.expires_at)<new Date();
                      const link=`${window.location.origin}?invite=${inv.code}`;
                      return (
                        <div key={inv.id} style={{borderBottom:"1px solid rgba(212,175,55,.08)",padding:"10px 0",display:"flex",alignItems:"center",gap:8}}>
                          <div style={{flex:1}}>
                            <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2,color:used?"rgba(92,184,122,.7)":expired?"rgba(224,92,106,.6)":"#D4AF37",marginBottom:2}}>
                              {used?`✅ ${inv.used_by}`:expired?"⏰ ABGELAUFEN":"🟢 AKTIV"} · {inv.code}
                            </div>
                            {!used&&!expired&&(
                              <div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:"rgba(212,175,55,.35)",wordBreak:"break-all"}}>{link}</div>
                            )}
                          </div>
                          {!used&&(
                            <button onClick={()=>{ navigator.clipboard.writeText(link).catch(()=>{}); alert("✅ Kopiert!"); }}
                              style={{background:"rgba(212,175,55,.1)",border:"1px solid rgba(212,175,55,.2)",color:"#D4AF37",padding:"4px 8px",cursor:"pointer",borderRadius:6,fontFamily:"'Cinzel',serif",fontSize:7,flexShrink:0}}>📋</button>
                          )}
                          <button onClick={()=>deleteInvite(inv.id)}
                            style={{background:"rgba(224,92,106,.1)",border:"1px solid rgba(224,92,106,.2)",color:"#ff8a95",padding:"4px 8px",cursor:"pointer",borderRadius:6,fontFamily:"'Cinzel',serif",fontSize:7,flexShrink:0}}>🗑️</button>
                        </div>
                      );
                    })}
                    {inviteLinks.length===0&&<div style={{textAlign:"center",color:"rgba(212,175,55,.3)",fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2,padding:"20px 0"}}>NOCH KEINE LINKS</div>}
                  </div>
                )}

                {showAdminPanel&&(
                  <div style={{...gc,padding:"14px",marginBottom:16,borderColor:"rgba(201,103,125,.2)",background:"rgba(3,2,1,.85)"}}>
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:10,fontWeight:700,color:"rgba(201,103,125,.8)",letterSpacing:2,marginBottom:14}}>👑 ADMIN-PANEL</div>

                    {/* Members */}
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:G.gold,marginBottom:8}}>MITGLIEDER</div>
                    {loadingLogs?<Spin text="LADE…"/>:members.map(m=>(
                      <div key={m.id} style={{...gc,padding:"10px 12px",marginBottom:8,background:"rgba(3,2,1,.7)"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                          <div>
                            <span style={{fontFamily:"'Cinzel',serif",fontSize:10,color:G.gold,fontWeight:700}}>{m.username.toUpperCase()}</span>
                            <span style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:m.active?"#5cb87a":"#e05c6a",marginLeft:8}}>{m.active?"✅ Aktiv":"❌ Gesperrt"}</span>
                          </div>
                          <div style={{display:"flex",gap:5}}>
                            <button onClick={()=>resetDevice(m.id)}
                              style={{background:"rgba(212,175,55,.1)",border:"1px solid rgba(212,175,55,.2)",color:G.gold,padding:"3px 8px",cursor:"pointer",borderRadius:8,fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:1}}>
                              📱 GERÄT RESET
                            </button>
                          </div>
                        </div>
                        <div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:G.muted}}>
                          {m.device_id?`📱 Gerät gebunden`:"📱 Kein Gerät"} · 
                          {m.last_seen?` Zuletzt: ${new Date(m.last_seen).toLocaleString("de-DE")}`:" Noch nie"}
                        </div>
                        {m.expires_at&&(
                          <div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:new Date(m.expires_at)<new Date()?"#e05c6a":"#5cb87a",marginTop:3}}>
                            ⏰ Läuft ab: {new Date(m.expires_at).toLocaleDateString("de-DE")}
                          </div>
                        )}
                        <div style={{display:"flex",gap:4,marginTop:6,flexWrap:"wrap"}}>
                          {[7,14,30,90].map(d=>(
                            <button key={d} onClick={()=>setExpiry(m.id,d)}
                              style={{background:"rgba(92,184,122,.1)",border:"1px solid rgba(92,184,122,.2)",color:"#5cb87a",padding:"3px 7px",cursor:"pointer",borderRadius:6,fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:1}}>
                              +{d}T
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Login Logs */}
                    <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:G.gold,marginBottom:8,marginTop:12}}>LOGIN-PROTOKOLL</div>
                    {loginLogs.slice(0,20).map((log,i)=>(
                      <div key={log.id||i} style={{...gc,padding:"8px 11px",marginBottom:5,background:"rgba(3,2,1,.6)",
                        borderColor:log.status==="success"?"rgba(92,184,122,.2)":log.status.startsWith("blocked")?"rgba(224,92,106,.2)":"rgba(212,175,55,.12)"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <span style={{fontFamily:"'Cinzel',serif",fontSize:9,color:G.gold}}>{log.username?.toUpperCase()}</span>
                          <span style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:
                            log.status==="success"?"#5cb87a":
                            log.status.startsWith("blocked")?"#e05c6a":
                            "#c9a96e"}}>
                            {log.status==="success"?"✅ Erfolg":
                             log.status==="blocked_device"?"🚫 Falsches Gerät":
                             log.status==="blocked_expired"?"⏰ Abgelaufen":
                             log.status==="blocked_inactive"?"❌ Gesperrt":
                             log.status==="failed"?"❌ Falsch":"⏳"}
                          </span>
                        </div>
                        <div style={{fontFamily:"'Lato',sans-serif",fontSize:8,color:G.muted,marginTop:2}}>
                          {new Date(log.created_at).toLocaleString("de-DE")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Admin: Neuer Beitrag Form */}
            {isAdmin&&showNewPost&&(
              <div style={{...gc,padding:"16px",marginBottom:16,background:"rgba(3,2,1,.82)",borderColor:"rgba(212,175,55,.28)"}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3,color:G.gold,marginBottom:12}}>✍️ NEUER BEITRAG</div>
                <SL>TITEL</SL>
                <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="Titel (optional)..."
                  style={{...gc,width:"100%",padding:"9px 11px",color:G.text,fontFamily:"'Lato',sans-serif",fontSize:13,marginBottom:10,background:"rgba(3,2,1,.65)",borderColor:"rgba(212,175,55,.2)"}}/>
                <SL>KATEGORIE <span style={{fontSize:9,color:"rgba(212,175,55,.4)",letterSpacing:0,textTransform:"none",fontFamily:"'Lato',sans-serif"}}>· KI erkennt automatisch wenn leer</span></SL>
                <select value={newCategory} onChange={e=>setNewCategory(e.target.value)}
                  style={{...gc,width:"100%",padding:"9px 11px",color:newCategory?G.text:"rgba(212,175,55,.35)",fontFamily:"'Lato',sans-serif",fontSize:13,marginBottom:10,background:"rgba(3,2,1,.65)",borderColor:"rgba(212,175,55,.2)",cursor:"pointer"}}>
                  <option value="">🤖 KI bestimmt automatisch</option>
                  {["Mindset","Dating","Frauen","Finanzen","Fitness","Lifestyle"].map(c=><option key={c} value={c} style={{background:"#0a0600"}}>{c}</option>)}
                </select>
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

                {/* MUSIK */}
                <MusicPicker
                  musicUrl={newMusicUrl} setMusicUrl={setNewMusicUrl}
                  musicStart={newMusicStart} setMusicStart={setNewMusicStart}
                  musicEnd={newMusicEnd} setMusicEnd={setNewMusicEnd}
                  MUSIC_FILES={musicFiles} setMusicFiles={f=>{setMusicFiles(f);localStorage.setItem("mp_music_files",JSON.stringify(f));}} G={G} gc={gc} isAdmin={isAdmin} loadingMusic={loadingMusic}
                />

                <div style={{display:"flex",gap:8}}>
                  <MBtn onClick={savePost} disabled={savingPost}>
                    {savingPost?(saveStatus||"SPEICHERE…"):"💾  SPEICHERN"}
                  </MBtn>
                  <button onClick={()=>{setShowNewPost(false);setNewTitle("");setNewContent("");setNewImages([]);setBlendModes([]);setNewBgImage(null);setUseBgImage(false);setNewMusicUrl("");setNewMusicStart(0);setNewMusicEnd(0);}}
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
                <button onClick={()=>{ setSelectedEntry(null); if(audioRef.current){audioRef.current.pause();audioRef.current=null;} }}
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
                      <div
                        style={{position:"relative",width:"100%",paddingBottom:"100%",background:"rgba(3,2,1,.8)",cursor:"pointer",touchAction:"pan-y pinch-zoom"}}
                        onTouchStart={e=>{ touchStartX.current = e.touches[0].clientX; }}
                        onTouchEnd={e=>{
                          if(touchStartX.current===null) return;
                          const diff = touchStartX.current - e.changedTouches[0].clientX;
                          if(Math.abs(diff)>40){
                            if(diff>0 && carouselIdx<imgs.length-1) setCarouselIdx(i=>i+1);
                            if(diff<0 && carouselIdx>0) setCarouselIdx(i=>i-1);
                          } else {
                            setModalIdx(carouselIdx);
                            setModalOpen(true);
                          }
                          touchStartX.current=null;
                        }}
                        onClick={e=>{
                          if(e.target.tagName==="BUTTON") return;
                          setModalIdx(carouselIdx);
                          setModalOpen(true);
                        }}
                      >
                        {/* Background layer - shown when blend mode is active */}
                        {(()=>{
                          try{
                            const bm=JSON.parse(selectedEntry?.blend_modes||"[]");
                            const bgImg=selectedEntry?.bg_image;
                            if(bm[carouselIdx]&&bgImg){
                              return <img src={bgImg} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center",display:"block",zIndex:1}}/>;
                            }
                          }catch{}
                          return null;
                        })()}
                        {/* Gradient overlay for text readability */}
                        {(()=>{ let b=false; try{b=!!JSON.parse(selectedEntry?.blend_modes||"[]")[carouselIdx];}catch{} return b?(
                          <div style={{position:"absolute",inset:0,zIndex:3,pointerEvents:"none",
                            background:"linear-gradient(to top,rgba(0,0,0,.75) 0%,rgba(0,0,0,.52) 28%,rgba(0,0,0,.2) 52%,rgba(0,0,0,.04) 72%,transparent 100%)"
                          }}/>
                        ):null; })()}
                        {/* Text image layer - render all, show current instantly */}
                        {imgs.map((imgSrc,imgIdx)=>{
                          let blendActive=false;
                          try{const bm=JSON.parse(selectedEntry?.blend_modes||"[]");blendActive=!!bm[imgIdx];}catch{}
                          return <img key={imgIdx} src={imgSrc} alt="" style={{
                            position:"absolute",inset:0,width:"100%",height:"100%",
                            objectFit:"cover",objectPosition:"center",display:"block",zIndex:4,
                            mixBlendMode:blendActive?"screen":"normal",
                            filter:blendActive
                              ?"brightness(1.6) contrast(1.5) drop-shadow(0px 0px 2px #000) drop-shadow(0px 0px 5px #000) drop-shadow(0px 0px 10px #000) drop-shadow(3px 3px 0px #000) drop-shadow(-3px -3px 0px #000) drop-shadow(3px -3px 0px #000) drop-shadow(-3px 3px 0px #000)"
                              :"none",
                            opacity: imgIdx===carouselIdx?1:0,
                            transition:"opacity 0.15s ease"
                          }}/>;
                        })}
                        {/* Left arrow */}
                        {imgs.length>1&&carouselIdx>0&&(
                          <button onClick={e=>{e.stopPropagation();setCarouselIdx(i=>i-1);}}
                            style={{position:"absolute",left:10,bottom:"10%",background:"rgba(0,0,0,.6)",border:"1px solid rgba(212,175,55,.2)",color:"#fff",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)",zIndex:10}}>‹</button>
                        )}
                        {/* Right arrow */}
                        {imgs.length>1&&carouselIdx<imgs.length-1&&(
                          <button onClick={e=>{e.stopPropagation();setCarouselIdx(i=>i+1);}}
                            style={{position:"absolute",right:10,bottom:"10%",background:"rgba(0,0,0,.6)",border:"1px solid rgba(212,175,55,.2)",color:"#fff",width:32,height:32,borderRadius:"50%",cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)",zIndex:10}}>›</button>
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

                  {/* Reactions */}
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:16,marginBottom:8}}>
                    {["🔥","💯","👑","💪","🎯"].map(emoji=>{
                      const reacted=(entryReactions[selectedEntry.id]?.[emoji]||[]).includes(user.username);
                      const count=(entryReactions[selectedEntry.id]?.[emoji]||[]).length;
                      return <button key={emoji} onClick={()=>toggleReaction(selectedEntry.id,emoji)}
                        style={{background:reacted?"rgba(212,175,55,.2)":"rgba(255,255,255,.05)",border:`1px solid ${reacted?"rgba(212,175,55,.5)":"rgba(255,255,255,.1)"}`,borderRadius:20,padding:"5px 10px",cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",gap:4}}>
                        {emoji}{count>0&&<span style={{fontFamily:"'Lato',sans-serif",fontSize:11,color:reacted?"#D4AF37":"rgba(255,255,255,.5)"}}>{count}</span>}
                      </button>;
                    })}
                  </div>

                  {/* Comments toggle */}
                  <button onClick={()=>setShowComments(s=>!s)}
                    style={{background:"rgba(212,175,55,.07)",border:"1px solid rgba(212,175,55,.18)",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:"rgba(212,175,55,.7)",marginBottom:showComments?10:0,width:"100%",textAlign:"left"}}>
                    💬 KOMMENTARE {entryComments[selectedEntry.id]?.length>0?`(${entryComments[selectedEntry.id].length})`:""}  {showComments?"▲":"▼"}
                  </button>
                  {showComments&&(
                    <div style={{marginBottom:12}}>
                      {(entryComments[selectedEntry.id]||[]).map((c,i)=>(
                        <div key={i} style={{borderBottom:"1px solid rgba(212,175,55,.08)",padding:"8px 0"}}>
                          <div style={{fontFamily:"'Cinzel',serif",fontSize:7,color:"rgba(212,175,55,.6)",marginBottom:3,letterSpacing:1}}>{c.username.toUpperCase()}</div>
                          <div style={{fontFamily:"'Lato',sans-serif",fontSize:12,color:"rgba(245,237,232,.8)"}}>{c.text}</div>
                        </div>
                      ))}
                      <div style={{display:"flex",gap:8,marginTop:10}}>
                        <input value={newComment} onChange={e=>setNewComment(e.target.value)}
                          onKeyDown={e=>e.key==="Enter"&&addComment(selectedEntry.id)}
                          placeholder="Kommentar schreiben…"
                          style={{flex:1,background:"rgba(0,0,0,.4)",border:"1px solid rgba(212,175,55,.2)",borderRadius:6,padding:"8px 10px",color:"#F5F0E8",fontFamily:"'Lato',sans-serif",fontSize:12}}/>
                        <button onClick={()=>addComment(selectedEntry.id)}
                          style={{background:"rgba(212,175,55,.15)",border:"1px solid rgba(212,175,55,.3)",borderRadius:6,padding:"8px 12px",cursor:"pointer",color:"#D4AF37",fontSize:14}}>➤</button>
                      </div>
                    </div>
                  )}

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
                        style={{...gc,padding:"10px",textAlign:"center",marginBottom:8,borderStyle:"dashed",borderColor:"rgba(212,175,55,.18)",background:"rgba(3,2,1,.5)",cursor:"pointer"}}>
                        <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:G.gold}}>+ Neue Bilder hinzufügen</div>
                        <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:G.muted,marginTop:2}}>Bestehende Bilder bleiben erhalten</div>
                      </div>
                      <input ref={bibleImageRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={async e=>await handleBibleImages(e.target.files)}/>
                      {/* New images with blend toggle */}
                      {newImages.length>0&&(
                        <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
                          {newImages.map((img,i)=>(
                            <div key={i} style={{...gc,overflow:"hidden",borderColor:"rgba(212,175,55,.18)"}}>
                              <div style={{position:"relative"}}>
                                <img src={img.dataUrl} alt="" style={{width:"100%",height:70,objectFit:"cover",display:"block"}}/>
                                <button onClick={()=>setNewImages(prev=>prev.filter((_,j)=>j!==i))}
                                  style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,.85)",border:"none",color:"#ff7b7b",width:18,height:18,borderRadius:"50%",cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                                <div style={{position:"absolute",bottom:3,left:6,fontFamily:"'Cinzel',serif",fontSize:7,color:"rgba(212,175,55,.7)",background:"rgba(0,0,0,.6)",padding:"2px 6px",borderRadius:8}}>Neues Bild {i+1}</div>
                              </div>
                              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",background:"rgba(3,2,1,.6)"}}>
                                <div>
                                  <div style={{fontFamily:"'Cinzel',serif",fontSize:7,color:G.gold,letterSpacing:1}}>TEXT-BLEND MODUS</div>
                                  <div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:G.muted}}>Schwarzer Hintergrund unsichtbar</div>
                                </div>
                                <div onClick={()=>setBlendModes(prev=>{const n=[...prev];n[i]=!n[i];return n;})}
                                  style={{width:38,height:20,borderRadius:10,background:blendModes[i]?"rgba(212,175,55,.8)":"rgba(255,255,255,.1)",cursor:"pointer",position:"relative",transition:"all .25s",border:"1px solid rgba(212,175,55,.25)",flexShrink:0}}>
                                  <div style={{position:"absolute",top:2,left:blendModes[i]?18:2,width:14,height:14,borderRadius:"50%",background:blendModes[i]?G.gold3:"rgba(212,175,55,.4)",transition:"all .25s"}}/>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Hintergrundbild im Edit */}
                      <div style={{...gc,padding:"12px",marginBottom:10,borderColor:"rgba(212,175,55,.18)",background:"rgba(3,2,1,.65)"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:useBgImage?10:0}}>
                          <div>
                            <div style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2,color:G.gold,marginBottom:2}}>🖼️ HINTERGRUNDBILD</div>
                            <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:G.muted}}>{editingEntry?.bg_image?"Aktuell vorhanden":"Kein Hintergrundbild"}</div>
                          </div>
                          <div onClick={()=>setUseBgImage(s=>!s)}
                            style={{width:38,height:20,borderRadius:10,background:useBgImage?"rgba(212,175,55,.8)":"rgba(255,255,255,.1)",cursor:"pointer",position:"relative",transition:"all .25s",border:"1px solid rgba(212,175,55,.25)",flexShrink:0}}>
                            <div style={{position:"absolute",top:2,left:useBgImage?18:2,width:14,height:14,borderRadius:"50%",background:useBgImage?G.gold3:"rgba(212,175,55,.4)",transition:"all .25s"}}/>
                          </div>
                        </div>
                        {useBgImage&&(
                          <div>
                            <div className="dz" onClick={()=>bibleBgRef.current?.click()}
                              style={{...gc,padding:"10px",textAlign:"center",borderStyle:"dashed",borderColor:"rgba(212,175,55,.18)",background:"rgba(3,2,1,.5)",cursor:"pointer"}}>
                              {newBgImage?(
                                <div style={{position:"relative"}}>
                                  <img src={newBgImage.dataUrl} alt="" style={{width:"100%",height:70,objectFit:"cover",borderRadius:8,display:"block",opacity:.7}}/>
                                  <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Cinzel',serif",fontSize:8,color:G.gold,letterSpacing:2}}>ÄNDERN</div>
                                  <button onClick={e=>{e.stopPropagation();setNewBgImage(null);setUseBgImage(false);}}
                                    style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,.8)",border:"none",color:"#ff7b7b",width:18,height:18,borderRadius:"50%",cursor:"pointer",fontSize:10}}>✕</button>
                                </div>
                              ):(
                                <>
                                  <div style={{fontSize:16,opacity:.4,marginBottom:3}}>🌅</div>
                                  <div style={{fontFamily:"'Cinzel',serif",fontSize:9,color:G.gold}}>Neues Hintergrundbild wählen</div>
                                </>
                              )}
                            </div>
                            <input ref={bibleBgRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleBgImage(e.target.files[0])}/>
                          </div>
                        )}
                      </div>
                      <MusicPicker
                        musicUrl={newMusicUrl} setMusicUrl={setNewMusicUrl}
                        musicStart={newMusicStart} setMusicStart={setNewMusicStart}
                        musicEnd={newMusicEnd} setMusicEnd={setNewMusicEnd}
                        MUSIC_FILES={musicFiles} setMusicFiles={f=>{setMusicFiles(f);localStorage.setItem("mp_music_files",JSON.stringify(f));}} G={G} gc={gc} isAdmin={isAdmin} loadingMusic={loadingMusic}
                      />
                      <div style={{display:"flex",gap:8}}>
                        <MBtn onClick={saveEdit} disabled={savingPost}>
                          {savingPost?(saveStatus||"SPEICHERE…"):"💾  ÄNDERUNGEN SPEICHERN"}
                        </MBtn>
                        <button onClick={()=>{setEditingEntry(null);setNewTitle("");setNewContent("");setNewImages([]);setBlendModes([]);setNewBgImage(null);setUseBgImage(false);setNewMusicUrl("");setNewMusicStart(0);setNewMusicEnd(0);}}
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
                  <BibleFeed
                    entries={bibleEntries.filter(e=>bibleCategory==="alle"||(e.category||"")===bibleCategory)}
                    entryReactions={entryReactions}
                    entryComments={entryComments}
                    readEntries={readEntries}
                    user={user}
                    G={G}
                    onOpen={openEntry}
                    onReact={toggleReaction}
                    onCommentOpen={(entry)=>{openEntry(entry);setTimeout(()=>setShowComments(true),300);}}
                  />
                )}
              </>
            )}
          </div>
        )}

        <div style={{textAlign:"center",marginTop:24,fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:4,color:"rgba(212,175,55,.12)"}}>
          MANPOWER BRUDERSCHAFT · {localMem.totalAnalyses||0} ANALYSEN
        </div>
      </div>

      {/* ── PROFIL MODAL ── */}
      {showProfile&&(
        <div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,.92)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={e=>{if(e.target===e.currentTarget)setShowProfile(false);}}>
          <div style={{background:"rgba(12,8,2,.97)",border:"1px solid rgba(212,175,55,.25)",borderRadius:12,padding:"28px 24px",width:"100%",maxWidth:420,animation:"fadeUp .3s ease"}}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:900,color:"#D4AF37",letterSpacing:2}}>👤 MEIN PROFIL</div>
              <button onClick={()=>setShowProfile(false)} style={{background:"rgba(212,175,55,.1)",border:"1px solid rgba(212,175,55,.2)",color:"#D4AF37",padding:"5px 14px",cursor:"pointer",borderRadius:16,fontFamily:"'Cinzel',serif",fontSize:8}}>✕</button>
            </div>

            {/* Avatar color picker */}
            <div style={{textAlign:"center",marginBottom:20}}>
              <div style={{width:72,height:72,borderRadius:"50%",background:`linear-gradient(135deg,${profile.avatar_color||"#D4AF37"},#8B6914)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 10px",border:"3px solid rgba(212,175,55,.3)"}}>
                <span style={{fontFamily:"'Cinzel',serif",fontSize:28,fontWeight:900,color:"#0a0806"}}>
                  {(profile.display_name||user?.username||"M")[0].toUpperCase()}
                </span>
              </div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:"rgba(212,175,55,.4)",marginBottom:8}}>FARBE WÄHLEN</div>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap"}}>
                {["#D4AF37","#C0392B","#2980B9","#27AE60","#8E44AD","#E67E22","#1ABC9C","#E91E63"].map(c=>(
                  <div key={c} onClick={()=>setProfile(p=>({...p,avatar_color:c}))}
                    style={{width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:profile.avatar_color===c?"3px solid #fff":"3px solid transparent",transition:"all .2s"}}/>
                ))}
              </div>
            </div>

            {/* Fields */}
            {[
              ["ANZEIGENAME","display_name","Dein Name (optional)"],
              ["STADT","city","z.B. Hamburg"],
              ["BIO","bio","Kurz über dich…"],
            ].map(([label,key,ph])=>(
              <div key={key} style={{marginBottom:12}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:3,color:"rgba(212,175,55,.5)",marginBottom:6}}>{label}</div>
                {key==="bio"?(
                  <textarea value={profile[key]} onChange={e=>setProfile(p=>({...p,[key]:e.target.value}))} placeholder={ph} rows={3}
                    style={{width:"100%",background:"rgba(0,0,0,.4)",border:"1px solid rgba(212,175,55,.2)",borderRadius:6,padding:"10px 12px",color:"#F5F0E8",fontFamily:"'Lato',sans-serif",fontSize:13,resize:"none"}}/>
                ):(
                  <input value={profile[key]} onChange={e=>setProfile(p=>({...p,[key]:e.target.value}))} placeholder={ph}
                    style={{width:"100%",background:"rgba(0,0,0,.4)",border:"1px solid rgba(212,175,55,.2)",borderRadius:6,padding:"10px 12px",color:"#F5F0E8",fontFamily:"'Lato',sans-serif",fontSize:13}}/>
                )}
              </div>
            ))}

            <button onClick={saveProfile} disabled={savingProfile}
              style={{width:"100%",background:"linear-gradient(135deg,#3d2800,#D4AF37,#F5E27A,#D4AF37,#3d2800)",backgroundSize:"200% auto",animation:"shimmer 3s linear infinite",border:"none",borderRadius:8,padding:"14px",color:"#0a0806",fontFamily:"'Cinzel',serif",fontWeight:900,fontSize:11,letterSpacing:4,cursor:savingProfile?"not-allowed":"pointer",marginTop:8}}>
              {savingProfile?"SPEICHERE…":"💾  PROFIL SPEICHERN"}
            </button>
          </div>
        </div>
      )}

      {/* ── ADMIN PANEL ── */}
      {showAdminPanel&&isAdmin&&(
        <div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,.95)",overflowY:"auto"}}>
          <div style={{maxWidth:480,margin:"0 auto",padding:"16px"}}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,paddingTop:10}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:900,color:"#D4AF37"}}>⚙️ ADMIN PANEL</div>
              <button onClick={()=>setShowAdminPanel(false)}
                style={{background:"rgba(212,175,55,.1)",border:"1px solid rgba(212,175,55,.25)",color:"#D4AF37",padding:"6px 16px",cursor:"pointer",borderRadius:18,fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2}}>✕ SCHLIEẞEN</button>
            </div>

            {loadingAdmin?<div style={{textAlign:"center",color:"rgba(212,175,55,.5)",fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3,padding:"30px 0"}}>LADE DATEN…</div>:(
              <>
                {/* Members */}
                <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3,color:"rgba(212,175,55,.6)",marginBottom:10}}>👥 MITGLIEDER ({members.length})</div>
                {members.map(m=>(
                  <div key={m.id} style={{background:"rgba(5,3,1,.85)",border:"1px solid rgba(212,175,55,.18)",borderRadius:10,padding:"12px",marginBottom:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <div style={{fontFamily:"'Cinzel',serif",fontSize:11,fontWeight:700,color:m.active?"#D4AF37":"rgba(212,175,55,.3)"}}>{m.username.toUpperCase()}</div>
                      <div style={{display:"flex",gap:5}}>
                        <button onClick={()=>toggleActive(m.id,m.active)}
                          style={{background:m.active?"rgba(92,184,122,.12)":"rgba(224,92,106,.12)",border:`1px solid ${m.active?"rgba(92,184,122,.3)":"rgba(224,92,106,.3)"}`,color:m.active?"#5cb87a":"#e05c6a",padding:"3px 8px",cursor:"pointer",borderRadius:10,fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:1}}>
                          {m.active?"✅ AKTIV":"❌ GESPERRT"}
                        </button>
                      </div>
                    </div>
                    <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(212,175,55,.4)",marginBottom:4}}>
                      📱 Gerät: {m.device_id?m.device_id.slice(0,20)+"…":"Nicht gebunden"}
                      {m.device_id&&<button onClick={()=>resetDevice(m.id)} style={{marginLeft:8,background:"rgba(212,175,55,.08)",border:"1px solid rgba(212,175,55,.2)",color:"#D4AF37",padding:"1px 6px",cursor:"pointer",borderRadius:8,fontFamily:"'Cinzel',serif",fontSize:6}}>RESET</button>}
                    </div>
                    <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(212,175,55,.4)",marginBottom:6}}>
                      🕐 Zuletzt: {m.last_seen?new Date(m.last_seen).toLocaleString("de-DE"):"Nie"}
                      &nbsp;|&nbsp;
                      ⏰ Läuft ab: {m.expires_at?new Date(m.expires_at).toLocaleDateString("de-DE"):"Kein Limit"}
                    </div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {[7,14,30,90].map(d=>(
                        <button key={d} onClick={()=>setExpiry(m.id,d)}
                          style={{background:"rgba(212,175,55,.07)",border:"1px solid rgba(212,175,55,.18)",color:"rgba(212,175,55,.6)",padding:"3px 8px",cursor:"pointer",borderRadius:8,fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:1}}>
                          +{d}T
                        </button>
                      ))}
                      <button onClick={()=>setExpiry(m.id,null)}
                        style={{background:"rgba(92,184,122,.07)",border:"1px solid rgba(92,184,122,.2)",color:"#5cb87a",padding:"3px 8px",cursor:"pointer",borderRadius:8,fontFamily:"'Cinzel',serif",fontSize:6,letterSpacing:1}}>
                        ∞ UNBEGRENZT
                      </button>
                    </div>
                  </div>
                ))}

                {/* Login Logs */}
                <div style={{fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:3,color:"rgba(212,175,55,.6)",marginBottom:10,marginTop:20}}>📋 LOGIN-PROTOKOLL</div>
                {loginLogs.map((log,i)=>(
                  <div key={log.id||i} style={{background:"rgba(5,3,1,.85)",border:`1px solid ${log.status==="success"?"rgba(92,184,122,.2)":log.status==="failed"?"rgba(224,92,106,.2)":"rgba(230,126,34,.2)"}`,borderRadius:8,padding:"9px 11px",marginBottom:6}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontFamily:"'Cinzel',serif",fontSize:9,fontWeight:700,color:log.status==="success"?"#5cb87a":log.status==="failed"?"#e05c6a":"#e67e22"}}>
                        {log.status==="success"?"✅":log.status==="failed"?"❌":log.status==="blocked_device"?"📱🚫":log.status==="blocked_expired"?"⏰🚫":"🔒"} {log.username?.toUpperCase()}
                      </span>
                      <span style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:"rgba(212,175,55,.35)"}}>{new Date(log.created_at).toLocaleString("de-DE")}</span>
                    </div>
                    <div style={{fontFamily:"'Lato',sans-serif",fontSize:9,color:"rgba(212,175,55,.35)"}}>
                      {log.status} · {log.device_id?.slice(0,16)}…
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── FULLSCREEN MODAL ── */}
      {modalOpen&&(()=>{
        let imgs=[];
        try{imgs=JSON.parse(selectedEntry?.image_url||"[]");}catch{imgs=[selectedEntry?.image_url];}
        const blendActive=(i)=>{try{return JSON.parse(selectedEntry?.blend_modes||"[]")[i]||false;}catch{return false;}};
        const bgImg=selectedEntry?.bg_image;
        return (
          <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.96)",display:"flex",flexDirection:"column",touchAction:"none",overscrollBehavior:"none"}}
            onTouchStart={e=>{modalTouchX.current=e.touches[0].clientX;}}
            onTouchEnd={e=>{
              const dx=modalTouchX.current-e.changedTouches[0].clientX;
              if(Math.abs(dx)>40){
                if(dx>0&&modalIdx<imgs.length-1) setModalIdx(i=>i+1);
                if(dx<0&&modalIdx>0) setModalIdx(i=>i-1);
              }
              modalTouchX.current=null;
            }}
            onClick={e=>{
              if(e.target===e.currentTarget) setModalOpen(false);
            }}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:"1px solid rgba(212,175,55,.15)"}}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:10,letterSpacing:2,color:"rgba(212,175,55,.6)"}}>{modalIdx+1} / {imgs.length}</div>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(212,175,55,.35)"}}>Tippe außerhalb zum Schließen</div>
                <button onClick={()=>setModalOpen(false)}
                  style={{background:"rgba(212,175,55,.12)",border:"1px solid rgba(212,175,55,.3)",color:"#D4AF37",padding:"7px 18px",cursor:"pointer",borderRadius:18,fontFamily:"'Cinzel',serif",fontSize:9,letterSpacing:2}}>
                  ✕
                </button>
              </div>
            </div>
            {/* Image */}
            <div style={{flex:1,position:"relative",overflow:"hidden"}}>
              {blendActive(modalIdx)&&bgImg&&(
                <img src={bgImg} alt="" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center",zIndex:1}}/>
              )}
              {/* Gradient for text readability */}
              {blendActive(modalIdx)&&(
                <div style={{position:"absolute",inset:0,zIndex:3,pointerEvents:"none",
                  background:"linear-gradient(to top,rgba(0,0,0,.78) 0%,rgba(0,0,0,.55) 28%,rgba(0,0,0,.22) 52%,rgba(0,0,0,.05) 72%,transparent 100%)"
                }}/>
              )}
              <img src={imgs[modalIdx]} alt="" style={{
                position:"absolute",inset:0,width:"100%",height:"100%",
                objectFit:"contain",objectPosition:"center",zIndex:4,
                mixBlendMode:blendActive(modalIdx)?"screen":"normal",
                filter:blendActive(modalIdx)
                  ?"brightness(1.65) contrast(1.5) drop-shadow(0px 0px 4px #000) drop-shadow(0px 0px 10px #000) drop-shadow(3px 3px 0px #000) drop-shadow(-3px -3px 0px #000) drop-shadow(3px -3px 0px #000) drop-shadow(-3px 3px 0px #000)"
                  :"none"
              }}/>
              {/* Arrows */}
              {modalIdx>0&&<button onClick={()=>setModalIdx(i=>i-1)}
                style={{position:"absolute",left:12,bottom:"12%",background:"rgba(0,0,0,.65)",border:"1px solid rgba(212,175,55,.3)",color:"#fff",width:40,height:40,borderRadius:"50%",cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}}>‹</button>}
              {modalIdx<imgs.length-1&&<button onClick={()=>setModalIdx(i=>i+1)}
                style={{position:"absolute",right:12,bottom:"12%",background:"rgba(0,0,0,.65)",border:"1px solid rgba(212,175,55,.3)",color:"#fff",width:40,height:40,borderRadius:"50%",cursor:"pointer",fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}}>›</button>}
            </div>
            {/* Dots */}
            {imgs.length>1&&(
              <div style={{display:"flex",justifyContent:"center",gap:6,padding:"12px 0",borderTop:"1px solid rgba(212,175,55,.1)"}}>
                {imgs.map((_,i)=>(
                  <div key={i} onClick={()=>setModalIdx(i)}
                    style={{width:modalIdx===i?20:7,height:7,borderRadius:4,background:modalIdx===i?"#D4AF37":"rgba(212,175,55,.25)",cursor:"pointer",transition:"all .25s"}}/>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── COMPONENTS ──────────────────────────────────────────────────────────────
const gc2 = {background:"rgba(5,3,1,0.78)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",border:"1px solid rgba(212,175,55,.18)",borderRadius:12};
function BibleFeed({entries, entryReactions, entryComments, readEntries, user, G, onOpen, onReact, onCommentOpen}) {
  if(!entries||!entries.length) return null;
  try { return (
    <div style={{display:"flex",flexDirection:"column",background:"transparent"}}>
      {entries.map(entry=>{
        let imgs=[];
        try{ const p=JSON.parse(entry.image_url); imgs=Array.isArray(p)?p:(p?[p]:[]); }catch(e){ imgs=entry.image_url?[entry.image_url]:[]; }
        if(!Array.isArray(imgs)) imgs=[];
        let totalReactions=0;
        try{const rv=entryReactions[entry.id]; if(rv)totalReactions=Object.values(rv).reduce((a,b)=>a+(Array.isArray(b)?b.length:0),0);}catch(e){}
        const commentCount=Array.isArray(entryComments[entry.id])?entryComments[entry.id].length:0;
        const fireReactors=entryReactions[entry.id]&&entryReactions[entry.id]["🔥"];
        const hasReacted=Array.isArray(fireReactors)&&fireReactors.includes(user&&user.username);
        return (
          <div key={entry.id} style={{borderBottom:"1px solid rgba(212,175,55,.1)",background:"rgba(0,0,0,.85)",marginBottom:10,borderRadius:4,overflow:"hidden"}}>
            {/* Header - Instagram style */}
            <div style={{display:"flex",alignItems:"center",padding:"10px 12px",gap:10}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(45deg,#D4AF37,#8B6914,#F5E27A)",padding:2,flexShrink:0}}>
                <div style={{width:"100%",height:"100%",borderRadius:"50%",background:"#111",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontFamily:"'Cinzel',serif",fontSize:14,fontWeight:900,color:"#D4AF37"}}>M</span>
                </div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Cinzel',serif",fontSize:12,fontWeight:700,color:"#fff",letterSpacing:.5}}>manpower_bruderschaft</div>
                {readEntries[entry.id]&&<div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(92,184,122,.8)"}}>✓ gelesen</div>}
              </div>
              <div style={{fontSize:20,color:"rgba(255,255,255,.6)",cursor:"pointer"}} onClick={()=>onOpen(entry)}>···</div>
            </div>

            {/* Image */}
            {imgs[0]&&(
              <div style={{position:"relative",width:"100%",background:"#111",overflow:"hidden",cursor:"pointer",userSelect:"none"}}
                onClick={()=>onOpen(entry)}>
                <img src={imgs[0]} alt="" loading="lazy"
                  style={{width:"100%",display:"block",maxHeight:"90vw",objectFit:"cover"}}
                  onError={e=>{e.target.style.display="none";}}
                  draggable="false"
                />
                {imgs.length>1&&(
                  <div style={{position:"absolute",top:10,right:10,background:"rgba(0,0,0,.7)",color:"#fff",fontFamily:"'Lato',sans-serif",fontSize:12,fontWeight:700,padding:"3px 10px",borderRadius:12}}>
                    1/{imgs.length}
                  </div>
                )}
              </div>
            )}

            {/* Action bar - Instagram style */}
            <div style={{padding:"8px 12px 4px"}}>
              <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:8}}>
                {/* Heart/Fire */}
                <button onClick={()=>onReact(entry.id,"🔥")}
                  style={{background:"none",border:"none",cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:5}}>
                  <span style={{fontSize:26,filter:hasReacted?"none":"grayscale(1) opacity(0.5)"}}>{hasReacted?"🔥":"🤍"}</span>
                </button>
                {/* Comment */}
                <button onClick={()=>onCommentOpen(entry)}
                  style={{background:"none",border:"none",cursor:"pointer",padding:0}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
                {/* Bookmark */}
                <button style={{background:"none",border:"none",cursor:"pointer",padding:0,marginLeft:"auto"}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
              </div>

              {/* Likes */}
              {totalReactions>0&&(
                <div style={{fontFamily:"'Lato',sans-serif",fontSize:13,fontWeight:700,color:"#fff",marginBottom:5}}>
                  {totalReactions} {totalReactions===1?"Reaktion":"Reaktionen"}
                </div>
              )}

              {/* Category tag */}
              {entry.category&&(
                <div style={{display:"inline-block",background:"rgba(212,175,55,.12)",border:"1px solid rgba(212,175,55,.25)",borderRadius:12,padding:"2px 10px",marginBottom:6,fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:1,color:"rgba(212,175,55,.7)"}}>
                  {entry.category.toUpperCase()}
                </div>
              )}

              {/* Caption */}
              <div style={{marginBottom:4,cursor:"pointer"}} onClick={()=>onOpen(entry)}>
                <span style={{fontFamily:"'Lato',sans-serif",fontSize:13,fontWeight:700,color:"#fff",marginRight:6}}>manpower_bruderschaft</span>
                <span style={{fontFamily:"'Lato',sans-serif",fontSize:13,color:"rgba(255,255,255,.85)"}}>{(entry.title||"")}</span>
                {entry.content&&<span style={{fontFamily:"'Lato',sans-serif",fontSize:13,color:"rgba(255,255,255,.6)"}}> {(entry.content||"").slice(0,80)}{(entry.content||"").length>80?"…":""}</span>}
              </div>

              {/* Comments */}
              {commentCount>0&&(
                <div style={{fontFamily:"'Lato',sans-serif",fontSize:13,color:"rgba(255,255,255,.4)",marginBottom:4,cursor:"pointer"}} onClick={()=>onCommentOpen(entry)}>
                  Alle {commentCount} Kommentare anzeigen
                </div>
              )}


            </div>
          </div>
        );
      })}
    </div>
  );
  } catch(err) {
    return <div style={{color:"#ff8a95",fontFamily:"'Lato',sans-serif",fontSize:12,padding:16,textAlign:"center"}}>Fehler: {err&&err.message}</div>;
  }
}


function SL({children}){return <div style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:3,color:"rgba(212,175,55,.75)",marginBottom:8,textTransform:"uppercase",fontWeight:600}}>{children}</div>;}
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

// ── MUSIC PICKER COMPONENT ───────────────────────────────────────────────────
function MusicPicker({musicUrl,setMusicUrl,musicStart,setMusicStart,musicEnd,setMusicEnd,MUSIC_FILES,setMusicFiles,G,gc,isAdmin,loadingMusic}){
  const [preview, setPreview] = useState(null);
  const [newFileName, setNewFileName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");

  const fmtTime=(s)=>{ const m=Math.floor(s/60),sec=Math.floor(s%60); return `${m}:${sec.toString().padStart(2,"0")}`; };
  const parseSec=(str)=>{ if(!str) return 0; if(str.includes(":")){ const [m,s]=str.split(":"); return parseInt(m)*60+parseFloat(s||0); } return parseFloat(str)||0; };

  const startPreview=()=>{
    if(preview){preview.pause();setPreview(null);return;}
    if(!musicUrl) return;
    const a=new Audio(musicUrl.startsWith("http") ? musicUrl : "/"+musicUrl);
    a.currentTime=musicStart||0; a.volume=0.7;
    const end=musicEnd||0;
    if(end>0){ a.ontimeupdate=()=>{ if(a.currentTime>=end){a.pause();setPreview(null);} }; }
    a.onerror=()=>{ alert("⚠️ Song konnte nicht geladen werden. Prüfe ob die Datei im Supabase Storage public ist."); setPreview(null); };
    a.onended=()=>setPreview(null);
    a.play().catch(err=>{ console.error("Preview error:",err); });
    setPreview(a);
  };

  const addFile=()=>{
    if(!newFileName.trim()) return;
    const entry={file:newFileName.trim(),name:newDisplayName.trim()||newFileName.trim()};
    setMusicFiles([...MUSIC_FILES,entry]);
    setNewFileName(""); setNewDisplayName("");
  };

  const removeFile=(i)=>{ setMusicFiles(MUSIC_FILES.filter((_,j)=>j!==i)); };

  return (
    <div style={{...gc,padding:"13px",marginBottom:14,borderColor:"rgba(212,175,55,.22)",background:"rgba(3,2,1,.7)"}}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10}}>
        <span style={{fontSize:14}}>🎵</span>
        <span style={{fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:3,color:G.gold}}>MUSIK FÜR DIESEN BEITRAG</span>
      </div>

      {/* Info for admin */}
      {isAdmin&&(
        <div style={{marginBottom:10,padding:"8px 10px",background:"rgba(212,175,55,.05)",borderRadius:8,border:"1px solid rgba(212,175,55,.12)"}}>
          <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:"rgba(212,175,55,.45)"}}>
            👑 MP3 Dateien in GitHub → public Ordner hochladen → automatisch hier sichtbar
          </div>
        </div>
      )}

      {/* Song dropdown */}
      <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:G.muted,marginBottom:6}}>SONG WÄHLEN</div>
      {loadingMusic?(
        <div style={{fontFamily:"'Lato',sans-serif",fontSize:11,color:G.muted,padding:"8px",textAlign:"center"}}>🎵 Lade Songs…</div>
      ):(
        <select value={musicUrl||""} onChange={e=>setMusicUrl(e.target.value)}
          style={{width:"100%",padding:"10px 12px",background:"rgba(3,2,1,.7)",border:"1px solid rgba(212,175,55,.25)",borderRadius:8,color:musicUrl?G.gold:G.muted,fontFamily:"'Lato',sans-serif",fontSize:13,cursor:"pointer",marginBottom:10,WebkitAppearance:"none",outline:"none"}}>
          <option value="" style={{background:"#0a0600",color:"#888"}}>🔇 Keine Musik</option>
          {MUSIC_FILES.map((f,i)=>{
            const file=typeof f==="object"?f.file:f;
            const name=typeof f==="object"?f.name:f;
            return <option key={i} value={file} style={{background:"#0a0600",color:"#D4AF37"}}>🎵 {name}</option>;
          })}
        </select>
      )}
      {MUSIC_FILES.length===0&&!loadingMusic&&(
        <div style={{fontFamily:"'Lato',sans-serif",fontSize:11,color:G.muted,marginBottom:8,textAlign:"center"}}>
          Keine MP3s gefunden – lade MP3 Dateien in GitHub → public Ordner hoch
        </div>
      )}

      {musicUrl&&(
        <>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
            <div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:G.muted,marginBottom:4}}>▶️ START (z.B. 0:30)</div>
              <input defaultValue={fmtTime(musicStart)} onBlur={e=>setMusicStart(parseSec(e.target.value))} placeholder="0:00"
                style={{...gc,width:"100%",padding:"8px 10px",color:G.text,fontFamily:"'Lato',sans-serif",fontSize:13,background:"rgba(3,2,1,.6)",borderColor:"rgba(212,175,55,.18)"}}/>
            </div>
            <div>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:7,letterSpacing:2,color:G.muted,marginBottom:4}}>⏹️ ENDE (z.B. 0:45)</div>
              <input defaultValue={fmtTime(musicEnd)} onBlur={e=>setMusicEnd(parseSec(e.target.value))} placeholder="0:00"
                style={{...gc,width:"100%",padding:"8px 10px",color:G.text,fontFamily:"'Lato',sans-serif",fontSize:13,background:"rgba(3,2,1,.6)",borderColor:"rgba(212,175,55,.18)"}}/>
            </div>
          </div>
          <div style={{fontFamily:"'Lato',sans-serif",fontSize:10,color:G.muted,marginBottom:10}}>
            Abschnitt: {fmtTime(musicStart)} → {musicEnd>0?fmtTime(musicEnd):"Ende"} · {musicEnd>0?Math.round(musicEnd-musicStart)+"s":"ganzer Song"}
          </div>
          <button onClick={startPreview}
            style={{width:"100%",background:preview?"rgba(224,92,106,.15)":"rgba(212,175,55,.1)",border:`1px solid ${preview?"rgba(224,92,106,.4)":"rgba(212,175,55,.25)"}`,color:preview?"#ff8a95":G.gold,padding:"9px",cursor:"pointer",borderRadius:8,fontFamily:"'Cinzel',serif",fontSize:8,letterSpacing:2}}>
            {preview?"⏹️  PREVIEW STOPPEN":"▶️  PREVIEW ANHÖREN"}
          </button>
        </>
      )}
    </div>
  );
}
