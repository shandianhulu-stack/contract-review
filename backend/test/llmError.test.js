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

test('classifies OpenAI-compatible connection timeouts without leaking details', () => {
    const result = classifyLlmError({
        name: 'APIConnectionTimeoutError',
        message: 'Request timed out. api-key=must-not-leak',
    });

    assert.deepEqual(result, {
        status: 504,
        code: 'MODEL_TIMEOUT',
        error: '豆包模型响应超时，系统已停止本次审查，请稍后重试。',
    });
    assert.equal(JSON.stringify(result).includes('must-not-leak'), false);
});

test('classifies common transport timeout codes', () => {
    assert.equal(classifyLlmError({ code: 'ETIMEDOUT' }).code, 'MODEL_TIMEOUT');
});
