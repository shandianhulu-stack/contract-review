const test = require('node:test');
const assert = require('node:assert/strict');

const {
    cleanJsonResponse,
    buildJsonCompletionOptions,
    getJsonRequestPolicy,
} = require('../services/contractAnalysis/llm');

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

test('prompt response mode omits unsupported response_format', () => {
    const previous = process.env.LLM_JSON_RESPONSE_MODE;
    process.env.LLM_JSON_RESPONSE_MODE = 'prompt';
    try {
        const options = buildJsonCompletionOptions('review this contract', 8000);
        assert.equal(options.response_format, undefined);
        assert.equal(options.max_tokens, 8000);
    } finally {
        if (previous === undefined) delete process.env.LLM_JSON_RESPONSE_MODE;
        else process.env.LLM_JSON_RESPONSE_MODE = previous;
    }
});

test('auto response mode keeps structured response compatibility fallback', () => {
    const previous = process.env.LLM_JSON_RESPONSE_MODE;
    process.env.LLM_JSON_RESPONSE_MODE = 'auto';
    try {
        const options = buildJsonCompletionOptions('review this contract', 8000);
        assert.deepEqual(options.response_format, { type: 'json_object' });
    } finally {
        if (previous === undefined) delete process.env.LLM_JSON_RESPONSE_MODE;
        else process.env.LLM_JSON_RESPONSE_MODE = previous;
    }
});

test('JSON report policy uses its own bounded timeout and retry values', () => {
    const previousTimeout = process.env.LLM_JSON_TIMEOUT_MS;
    const previousRetries = process.env.LLM_JSON_MAX_RETRIES;
    process.env.LLM_JSON_TIMEOUT_MS = '180000';
    process.env.LLM_JSON_MAX_RETRIES = '0';
    try {
        assert.deepEqual(getJsonRequestPolicy(), { timeout: 180000, maxRetries: 0 });
    } finally {
        if (previousTimeout === undefined) delete process.env.LLM_JSON_TIMEOUT_MS;
        else process.env.LLM_JSON_TIMEOUT_MS = previousTimeout;
        if (previousRetries === undefined) delete process.env.LLM_JSON_MAX_RETRIES;
        else process.env.LLM_JSON_MAX_RETRIES = previousRetries;
    }
});
