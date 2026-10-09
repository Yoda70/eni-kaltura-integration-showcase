import test from "node:test";
import assert from "node:assert/strict";

import {
  MetadataExtractionService
} from "../../src/core/metadata-extraction-service.mjs";

function createFixture(overrides = {}) {
  const calls = {
    findByName: [],
    listEntryIds: [],
    containsEntry: [],
    entryGet: [],
    captionList: [],
    captionServe: []
  };

  const category = overrides.category === undefined
    ? {
        id: 741902,
        name: "TEST_METADATA_EXTRACTION",
        fullName: "TEST_METADATA_EXTRACTION",
        privacy: 1,
        status: 1
      }
    : overrides.category;

  const entryIds = overrides.entryIds || [
    "0_allowed"
  ];

  const containsEntry = overrides.containsEntry === undefined
    ? true
    : overrides.containsEntry;

  const entry = overrides.entry === undefined
    ? {
        id: "0_allowed",
        name: "Allowed entry",
        mediaType: 1
      }
    : overrides.entry;

  const captionObjects = overrides.captionObjects === undefined
    ? [
        {
          id: "0_caption_it",
          entryId: "0_allowed",
          language: "Italian",
          label: "Italian",
          format: 1,
          status: 2,
          isDefault: 1,
          updatedAt: 200
        }
      ]
    : overrides.captionObjects;

  const srt = overrides.srt === undefined
    ? [
        "1",
        "00:00:00,000 --> 00:00:01,000",
        "Ciao",
        "",
        "2",
        "00:00:01,000 --> 00:00:02,000",
        "Mondo"
      ].join("\n")
    : overrides.srt;

  const categoryRepository = {
    async findByName(name) {
      calls.findByName.push(name);

      if (overrides.findByNameError) {
        throw overrides.findByNameError;
      }

      return category;
    },

    async listEntryIds(categoryId) {
      calls.listEntryIds.push(categoryId);

      if (overrides.listEntryIdsError) {
        throw overrides.listEntryIdsError;
      }

      return entryIds;
    },

    async containsEntry(categoryId, entryId) {
      calls.containsEntry.push({
        categoryId,
        entryId
      });

      if (overrides.containsEntryError) {
        throw overrides.containsEntryError;
      }

      if (typeof containsEntry === "function") {
        return containsEntry(categoryId, entryId);
      }

      return containsEntry;
    }
  };

  const entryRepository = {
    async get(entryId) {
      calls.entryGet.push(entryId);

      if (overrides.entryError) {
        throw overrides.entryError;
      }

      if (typeof entry === "function") {
        return entry(entryId);
      }

      if (entry && !entry.id) {
        return {
          ...entry,
          id: entryId
        };
      }

      return entry;
    }
  };

  const captionRepository = {
    async list(entryId) {
      calls.captionList.push(entryId);

      if (overrides.captionListError) {
        throw overrides.captionListError;
      }

      if (typeof captionObjects === "function") {
        return {
          objects: captionObjects(entryId)
        };
      }

      return {
        objects: captionObjects
      };
    },

    async serve(captionAssetId) {
      calls.captionServe.push(captionAssetId);

      if (overrides.captionServeError) {
        throw overrides.captionServeError;
      }

      if (typeof srt === "function") {
        return srt(captionAssetId);
      }

      return srt;
    }
  };

  const service = new MetadataExtractionService({
    entryRepository,
    captionRepository,
    categoryRepository,
    testCategoryName: "TEST_METADATA_EXTRACTION",
    maxSegments: 100
  });

  return {
    service,
    calls,
    categoryRepository,
    entryRepository,
    captionRepository
  };
}

function assertApplicationError(
  error,
  {
    code,
    httpStatus,
    retryable
  }
) {
  assert.equal(error.name, "ApplicationError");
  assert.equal(error.code, code);
  assert.equal(error.httpStatus, httpStatus);

  if (retryable !== undefined) {
    assert.equal(error.retryable, retryable);
  }

  return true;
}

test("getTestCategory caches the category after the first lookup", async () => {
  const {
    service,
    calls
  } = createFixture();

  const first = await service.getTestCategory();
  const second = await service.getTestCategory();

  assert.equal(first.id, 741902);
  assert.equal(second, first);
  assert.deepEqual(calls.findByName, [
    "TEST_METADATA_EXTRACTION"
  ]);
});

