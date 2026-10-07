export class KalturaEntryRepository {
  constructor({ client, sessionProvider }) { this.client=client; this.sessionProvider=sessionProvider; }
  async get(entryId) { return this.client.call('media','get',{ ks:await this.sessionProvider.getKs(), entryId }); }
  async listByCategory(categoryId, pageSize=100) { return this.client.call('media','list',{ ks:await this.sessionProvider.getKs(), 'filter:objectType':'KalturaMediaEntryFilter', 'filter:categoriesIdsMatchOr':categoryId, 'pager:objectType':'KalturaFilterPager', 'pager:pageSize':pageSize, 'pager:pageIndex':1 }); }
}
