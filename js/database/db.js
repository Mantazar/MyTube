const DB_NAME="mytube-db", DB_VERSION=1;
function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{const db=req.result;for(const name of ["favorites","history","subscriptions","settings"])if(!db.objectStoreNames.contains(name))db.createObjectStore(name);};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function transaction(storeName,mode,fn){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,mode),store=tx.objectStore(storeName);
    let request;try{request=fn(store);}catch(e){reject(e);return;}
    tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(tx.error);
    if(request){request.onsuccess=()=>{};request.onerror=()=>reject(request.error);}
  });
}
export const store={
  put:(name,key,value)=>transaction(name,"readwrite",s=>s.put(value,key)),
  get:(name,key)=>transaction(name,"readonly",s=>s.get(key)),
  has:async(name,key)=>(await transaction(name,"readonly",s=>s.getKey(key)))!==undefined,
  remove:(name,key)=>transaction(name,"readwrite",s=>s.delete(key)),
  list:async name=>{const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(name,"readonly"),r=tx.objectStore(name).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});},
  addHistory:async video=>{await transaction("history","readwrite",s=>s.put(video,video.url));},
  getSetting:async(key,fallback)=>{const v=await transaction("settings","readonly",s=>s.get(key));return v??fallback;},
  setSetting:(key,value)=>transaction("settings","readwrite",s=>s.put(value,key)),
  exportAll:async()=>{const out={version:1,exportedAt:new Date().toISOString(),stores:{}};for(const n of ["favorites","history","subscriptions","settings"]){const db=await openDB();out.stores[n]=await new Promise((resolve,reject)=>{const r=db.transaction(n).objectStore(n).openCursor(),a=[];r.onsuccess=()=>{const c=r.result;if(c){a.push([c.key,c.value]);c.continue();}else resolve(a);};r.onerror=()=>reject(r.error);});}return out;},
  importAll:async data=>{if(data.version!==1||!data.stores)throw new Error("Unsupported backup");for(const n of ["favorites","history","subscriptions","settings"]){for(const [k,v] of data.stores[n]||[])await transaction(n,"readwrite",s=>s.put(v,k));}}
};
