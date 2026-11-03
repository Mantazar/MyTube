import { store } from "../database/db.js";

export function normalizeBase(value) {
  const raw=(value||"").trim().replace(/\/+$/ ,"");
  if(!raw) throw new Error("أضف عنوان Piped API من الإعدادات أولاً.");
  let url; try{url=new URL(raw);}catch{throw new Error("عنوان المصدر غير صحيح.");}
  if(!["https:","http:"].includes(url.protocol)) throw new Error("العنوان يجب أن يبدأ بـ https:// أو http://");
  return raw;
}
async function base(){return normalizeBase(await store.getSetting("apiBase",""));}
async function request(path){
  const url=`${await base()}${path}`;
  const response=await fetch(url,{headers:{Accept:"application/json"}});
  if(!response.ok) throw new Error(`المصدر أعاد حالة ${response.status}.`);
  return response.json();
}
export async function searchVideos(query){
  const data=await request(`/search?q=${encodeURIComponent(query)}&filter=videos`);
  return (Array.isArray(data)?data:[]).filter(v=>v.type==="stream"||v.url).map(v=>({
    id:v.url?.split("v=")[1]||v.url?.split("/").pop(),
    url:v.url, title:v.title, thumbnail:v.thumbnail, duration:v.duration,
    uploaderName:v.uploaderName, uploaderUrl:v.uploaderUrl, views:v.views
  })).filter(v=>v.id);
}
export async function getStreams(id){
  if(!id) throw new Error("معرّف الفيديو غير موجود.");
  return request(`/streams/${encodeURIComponent(id)}`);
}