test("getTestCategory throws CATEGORY_NOT_FOUND", async () => {
  const {
    service
  } = createFixture({
    category: null
  });

  await assert.rejects(
    service.getTestCategory(),
    error => assertApplicationError(
      error,
      {
        code: "CATEGORY_NOT_FOUND",
        httpStatus: 404,
        retryable: false
      }
    )
  );
});

test("getTestScope returns read-only category metadata", async () => {
  const {
    service,
    calls
  } = createFixture({
    entryIds: [
      "0_first",
      "0_second",
      "0_third"
    ]
  });

  const result = await service.getTestScope();

  assert.equal(result.environment, "PROD_142");
  assert.equal(result.mode, "READ_ONLY");
  assert.deepEqual(result.category, {
    id: 741902,
    name: "TEST_METADATA_EXTRACTION",
    fullName: "TEST_METADATA_EXTRACTION",
    privacy: 1,
    status: 1,
    entryCount: 3
  });

  assert.deepEqual(calls.listEntryIds, [
    741902
  ]);
});

test("assertEntryInTestScope accepts an allowed entry", async () => {
  const {
    service,
    calls
  } = createFixture({
    containsEntry: true
  });

  const result = await service.assertEntryInTestScope(
    "0_allowed"
  );

  assert.equal(result.id, 741902);
  assert.deepEqual(calls.containsEntry, [
    {
      categoryId: 741902,
      entryId: "0_allowed"
    }
  ]);
});

test("assertEntryInTestScope returns complete forbidden error", async () => {
  const {
    service
  } = createFixture({
    containsEntry: false
  });

  await assert.rejects(
    service.assertEntryInTestScope("0_outside"),
    error => {
      assertApplicationError(
        error,
        {
          code: "ENTRY_OUTSIDE_TEST_SCOPE",
          httpStatus: 403,
          retryable: false
        }
      );

      assert.equal(
        error.message,
        "Entry does not belong to TEST_METADATA_EXTRACTION"
      );

      assert.deepEqual(error.details, {
        entryId: "0_outside",
        categoryId: 741902,
        categoryName: "TEST_METADATA_EXTRACTION"
      });

      return true;
    }
  );
});

test("verifyEntry requires entryId", async () => {
  const {
    service,
    calls
  } = createFixture();

  await assert.rejects(
    service.verifyEntry({
      entryId: "   "
    }),
    error => assertApplicationError(
      error,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 400,
        retryable: false
      }
    )
  );

  assert.equal(calls.containsEntry.length, 0);
  assert.equal(calls.entryGet.length, 0);
  assert.equal(calls.captionList.length, 0);
});

test("verifyEntry applies scope before loading entry data", async () => {
  const {
    service,
    calls
  } = createFixture({
    containsEntry: false
  });

  await assert.rejects(
    service.verifyEntry({
      entryId: "0_outside"
    }),
    error => assertApplicationError(
      error,
      {
        code: "ENTRY_OUTSIDE_TEST_SCOPE",
        httpStatus: 403,
        retryable: false
      }
    )
  );

  assert.equal(calls.containsEntry.length, 1);
  assert.equal(calls.entryGet.length, 0);
  assert.equal(calls.captionList.length, 0);
});

test("verifyEntry returns READY_FOR_INDEXING for a READY SRT", async () => {
  const {
    service,
    calls
  } = createFixture();

  const result = await service.verifyEntry({
    entryId: "0_allowed",
    requestedLanguages: [
      "it"
    ]
  });

  assert.equal(result.entryId, "0_allowed");
  assert.equal(result.entryAvailable, true);
  assert.equal(result.title, "Allowed entry");
  assert.equal(result.mediaType, "VIDEO");
  assert.equal(result.status, "READY_FOR_INDEXING");
  assert.equal(result.eligibleForChatbot, true);
  assert.equal(result.technicallyEligible, true);

  assert.deepEqual(result.requestedLanguages, [
    "it"
  ]);

  assert.deepEqual(result.availableLanguages, [
    "it"
  ]);

  assert.deepEqual(result.missingLanguages, []);

  assert.equal(result.captionSummary.totalCaptionAssets, 1);
  assert.equal(result.captionSummary.readyCaptionAssets, 1);
  assert.equal(result.captionSummary.readySrtAssets, 1);
  assert.equal(result.captionSummary.eligibleCaptionAssets, 1);
  assert.equal(result.transcripts.length, 1);
  assert.equal(result.transcripts[0].captionAssetId, "0_caption_it");

  assert.equal(calls.containsEntry.length, 1);
  assert.deepEqual(calls.entryGet, [
    "0_allowed"
  ]);
  assert.deepEqual(calls.captionList, [
    "0_allowed"
  ]);
});

