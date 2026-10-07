import { ApplicationError } from '../errors/application-error.mjs';

export class KalturaClient {
  constructor({ serviceUrl, fetchImpl = fetch }) { this.serviceUrl = serviceUrl; this.fetchImpl = fetchImpl; }
  async call(service, action, params = {}) {
    const form = new URLSearchParams({ format: '1' });
    for (const [key,value] of Object.entries(params)) if (value !== undefined && value !== null) form.set(key, String(value));
    let response;
    try {
      response = await this.fetchImpl(`${this.serviceUrl}/service/${service}/action/${action}`, { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form });
    } catch (error) {
      throw new ApplicationError('KALTURA_NETWORK_ERROR', error.message, 502, undefined, true);
    }
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!response.ok || data?.objectType === 'KalturaAPIException') throw new ApplicationError(data?.code || 'KALTURA_ERROR', data?.message || `Kaltura HTTP ${response.status}`, response.status >= 400 ? response.status : 502, data, response.status >= 500);
    return data;
  }
  async download(url, maxBytes) {
    const response = await this.fetchImpl(url);
    if (!response.ok) throw new ApplicationError('UPSTREAM_DOWNLOAD_ERROR', `Unable to download SRT: HTTP ${response.status}`, 502, undefined, true);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength && contentLength > maxBytes) throw new ApplicationError('SRT_SIZE_LIMIT_EXCEEDED', `SRT exceeds ${maxBytes} bytes`, 413);
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new ApplicationError('SRT_SIZE_LIMIT_EXCEEDED', `SRT exceeds ${maxBytes} bytes`, 413);
    return text;
  }
}
