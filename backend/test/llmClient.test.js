const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getAccountConfigs,
    getLlmConfigurationStatus,
    isAccountFailoverError,
} = require('../services/llmClient');

const managedEnvNames = [
    'LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL',
    ...[1, 2, 3].flatMap((slot) => [
        `ARK_ACCOUNT_${slot}_ID`,
        `ARK_ACCOUNT_${slot}_API_KEY`,
        `ARK_ACCOUNT_${slot}_BASE_URL`,
        `ARK_ACCOUNT_${slot}_MODEL`,
    ]),
];

const withCleanModelEnv = (callback) => {
    const previous = Object.fromEntries(managedEnvNames.map((name) => [name, process.env[name]]));
    managedEnvNames.forEach((name) => delete process.env[name]);
    try {
        callback();
    } finally {
        managedEnvNames.forEach((name) => {
            if (previous[name] === undefined) delete process.env[name];
            else process.env[name] = previous[name];
        });
    }
};

test('uses all complete Ark account slots before the legacy single account', () => {
    withCleanModelEnv(() => {
        process.env.LLM_API_KEY = 'legacy-key';
        process.env.LLM_BASE_URL = 'https://legacy.example/v1';
        process.env.LLM_MODEL = 'legacy-model';
        for (const slot of [1, 2, 3]) {
            process.env[`ARK_ACCOUNT_${slot}_API_KEY`] = `key-${slot}`;
            process.env[`ARK_ACCOUNT_${slot}_BASE_URL`] = 'https://ark.cn-beijing.volces.com/api/v3';
            process.env[`ARK_ACCOUNT_${slot}_MODEL`] = `doubao-${slot}`;
        }

        const accounts = getAccountConfigs();
        assert.equal(accounts.length, 3);
        assert.deepEqual(accounts.map((account) => account.id), [
            'ark-account-1', 'ark-account-2', 'ark-account-3',
        ]);
        assert.equal(getLlmConfigurationStatus().provider, '豆包（火山方舟）');
        assert.equal(getLlmConfigurationStatus().accountCount, 3);
    });
});

test('ignores incomplete Ark slots and falls back to the complete legacy account', () => {
    withCleanModelEnv(() => {
        process.env.ARK_ACCOUNT_1_API_KEY = 'incomplete-key';
        process.env.LLM_API_KEY = 'legacy-key';
        process.env.LLM_BASE_URL = 'https://legacy.example/v1';
        process.env.LLM_MODEL = 'legacy-model';

        const accounts = getAccountConfigs();
        assert.equal(accounts.length, 1);
        assert.equal(accounts[0].id, 'default');
    });
});

test('fails over for quota, overdue, authorization and transient upstream errors', () => {
    assert.equal(isAccountFailoverError({ status: 429, code: 'SetLimitExceeded' }), true);
    assert.equal(isAccountFailoverError({ status: 403, code: 'AccountOverdueError' }), true);
    assert.equal(isAccountFailoverError({ status: 401 }), true);
    assert.equal(isAccountFailoverError({ status: 503 }), true);
    assert.equal(isAccountFailoverError({ status: 400, code: 'InvalidParameter' }), false);
});