test("verifyEntry skipScope avoids category membership lookup", async () => {
  const {
    service,
    calls
  } = createFixture({
    containsEntry: false
  });

  const result = await service.verifyEntry(
    {
      entryId: "0_allowed"
    },
    {
      skipScope: true
    }
  );

  assert.equal(result.status, "READY_FOR_INDEXING");
  assert.equal(calls.findByName.length, 0);
  assert.equal(calls.containsEntry.length, 0);
  assert.equal(calls.entryGet.length, 1);
  assert.equal(calls.captionList.length, 1);
});

test("verifyEntry normalizes missing entry as ENTRY_NOT_FOUND", async () => {
  const missingEntryError = Object.assign(
    new Error("Entry not found"),
    {
      code: "ENTRY_ID_NOT_FOUND"
    }
  );

  const {
    service,
    calls
  } = createFixture({
    entryError: missingEntryError
  });

  const result = await service.verifyEntry({
    entryId: "0_missing"
  });

  assert.equal(result.entryAvailable, false);
  assert.equal(result.status, "ENTRY_NOT_FOUND");
  assert.equal(result.eligibleForChatbot, false);
  assert.deepEqual(result.transcripts, []);
  assert.deepEqual(result.exclusionReasons, [
    "ENTRY_NOT_FOUND"
  ]);

  assert.equal(calls.containsEntry.length, 1);
  assert.equal(calls.entryGet.length, 1);
  assert.equal(calls.captionList.length, 0);
});

test("verifyEntry returns ENTRY_FOUND_NO_CAPTIONS", async () => {
  const {
    service
  } = createFixture({
    captionObjects: []
  });

  const result = await service.verifyEntry({
    entryId: "0_allowed"
  });

  assert.equal(result.entryAvailable, true);
  assert.equal(result.status, "ENTRY_FOUND_NO_CAPTIONS");
  assert.equal(result.eligibleForChatbot, false);
  assert.equal(result.captionSummary.totalCaptionAssets, 0);
  assert.deepEqual(result.exclusionReasons, [
    "NO_CAPTION_ASSETS"
  ]);
});

test("listTestScopeEntries verifies known IDs without recursive scope checks", async () => {
  const {
    service,
    calls
  } = createFixture({
    entryIds: [
      "0_first",
      "0_second"
    ],
    containsEntry: false,
    entry: entryId => ({
      id: entryId,
      name: `Entry ${entryId}`,
      mediaType: 1
    }),
    captionObjects: entryId => [
      {
        id: `${entryId}_caption`,
        entryId,
        language: "English",
        format: 1,
        status: 2
      }
    ]
  });

  const result = await service.listTestScopeEntries();

  assert.equal(result.category.id, 741902);
  assert.equal(result.category.name, "TEST_METADATA_EXTRACTION");
  assert.equal(result.total, 2);
  assert.equal(result.entries.length, 2);

  assert.deepEqual(
    result.entries.map(item => item.entryId),
    [
      "0_first",
      "0_second"
    ]
  );

  assert.deepEqual(calls.listEntryIds, [
    741902
  ]);

  assert.equal(calls.containsEntry.length, 0);
  assert.deepEqual(calls.entryGet, [
    "0_first",
    "0_second"
  ]);
  assert.deepEqual(calls.captionList, [
    "0_first",
    "0_second"
  ]);
});

test("extractTranscript blocks an entry outside test scope", async () => {
  const {
    service,
    calls
  } = createFixture({
    containsEntry: false
  });

  await assert.rejects(
    service.extractTranscript({
      entryId: "0_outside",
      captionAssetId: "0_caption_it",
      outputMode: "metadata"
    }),
    error => assertApplicationError(
      error,
      {
        code: "ENTRY_OUTSIDE_TEST_SCOPE",
        httpStatus: 403,
        retryable: false
      }
    )
  );

  assert.equal(calls.entryGet.length, 0);
  assert.equal(calls.captionList.length, 0);
  assert.equal(calls.captionServe.length, 0);
});

