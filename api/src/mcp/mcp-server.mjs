import { asApplicationError } from '../errors/application-error.mjs';
const tools=[
 {name:'verify_kaltura_entry',description:'Verify a Kaltura entry and list normalized transcripts.',inputSchema:{type:'object',properties:{entryId:{type:'string'},requestedLanguages:{type:'array',items:{type:'string'}}},required:['entryId']}},
 {name:'extract_kaltura_transcript',description:'Extract a specified READY SRT transcript.',inputSchema:{type:'object',properties:{entryId:{type:'string'},captionAssetId:{type:'string'},languageCode:{type:'string'},outputMode:{type:'string',enum:['metadata','content','clean_text','segments','full']}},required:['entryId','captionAssetId']}},
 {name:'extract_preferred_transcript',description:'Select and extract the preferred READY SRT transcript.',inputSchema:{type:'object',properties:{entryId:{type:'string'},languageCode:{type:'string'},outputMode:{type:'string',enum:['metadata','content','clean_text','segments','full']}},required:['entryId']}}
];
function jsonRpc(id,result){return{jsonrpc:'2.0',id,result}}
function toolResult(data){return{content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,isError:false}}
export function createMcpHandler({service,env}){
 return async function(req,res,url){
  if(!env.mcpEnabled||url.pathname!==env.mcpPath)return false;
  if(req.method!=='POST'){res.writeHead(405,{'allow':'POST'});res.end();return true}
  const origin=String(req.headers.origin||'');if(env.allowedOrigin&&origin&&origin!==env.allowedOrigin){res.writeHead(403);res.end();return true}
  const chunks=[];for await(const c of req)chunks.push(c);let rpc;try{rpc=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{rpc={}}
  let response;
  try{
   if(rpc.method==='tools/list')response=jsonRpc(rpc.id,{tools});
   else if(rpc.method==='tools/call'){
    const name=rpc.params?.name,args=rpc.params?.arguments||{};let data;
    if(name==='verify_kaltura_entry')data=await service.verifyEntry(args);
    else if(name==='extract_kaltura_transcript')data=await service.extractTranscript(args);
    else if(name==='extract_preferred_transcript')data=await service.extractPreferredTranscript(args);
    else throw Object.assign(new Error(`Unknown tool ${name}`),{code:'METHOD_NOT_FOUND',httpStatus:404});
    const bytes=Buffer.byteLength(JSON.stringify(data));if(bytes>env.mcpMaxResponseBytes)throw Object.assign(new Error('MCP response exceeds configured limit; use outputMode metadata'),{code:'MCP_RESPONSE_TOO_LARGE',httpStatus:413});
    response=jsonRpc(rpc.id,toolResult(data));
   } else response={jsonrpc:'2.0',id:rpc.id??null,error:{code:-32601,message:'Method not found'}};
  }catch(error){const e=asApplicationError(error);response={jsonrpc:'2.0',id:rpc.id??null,error:{code:-32000,message:e.message,data:{code:e.code,retryable:e.retryable}}};}
  const body=JSON.stringify(response);res.writeHead(200,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body)});res.end(body);return true;
 }
}
