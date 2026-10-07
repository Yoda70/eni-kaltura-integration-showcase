export class KalturaSessionProvider {
  constructor({ client, partnerId, adminSecret, expirySeconds = 3600 }) {
    this.client = client; this.partnerId = partnerId; this.adminSecret = adminSecret; this.expirySeconds = expirySeconds; this.cache = null;
  }
  async getKs() {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now + 60_000) return this.cache.ks;
    const ks = await this.client.call('session','start',{ secret:this.adminSecret, userId:'metadata-extraction-factory', type:2, partnerId:this.partnerId, expiry:this.expirySeconds, privileges:'' });
    this.cache = { ks, expiresAt: now + this.expirySeconds * 1000 };
    return ks;
  }
}
