const test = require('node:test');
const assert = require('node:assert/strict');

const { cleanJsonResponse } = require('../services/contractAnalysis/llm');

test('parses plain and fenced JSON responses', () => {
    assert.deepEqual(cleanJsonResponse('{"ok":true}'), { ok: true });
    assert.deepEqual(cleanJsonResponse('```json\n{"ok":true}\n```'), { ok: true });
});

test('extracts a complete JSON object from compatibility-mode prose', () => {
    assert.deepEqual(
        cleanJsonResponse('以下是结果：\n{"items":[{"risk":"高"}]}\n结束。'),
        { items: [{ risk: '高' }] },
    );
});

test('keeps rejecting truncated JSON so callJsonLLM can retry it', () => {
    assert.throws(
        () => cleanJsonResponse('{"items":[{"risk":"高'),
        SyntaxError,
    );
});
