import http from "node:http";
import crypto from "node:crypto";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 10000);
const SERVICE_URL = (process.env.KALTURA_SERVICE_URL || "https://www.kaltura.com/api_v3").replace(/\/$/, "");
const PARTNER_ID = process.env.KALTURA_PARTNER_ID;
const ADMIN_SECRET = process.env.KALTURA_ADMIN_SECRET;
const TEST_CATEGORY_NAME = process.env.KALTURA_TEST_CATEGORY_NAME || "TEST_METADATA_EXTRACTION";
const ALLOWED_ORIGIN = process.env.SPA_ALLOWED_ORIGIN || "";
const KS_TTL = 600;
let sessionCache = { ks: null, expiresAt: 0 };
let categoryCache = { value: null, expiresAt: 0 };

function json(res, status, body) {
  res.writeHead(status, {"content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...corsHeaders()});
  res.end(JSON.stringify(body));
}
function corsHeaders(){ return ALLOWED_ORIGIN ? {"access-control-allow-origin":ALLOWED_ORIGIN,"vary":"Origin","access-control-allow-headers":"content-type,x-request-id","access-control-allow-methods":"GET,POST,OPTIONS"} : {}; }
function envelope(status, data=null, errors=[], warnings=[], requestId=crypto.randomUUID()){
  return { requestId, generatedAt:new Date().toISOString(), apiVersion:"1.0", status, data, warnings, errors };
}
async function body(req){ let s=""; for await(const c of req){ s+=c; if(s.length>1_000_000) throw new Error("REQUEST_TOO_LARGE"); } return s?JSON.parse(s):{}; }
async function kaltura(service, action, params={}, includeKs=true){
  const form=new URLSearchParams(); form.set("format","1"); form.set("partnerId",String(PARTNER_ID));
  if(includeKs) form.set("ks", await getKs());
  for(const [k,v] of Object.entries(params)) if(v!==undefined&&v!==null) form.set(k,String(v));
  const r=await fetch(`${SERVICE_URL}/service/${service}/action/${action}`,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form});
  const text=await r.text(); let data; try{ data=JSON.parse(text); }catch{ data=text; }
  if(!r.ok || (data && data.objectType==="KalturaAPIException")){ const e=new Error(data?.message||`Kaltura HTTP ${r.status}`); e.code=data?.code||"KALTURA_ERROR"; e.http=r.status||502; throw e; }
  return data;
}
async function getKs(){
  if(sessionCache.ks && Date.now()<sessionCache.expiresAt-30_000) return sessionCache.ks;
  if(!PARTNER_ID||!ADMIN_SECRET) throw Object.assign(new Error("Kaltura credentials are not configured"),{code:"AUTHENTICATION_ERROR",http:500});
  const ks=await kaltura("session","start",{secret:ADMIN_SECRET,userId:"metadata-extraction-factory",type:2,expiry:KS_TTL,privileges:"disableentitlement"},false);
  sessionCache={ks,expiresAt:Date.now()+KS_TTL*1000}; return ks;
}
async function getTestCategory(){
  if(categoryCache.value && Date.now()<categoryCache.expiresAt) return categoryCache.value;
  const r=await kaltura("category","list",{"filter:objectType":"KalturaCategoryFilter","filter:nameEqual":TEST_CATEGORY_NAME,"pager:objectType":"KalturaFilterPager","pager:pageSize":50,"pager:pageIndex":1});
  const exact=(r.objects||[]).find(x=>x.name===TEST_CATEGORY_NAME);
  if(!exact) throw Object.assign(new Error(`Category ${TEST_CATEGORY_NAME} not found`),{code:"TEST_CATEGORY_NOT_FOUND",http:404});
  categoryCache={value:exact,expiresAt:Date.now()+300_000}; return exact;
}
async function listCategoryEntryIds(categoryId){
  const ids=[]; let page=1;
  while(true){
    const r=await kaltura("categoryentry","list",{"filter:objectType":"KalturaCategoryEntryFilter","filter:categoryIdEqual":categoryId,"pager:objectType":"KalturaFilterPager","pager:pageSize":500,"pager:pageIndex":page});
    const rows=r.objects||[]; ids.push(...rows.map(x=>x.entryId)); if(rows.length<500) break; page++; if(page>100) throw new Error("PAGINATION_LIMIT");
  }
  return [...new Set(ids)];
}
async function assertInScope(entryId){ const c=await getTestCategory(); const ids=await listCategoryEntryIds(c.id); if(!ids.includes(entryId)) throw Object.assign(new Error("Entry outside authorized test category"),{code:"ENTRY_OUTSIDE_TEST_SCOPE",http:403}); return c; }
async function getEntry(entryId){ try{return await kaltura("media","get",{entryId});}catch(e){if(e.code==="ENTRY_ID_NOT_FOUND") throw Object.assign(new Error("Entry not found"),{code:"ENTRY_NOT_FOUND",http:404});throw e;} }
async function listCaptions(entryId){
  const r=await kaltura("caption_captionasset","list",{"filter:objectType":"KalturaCaptionAssetFilter","filter:entryIdEqual":entryId,"pager:objectType":"KalturaFilterPager","pager:pageSize":500,"pager:pageIndex":1});
  return r.objects||[];
}
function normalizeAsset(a){ return {captionAssetId:a.id,languageCode:a.language,languageName:a.language,label:a.label||a.language,format:a.format===1?"SRT":String(a.format),status:a.status===2?"READY":String(a.status),ready:a.status===2,isDefault:a.isDefault===1,accuracy:a.accuracy??null,version:null,updatedAt:a.updatedAt?new Date(a.updatedAt*1000).toISOString():null}; }
async function verify(entryId){
  await assertInScope(entryId); const entry=await getEntry(entryId); const assets=(await listCaptions(entryId)).map(normalizeAsset); const readySrt=assets.filter(a=>a.format==="SRT"&&a.ready);
  return {entryId,entryAvailable:true,title:entry.name,mediaType:entry.mediaType===5?"AUDIO":"VIDEO",status:readySrt.length?"READY_FOR_INDEXING":assets.length?"ONLY_NON_READY_CAPTIONS":"ENTRY_FOUND_NO_CAPTIONS",eligibleForChatbot:readySrt.length>0,availableLanguages:[...new Set(readySrt.map(a=>a.languageCode))],transcripts:assets};
}
function cleanSrt(s){ return s.replace(/^\ufeff/,"").replace(/\r/g,"").split("\n").filter(line=>!/^\d+$/.test(line.trim())&&!/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->/.test(line.trim())).join("\n").replace(/\n{3,}/g,"\n\n").trim(); }
async function extract(entryId,captionAssetId,outputMode="SRT_AND_CLEAN_TEXT"){
  await assertInScope(entryId); const assets=await listCaptions(entryId); const raw=assets.find(a=>a.id===captionAssetId);
  if(!raw) throw Object.assign(new Error("Caption asset not found"),{code:"CAPTION_ASSET_NOT_FOUND",http:404});
  if(raw.entryId!==entryId) throw Object.assign(new Error("Caption asset mismatch"),{code:"CAPTION_ENTRY_MISMATCH",http:409});
  if(raw.format!==1) throw Object.assign(new Error("Caption is not SRT"),{code:"INVALID_CAPTION_FORMAT",http:422});
  if(raw.status!==2) throw Object.assign(new Error("Caption is not ready"),{code:"CAPTION_NOT_READY",http:409,retryable:true});
  const url=await kaltura("caption_captionasset","getUrl",{id:captionAssetId}); const r=await fetch(url); if(!r.ok) throw Object.assign(new Error("Unable to download SRT"),{code:"UPSTREAM_DOWNLOAD_ERROR",http:502,retryable:true});
  const srt=await r.text(); if(!srt.trim()) throw Object.assign(new Error("Empty SRT"),{code:"EMPTY_SRT_CONTENT",http:422});
  const cleanText=cleanSrt(srt); const hash=crypto.createHash("sha256").update(srt,"utf8").digest("hex");
  return {entryId,captionAssetId,languageCode:raw.language,status:"SRT_AVAILABLE",artifact:{fileName:`${entryId}_${raw.language}_${captionAssetId}.srt`,contentType:"application/x-subrip",format:"SRT",encoding:"UTF-8",sizeBytes:Buffer.byteLength(srt),sha256:hash,content:outputMode==="CLEAN_TEXT"?undefined:srt},cleanText:{available:true,textLength:cleanText.length,content:outputMode==="SRT"?undefined:cleanText}};
}
function mapError(e){ const code=e.code||"INTERNAL_ERROR"; return {http:e.http||500,body:envelope(code,null,[{code,message:e.message,retryable:Boolean(e.retryable),source:code.startsWith("KALTURA")?"KALTURA":"INTEGRATION_LAYER"}])}; }
const server=http.createServer(async(req,res)=>{
  if(req.method==="OPTIONS"){res.writeHead(204,corsHeaders());return res.end();}
  const u=new URL(req.url,`http://${req.headers.host}`);
  try{
    if(req.method==="GET"&&u.pathname==="/api/v1/health") return json(res,200,envelope("OK",{service:"metadata-extraction-factory-api",mode:"READ_ONLY"}));
    if(req.method==="GET"&&u.pathname==="/api/v1/test-scope"){const c=await getTestCategory();const ids=await listCategoryEntryIds(c.id);return json(res,200,envelope("TEST_SCOPE_READY",{environment:"PROD_142",mode:"READ_ONLY",category:{id:c.id,name:c.name,fullName:c.fullName,privacy:c.privacy,status:c.status,entryCount:ids.length}}));}
    if(req.method==="GET"&&u.pathname==="/api/v1/test-scope/entries"){const c=await getTestCategory();const ids=await listCategoryEntryIds(c.id);const out=[];for(const id of ids)out.push(await verify(id));return json(res,200,envelope("TEST_SCOPE_ENTRIES",{category:{id:c.id,name:c.name},total:out.length,entries:out}));}
    if(req.method==="POST"&&u.pathname==="/api/v1/transcripts/verify"){const b=await body(req);return json(res,200,envelope("VERIFY_RESULT",await verify(b.entryId)));}
    if(req.method==="POST"&&u.pathname==="/api/v1/transcripts/verify-batch"){const b=await body(req);const ids=[...new Set(b.entryIds||[])];const results=[];for(const id of ids){try{results.push(await verify(id));}catch(e){results.push({entryId:id,entryAvailable:false,status:e.code||"INTERNAL_ERROR",eligibleForChatbot:false,availableLanguages:[],transcripts:[],warnings:[],errors:[{code:e.code||"INTERNAL_ERROR",message:e.message,retryable:Boolean(e.retryable)}]});}}return json(res,200,envelope("BATCH_RESULT",{inputCount:(b.entryIds||[]).length,processedCount:ids.length,results}));}
    if(req.method==="POST"&&u.pathname==="/api/v1/transcripts/extract"){const b=await body(req);return json(res,200,envelope("SRT_AVAILABLE",await extract(b.entryId,b.captionAssetId,b.outputMode)));}
    return json(res,404,envelope("ROUTE_NOT_FOUND",null,[{code:"ROUTE_NOT_FOUND",message:"Route not found",retryable:false}]));
  }catch(e){console.error(e.code||"INTERNAL_ERROR",e.message);const m=mapError(e);return json(res,m.http,m.body);}
});
server.listen(PORT,()=>console.log(`Metadata Extraction Factory API listening on ${PORT}`));
