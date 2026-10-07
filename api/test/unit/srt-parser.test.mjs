import test from 'node:test';import assert from 'node:assert/strict';import {parseSrt} from '../../src/core/srt-parser.mjs';
test('parses SRT',()=>{const r=parseSrt('1\n00:00:00,000 --> 00:00:01,000\nCiao');assert.equal(r.segments.length,1);assert.equal(r.cleanText,'Ciao')});
