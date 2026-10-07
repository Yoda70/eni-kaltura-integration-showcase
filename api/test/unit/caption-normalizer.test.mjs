import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeCaptionAsset,classifyEntry} from '../../src/core/caption-normalizer.mjs';
test('normalizes READY Italian SRT',()=>{const x=normalizeCaptionAsset({id:'0_asset',entryId:'0_entry',language:'Italian',format:'1',status:2});assert.equal(x.status,'READY');assert.equal(x.format,'SRT');assert.equal(x.languageCode,'it');assert.equal(x.eligibleAsset,true);const c=classifyEntry(true,[x],[]);assert.equal(c.status,'READY_FOR_INDEXING');assert.equal(c.eligibleForChatbot,true)});
