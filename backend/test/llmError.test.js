const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyLlmError } = require('../services/llmError');

test('classifies missing model configuration without exposing environment details', () => {
    const result = classifyLlmError(new Error('LLM_API_KEY is required for OpenAI-compatible LLM calls.'));
    assert.equal(result.code, 'MODEL_NOT_CONFIGURED');
    assert.equal(result.status, 503);
    assert.doesNotMatch(result.error, /LLM_API_KEY|sk-/);
});

test('classifies Doubao quota limit', () => {
    const result = classifyLlmError({ status: 429, code: 'SetLimitExceeded', message: 'usage limit reached' });
    assert.equal(result.code, 'MODEL_QUOTA_EXHAUSTED');
    assert.equal(result.status, 429);
});

test('classifies Doubao overdue account before generic authorization failure', () => {
    const result = classifyLlmError({ status: 403, code: 'AccountOverdueError' });
    assert.equal(result.code, 'MODEL_ACCOUNT_OVERDUE');
});

test('returns null for unrelated local errors', () => {
    assert.equal(classifyLlmError(new Error('database is unavailable')), null);
});
