import http from 'node:http';
import { loadEnvironment, validateKalturaEnvironment } from './src/config/environment.mjs';
import { KalturaClient } from './src/kaltura/kaltura-client.mjs';
import { KalturaSessionProvider } from './src/kaltura/kaltura-session-provider.mjs';
import { KalturaEntryRepository } from './src/kaltura/kaltura-entry-repository.mjs';
import { KalturaCaptionRepository } from './src/kaltura/kaltura-caption-repository.mjs';
import { MetadataExtractionService } from './src/core/metadata-extraction-service.mjs';
import { createRestHandler } from './src/rest/rest-router.mjs';
import { createMcpHandler } from './src/mcp/mcp-server.mjs';

const env=loadEnvironment();
const client=new KalturaClient({serviceUrl:env.serviceUrl});
const sessionProvider=new KalturaSessionProvider({client,partnerId:env.partnerId,adminSecret:env.adminSecret,expirySeconds:env.sessionExpirySeconds});
const service=new MetadataExtractionService({entryRepository:new KalturaEntryRepository({client,sessionProvider}),captionRepository:new KalturaCaptionRepository({client,sessionProvider,maxSrtBytes:env.maxSrtBytes}),maxSegments:env.maxSegments});
const rest=createRestHandler({service,env});
const mcp=createMcpHandler({service,env});

const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const origin=String(req.headers.origin||'');
 if(req.method==='OPTIONS'){
  if(env.allowedOrigin&&origin!==env.allowedOrigin){res.writeHead(403);return res.end()}
  res.writeHead(204,{'access-control-allow-origin':env.allowedOrigin||origin||'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization,x-request-id','access-control-max-age':'600','vary':'Origin'});return res.end();
 }
 const cors=env.allowedOrigin&&origin===env.allowedOrigin?{'access-control-allow-origin':origin,'vary':'Origin'}:{};
 const originalWriteHead=res.writeHead.bind(res);res.writeHead=(status,headers={})=>originalWriteHead(status,{...cors,...headers});
 if(await mcp(req,res,url))return;
 if(await rest(req,res,url))return;
 const body=JSON.stringify({status:'NOT_FOUND',path:url.pathname});res.writeHead(404,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body)});res.end(body);
});
server.listen(env.port,()=>{
 console.log(JSON.stringify({event:'server_started',port:env.port,version:env.factoryVersion,environment:env.environmentName,mcpPath:env.mcpEnabled?env.mcpPath:null}));
 try{validateKalturaEnvironment(env)}catch(error){console.error(JSON.stringify({event:'configuration_warning',message:error.message}))}
});