test("extractTranscript returns metadata and parsed SRT details", async () => {
  const {
    service,
    calls
  } = createFixture();

  const result = await service.extractTranscript({
    entryId: "0_allowed",
    captionAssetId: "0_caption_it",
    languageCode: "it",
    outputMode: "metadata"
  });

  assert.equal(result.entryId, "0_allowed");
  assert.equal(result.captionAssetId, "0_caption_it");
  assert.equal(result.languageCode, "it");
  assert.equal(result.formatCode, 1);
  assert.equal(result.format, "SRT");

  assert.equal(result.artifact.available, true);
  assert.equal(
    result.artifact.fileName,
    "0_allowed_it_0_caption_it.srt"
  );
  assert.equal(
    result.artifact.contentType,
    "application/x-subrip"
  );
  assert.equal(typeof result.artifact.sha256, "string");
  assert.equal(result.artifact.sha256.length, 64);
  assert.equal(result.artifact.content, undefined);

  assert.equal(result.cleanText.available, true);
  assert.equal(result.cleanText.content, undefined);
  assert.equal(result.segments.available, true);
  assert.equal(result.segments.count, 2);
  assert.equal(result.segments.items, undefined);

  assert.deepEqual(calls.captionServe, [
    "0_caption_it"
  ]);
});

test("extractPreferredTranscript blocks an entry outside test scope", async () => {
  const {
    service,
    calls
  } = createFixture({
    containsEntry: false
  });

  await assert.rejects(
    service.extractPreferredTranscript({
      entryId: "0_outside",
      languageCode: "it",
      outputMode: "metadata"
    }),
    error => assertApplicationError(
      error,
      {
        code: "ENTRY_OUTSIDE_TEST_SCOPE",
        httpStatus: 403,
        retryable: false
      }
    )
  );

  assert.equal(calls.entryGet.length, 0);
  assert.equal(calls.captionList.length, 0);
  assert.equal(calls.captionServe.length, 0);
});

test("extractPreferredTranscript prefers default eligible transcript", async () => {
  const {
    service,
    calls
  } = createFixture({
    captionObjects: [
      {
        id: "0_recent",
        entryId: "0_allowed",
        language: "Italian",
        format: 1,
        status: 2,
        isDefault: 0,
        updatedAt: 500
      },
      {
        id: "0_default",
        entryId: "0_allowed",
        language: "Italian",
        format: 1,
        status: 2,
        isDefault: 1,
        updatedAt: 100
      }
    ]
  });

  const result = await service.extractPreferredTranscript({
    entryId: "0_allowed",
    languageCode: "it",
    outputMode: "metadata"
  });

  assert.equal(result.captionAssetId, "0_default");
  assert.deepEqual(calls.captionServe, [
    "0_default"
  ]);

  assert.equal(calls.containsEntry.length, 2);
  assert.equal(calls.entryGet.length, 2);
  assert.equal(calls.captionList.length, 2);
});

test("extractPreferredTranscript chooses newest when no default exists", async () => {
  const {
    service
  } = createFixture({
    captionObjects: [
      {
        id: "0_older",
        entryId: "0_allowed",
        language: "English",
        format: 1,
        status: 2,
        updatedAt: 100
      },
      {
        id: "0_newer",
        entryId: "0_allowed",
        language: "English",
        format: 1,
        status: 2,
        updatedAt: 500
      }
    ]
  });

  const result = await service.extractPreferredTranscript({
    entryId: "0_allowed",
    languageCode: "en",
    outputMode: "metadata"
  });

  assert.equal(result.captionAssetId, "0_newer");
});

test("extractPreferredTranscript rejects unavailable language", async () => {
  const {
    service,
    calls
  } = createFixture();

  await assert.rejects(
    service.extractPreferredTranscript({
      entryId: "0_allowed",
      languageCode: "fr",
      outputMode: "metadata"
    }),
    error => {
      assertApplicationError(
        error,
        {
          code: "NO_ELIGIBLE_TRANSCRIPT",
          httpStatus: 404,
          retryable: false
        }
      );

      assert.deepEqual(error.details, {
        availableLanguages: [
          "it"
        ]
      });

      return true;
    }
  );

  assert.equal(calls.captionServe.length, 0);
});