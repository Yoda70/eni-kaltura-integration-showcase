export class KalturaCategoryRepository {
  constructor({ client, sessionProvider }) {
    this.client = client;
    this.sessionProvider = sessionProvider;
  }

  async findByName(name) {
    const normalizedName = String(name || "").trim();

    const result = await this.client.call("category", "list", {
      ks: await this.sessionProvider.getKs(),
      "filter:objectType": "KalturaCategoryFilter",
      "filter:nameEqual": normalizedName,
      "pager:objectType": "KalturaFilterPager",
      "pager:pageSize": 50,
      "pager:pageIndex": 1
    });

    const category = (result?.objects || []).find(
      item => item.name === normalizedName
    );

    return category || null;
  }

  async listEntryIds(categoryId, pageSize = 100) {
    const ids = [];
    let pageIndex = 1;

    while (true) {
      const result = await this.client.call(
        "categoryentry",
        "list",
        {
          ks: await this.sessionProvider.getKs(),
          "filter:objectType": "KalturaCategoryEntryFilter",
          "filter:categoryIdEqual": categoryId,
          "pager:objectType": "KalturaFilterPager",
          "pager:pageSize": pageSize,
          "pager:pageIndex": pageIndex
        }
      );

      const objects = result?.objects || [];

      ids.push(
        ...objects
          .map(item => item.entryId)
          .filter(Boolean)
      );

      const totalCount = Number(result?.totalCount || 0);

      if (
        objects.length < pageSize ||
        ids.length >= totalCount
      ) {
        break;
      }

      pageIndex += 1;
    }

    return [...new Set(ids)];
  }

  async containsEntry(categoryId, entryId) {
    const result = await this.client.call(
      "categoryentry",
      "list",
      {
        ks: await this.sessionProvider.getKs(),
        "filter:objectType": "KalturaCategoryEntryFilter",
        "filter:categoryIdEqual": categoryId,
        "filter:entryIdEqual": entryId,
        "pager:objectType": "KalturaFilterPager",
        "pager:pageSize": 1,
        "pager:pageIndex": 1
      }
    );

    return (result?.objects || []).some(
      item => item.entryId === entryId
    );
  }
}
