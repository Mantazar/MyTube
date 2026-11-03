import { searchVideos, getStreams, normalizeBase } from "./api/piped.js";
import { store } from "./database/db.js";

const $ = (id) => document.getElementById(id);
const grid = $("video-grid");
const notice = $("notice");
let currentVideo = null;
let activeView = "home";
let currentResults = [];

function showNotice(message) { notice.textContent = message; notice.hidden = false; }
function clearNotice() { notice.hidden = true; notice.textContent = ""; }
function safeText(value="") { return String(value); }
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return "";
  const h=Math.floor(seconds/3600), m=Math.floor(seconds%3600/60), s=seconds%60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}
function renderVideos(videos) {
  currentResults = videos;
  grid.innerHTML = "";
  $("result-count").textContent = videos.length ? `${videos.length} نتيجة` : "";
  $("empty-state").hidden = videos.length > 0;
  for (const video of videos) {
    const card = document.createElement("article");
    card.className = "video-card";
    const thumb = document.createElement("div"); thumb.className = "thumb-wrap";
    const img = document.createElement("img"); img.loading = "lazy"; img.alt = ""; img.src = video.thumbnail || "";
    img.onerror = () => { img.style.display = "none"; };
    thumb.append(img);
    if (video.duration) { const d=document.createElement("span"); d.className="duration"; d.textContent=formatDuration(video.duration); thumb.append(d); }
    const info=document.createElement("div"); info.className="video-info";
    const dot=document.createElement("div"); dot.className="channel-dot"; dot.textContent=(video.uploaderName||"M").slice(0,1);
    const details=document.createElement("div");
    const title=document.createElement("h3"); title.textContent=safeText(video.title);
    const channel=document.createElement("p"); channel.textContent=safeText(video.uploaderName||"قناة غير معروفة");
    details.append(title,channel); info.append(dot,details); card.append(thumb,info);
    card.addEventListener("click",()=>openVideo(video));
    grid.append(card);
  }
}
async function runSearch(query) {
  const q=query.trim(); if(!q) return;
  clearNotice(); $("view-title").textContent=`نتائج البحث: ${q}`;
  $("welcome").hidden=true; grid.innerHTML="<p>جاري البحث...</p>"; $("empty-state").hidden=true;
  try {
    const videos=await searchVideos(q);
    renderVideos(videos);
    if(!videos.length) showNotice("ما حصلت نتائج. جرّب عبارة ثانية أو غيّر مصدر Piped من الإعدادات.");
  } catch(e) { renderVideos([]); showNotice(e.message || "تعذر الاتصال بمصدر البحث."); }
}
async function openVideo(video) {
  currentVideo=video; clearNotice();
  $("player-title").textContent=video.title||"تشغيل الفيديو";
  $("player-channel").textContent=video.uploaderName||"";
  $("video-player").removeAttribute("src");
  $("player-dialog").showModal();
  $("favorite-toggle").textContent=await store.has("favorites",video.url)?"♥ إزالة من المفضلة":"♡ إضافة للمفضلة";
  $("subscribe-toggle").textContent=await store.has("subscriptions",video.uploaderUrl)?"✓ مشترك":"＋ اشتراك بالقناة";
  try {
    const data=await getStreams(video.id);
    const streams=(data.videoStreams||[]).filter(s=>s.url && s.mimeType && s.mimeType.startsWith("video/"));
    const audio=(data.audioStreams||[]).filter(s=>s.url);
    let chosen=streams.sort((a,b)=>(b.videoOnly?1:0)-(a.videoOnly?1:0))[0];
    if(!chosen && data.hls) { $("video-player").src=data.hls; }
    else if(chosen) { $("video-player").src=chosen.url; }
    else if(audio.length) { $("video-player").src=audio[0].url; }
    else throw new Error("المصدر لم يرجع رابط تشغيل متوافق.");
    $("video-player").play().catch(()=>{});
    await store.addHistory({...video, watchedAt:Date.now()});
  } catch(e) { showNotice(`تعذر تشغيل الفيديو: ${e.message}`); }
}
$("search-form").addEventListener("submit",e=>{e.preventDefault();runSearch($("search-input").value);});
$("hero-search").addEventListener("submit",e=>{e.preventDefault();$("search-input").value=$("hero-input").value;runSearch($("hero-input").value);});
$("player-close").addEventListener("click",()=>{ $("video-player").pause(); $("player-dialog").close(); });
$("favorite-toggle").addEventListener("click",async()=>{
  if(!currentVideo)return;
  const exists=await store.has("favorites",currentVideo.url);
  if(exists) await store.remove("favorites",currentVideo.url); else await store.put("favorites",currentVideo.url,currentVideo);
  $("favorite-toggle").textContent=exists?"♡ إضافة للمفضلة":"♥ إزالة من المفضلة";
});
$("subscribe-toggle").addEventListener("click",async()=>{
  if(!currentVideo?.uploaderUrl)return;
  const exists=await store.has("subscriptions",currentVideo.uploaderUrl);
  if(exists) await store.remove("subscriptions",currentVideo.uploaderUrl);
  else await store.put("subscriptions",currentVideo.uploaderUrl,{url:currentVideo.uploaderUrl,name:currentVideo.uploaderName});
  $("subscribe-toggle").textContent=exists?"＋ اشتراك بالقناة":"✓ مشترك";
});
$("settings-open").addEventListener("click",async()=>{ $("api-base").value=await store.getSetting("apiBase",""); $("settings-dialog").showModal(); });
$("settings-close").addEventListener("click",()=> $("settings-dialog").close());
$("save-settings").addEventListener("click",async()=>{
  try { const value=normalizeBase($("api-base").value); await store.setSetting("apiBase",value); $("settings-dialog").close(); showNotice("تم حفظ عنوان المصدر."); }
  catch(e){showNotice(e.message);}
});
$("export-data").addEventListener("click",async()=>{
  const data=await store.exportAll(); const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="mytube-backup.json";a.click();URL.revokeObjectURL(a.href);
});
$("import-data").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{const data=JSON.parse(await file.text());await store.importAll(data);showNotice("تم استيراد النسخة الاحتياطية.");}
  catch{showNotice("ملف النسخة الاحتياطية غير صالح.");}
  e.target.value="";
});
document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click",async()=>{
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b===btn));
  activeView=btn.dataset.view;$("welcome").hidden=true;clearNotice();
  const labels={home:"الرئيسية",subscriptions:"اشتراكاتي",history:"سجل المشاهدة",favorites:"المفضلة"};
  $("view-title").textContent=labels[activeView];
  if(activeView==="home"){renderVideos([]);$("welcome").hidden=false;return;}
  const data=activeView==="favorites"?await store.list("favorites"):activeView==="history"?await store.list("history"):await store.list("subscriptions");
  if(activeView==="subscriptions"){
    grid.innerHTML="";$("empty-state").hidden=data.length>0;
    for(const sub of data){const el=document.createElement("div");el.className="video-card";el.innerHTML=`<div class="thumb-wrap"></div><div class="video-info"><div class="channel-dot">C</div><div><h3></h3><p></p></div></div>`;el.querySelector("h3").textContent=sub.name||"قناة";el.querySelector("p").textContent="اشتراك محفوظ محلياً";grid.append(el);}
  } else renderVideos(data.reverse());
}));

if(!("indexedDB" in window)) showNotice("متصفحك لا يدعم التخزين المحلي المطلوب.");
