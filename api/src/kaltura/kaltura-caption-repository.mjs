export class KalturaCaptionRepository {
  constructor({ client, sessionProvider, maxSrtBytes }) { this.client=client; this.sessionProvider=sessionProvider; this.maxSrtBytes=maxSrtBytes; }
  async list(entryId) { return this.client.call('caption_captionasset','list',{ ks:await this.sessionProvider.getKs(), 'filter:objectType':'KalturaCaptionAssetFilter', 'filter:entryIdEqual':entryId }); }
  async get(captionAssetId) { return this.client.call('caption_captionasset','get',{ ks:await this.sessionProvider.getKs(), captionAssetId }); }
  async serve(captionAssetId) {
    const ks=await this.sessionProvider.getKs();
    try {
      const url=await this.client.call('caption_captionasset','getUrl',{ ks, id:captionAssetId });
      return this.client.download(url, this.maxSrtBytes);
    } catch (error) {
      if (!['SERVICE_FORBIDDEN','ACTION_NOT_FOUND','KALTURA_ERROR'].includes(error.code)) throw error;
      const form = new URLSearchParams({ ks, captionAssetId });
      const response = await fetch(`${this.client.serviceUrl}/service/caption_captionasset/action/serve`, { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form });
      const text=await response.text();
      if (!response.ok) throw error;
      return text;
    }
  }
}
