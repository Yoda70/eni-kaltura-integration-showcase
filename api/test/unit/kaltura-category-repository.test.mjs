import test from "node:test";
import assert from "node:assert/strict";

import {
  KalturaCategoryRepository
} from "../../src/kaltura/kaltura-category-repository.mjs";

function createRepository(responses) {
  const calls = [];
  let responseIndex = 0;
  let ksCallCount = 0;

  const client = {
    async call(service, action, params) {
      calls.push({ service, action, params });

      if (responseIndex >= responses.length) {
        throw new Error(
          `Unexpected client call ${service}.${action}`
        );
      }

      const response = responses[responseIndex];
      responseIndex += 1;

      if (response instanceof Error) {
        throw response;
      }

      return response;
    }
  };

  const sessionProvider = {
    async getKs() {
      ksCallCount += 1;
      return `ks-${ksCallCount}`;
    }
  };

  const repository = new KalturaCategoryRepository({
    client,
    sessionProvider
  });

  return {
    repository,
    calls,
    getKsCallCount: () => ksCallCount
  };
}

test("findByName returns exact category match", async () => {
  const { repository, calls, getKsCallCount } = createRepository([
    {
      totalCount: 2,
      objects: [
        {
          id: 100,
          name: "OTHER"
        },
        {
          id: 741902,
          name: "TEST_METADATA_EXTRACTION"
        }
      ]
    }
  ]);

  const result = await repository.findByName(
    "  TEST_METADATA_EXTRACTION  "
  );

  assert.deepEqual(result, {
    id: 741902,
    name: "TEST_METADATA_EXTRACTION"
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].service, "category");
  assert.equal(calls[0].action, "list");
  assert.equal(
    calls[0].params["filter:nameEqual"],
    "TEST_METADATA_EXTRACTION"
  );
  assert.equal(calls[0].params["pager:pageSize"], 50);
  assert.equal(calls[0].params["pager:pageIndex"], 1);
  assert.equal(calls[0].params.ks, "ks-1");
  assert.equal(getKsCallCount(), 1);
});

test("findByName returns null when no exact match exists", async () => {
  const { repository } = createRepository([
    {
      totalCount: 1,
      objects: [
        {
          id: 100,
          name: "TEST_METADATA_EXTRACTION_CHILD"
        }
      ]
    }
  ]);

  const result = await repository.findByName(
    "TEST_METADATA_EXTRACTION"
  );

  assert.equal(result, null);
});

test("findByName handles missing objects collection", async () => {
  const { repository } = createRepository([
    {
      totalCount: 0
    }
  ]);

  const result = await repository.findByName(
    "TEST_METADATA_EXTRACTION"
  );

  assert.equal(result, null);
});

test("listEntryIds returns IDs from a single partial page", async () => {
  const { repository, calls, getKsCallCount } = createRepository([
    {
      totalCount: 2,
      objects: [
        {
          entryId: "0_first"
        },
        {
          entryId: "0_second"
        }
      ]
    }
  ]);

  const result = await repository.listEntryIds(741902, 100);

  assert.deepEqual(result, [
    "0_first",
    "0_second"
  ]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].service, "categoryentry");
  assert.equal(calls[0].action, "list");
  assert.equal(
    calls[0].params["filter:categoryIdEqual"],
    741902
  );
  assert.equal(calls[0].params["pager:pageSize"], 100);
  assert.equal(calls[0].params["pager:pageIndex"], 1);
  assert.equal(getKsCallCount(), 1);
});

test("listEntryIds traverses pages and removes duplicates", async () => {
  const { repository, calls, getKsCallCount } = createRepository([
    {
      totalCount: 5,
      objects: [
        {
          entryId: "0_first"
        },
        {
          entryId: "0_second"
        }
      ]
    },
    {
      totalCount: 5,
      objects: [
        {
          entryId: "0_second"
        },
        {
          entryId: "0_third"
        }
      ]
    },
    {
      totalCount: 5,
      objects: [
        {
          entryId: "0_fourth"
        }
      ]
    }
  ]);

  const result = await repository.listEntryIds(741902, 2);

  assert.deepEqual(result, [
    "0_first",
    "0_second",
    "0_third",
    "0_fourth"
  ]);

  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map(
      call => call.params["pager:pageIndex"]
    ),
    [1, 2, 3]
  );
  assert.deepEqual(
    calls.map(
      call => call.params.ks
    ),
    ["ks-1", "ks-2", "ks-3"]
  );
  assert.equal(getKsCallCount(), 3);
});

test("listEntryIds ignores missing and empty entry IDs", async () => {
  const { repository } = createRepository([
    {
      totalCount: 4,
      objects: [
        {
          entryId: "0_valid"
        },
        {
          entryId: ""
        },
        {
          entryId: null
        },
        {}
      ]
    }
  ]);

  const result = await repository.listEntryIds(741902, 100);

  assert.deepEqual(result, [
    "0_valid"
  ]);
});

test("containsEntry returns true for an exact entry match", async () => {
  const { repository, calls, getKsCallCount } = createRepository([
    {
      totalCount: 1,
      objects: [
        {
          categoryId: 741902,
          entryId: "0_allowed"
        }
      ]
    }
  ]);

  const result = await repository.containsEntry(
    741902,
    "0_allowed"
  );

  assert.equal(result, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].service, "categoryentry");
  assert.equal(calls[0].action, "list");
  assert.equal(
    calls[0].params["filter:categoryIdEqual"],
    741902
  );
  assert.equal(
    calls[0].params["filter:entryIdEqual"],
    "0_allowed"
  );
  assert.equal(calls[0].params["pager:pageSize"], 1);
  assert.equal(calls[0].params["pager:pageIndex"], 1);
  assert.equal(getKsCallCount(), 1);
});

test("containsEntry returns false for a different entry", async () => {
  const { repository } = createRepository([
    {
      totalCount: 1,
      objects: [
        {
          categoryId: 741902,
          entryId: "0_different"
        }
      ]
    }
  ]);

  const result = await repository.containsEntry(
    741902,
    "0_requested"
  );

  assert.equal(result, false);
});

test("containsEntry handles missing objects collection", async () => {
  const { repository } = createRepository([
    {
      totalCount: 0
    }
  ]);

  const result = await repository.containsEntry(
    741902,
    "0_requested"
  );

  assert.equal(result, false);
});

test("repository propagates client errors", async () => {
  const expectedError = Object.assign(
    new Error("Kaltura unavailable"),
    {
      code: "KALTURA_UNAVAILABLE"
    }
  );

  const { repository } = createRepository([
    expectedError
  ]);

  await assert.rejects(
    repository.findByName("TEST_METADATA_EXTRACTION"),
    error => {
      assert.equal(error, expectedError);
      assert.equal(error.code, "KALTURA_UNAVAILABLE");
      return true;
    }
  );
});