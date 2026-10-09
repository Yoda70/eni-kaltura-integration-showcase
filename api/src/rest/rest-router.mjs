import crypto from 'node:crypto';
import { asApplicationError } from '../errors/application-error.mjs';

function envelope(status,data=null,warnings=[],errors=[],requestId=crypto.randomUUID()) { return {requestId,generatedAt:new Date().toISOString(),apiVersion:'1.1',status,data,warnings,errors}; }
async function readJson(req, limit=1_000_000) { const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>limit)throw Object.assign(new Error('Request too large'),{code:'PAYLOAD_TOO_LARGE',httpStatus:413});chunks.push(c)};if(!chunks.length)return{};return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
function send(res,httpStatus,payload,headers={}) { const body=JSON.stringify(payload);res.writeHead(httpStatus,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),...headers});res.end(body); }

export function createRestHandler({ service, env }) {
  return async function handleRest(req,res,url) {
    const requestId=String(req.headers['x-request-id']||crypto.randomUUID());
    try {
      if(req.method==='GET'&&url.pathname==='/api/v1/health'){send(res,200,envelope('UP',{service:'metadata-extraction-factory',version:env.factoryVersion,environment:env.environmentName,mcpEnabled:env.mcpEnabled},[],[],requestId));return true;}
      if(req.method==='GET'&&url.pathname==='/api/v1/test-scope'){send(res,200,envelope('TEST_SCOPE_READY',await service.getTestScope(),[],[],requestId));return true;}
      if(req.method==='GET'&&url.pathname==='/api/v1/test-scope/entries'){send(res,200,envelope('TEST_SCOPE_ENTRIES',await service.listTestScopeEntries(),[],[],requestId));return true;}
      if(req.method==='POST'&&url.pathname==='/api/v1/kaltura/transcripts/verify'){const body=await readJson(req);send(res,200,envelope('VERIFY_RESULT',await service.verifyEntry(body),[],[],requestId));return true;}
      if(req.method==='POST'&&url.pathname==='/api/v1/kaltura/transcripts/extract'){const body=await readJson(req);send(res,200,envelope('SRT_AVAILABLE',await service.extractTranscript(body),[],[],requestId));return true;}
      if(req.method==='POST'&&url.pathname==='/api/v1/kaltura/transcripts/extract-preferred'){const body=await readJson(req);send(res,200,envelope('SRT_AVAILABLE',await service.extractPreferredTranscript(body),[],[],requestId));return true;}
      return false;
    } catch(error) {
      const e=asApplicationError(error);send(res,e.httpStatus,envelope('ERROR',null,[],[{code:e.code,message:e.message,retryable:e.retryable,details:e.details}],requestId));return true;
    }
  }
}
