/**
 * @file services/llmClient.js
 * @brief OpenAI 兼容大模型客户端封装，提供聊天与视觉补全调用及重试机制
 *
 * 核心职责：
 * - 懒加载并复用 OpenAI 客户端实例（基于环境变量配置）
 * - 兼容调研系统 ARK_ACCOUNT_1..3 配置，按账户自动轮换与故障切换
 * - 提供聊天补全（createChatCompletion）与视觉补全（createVisionCompletion）接口
 * - 对可重试错误（408/409/429/5xx）执行指数退避重试
 *
 * 关键实现：
 * - 通过环境变量 LLM_API_KEY/LLM_BASE_URL/LLM_MODEL 配置客户端
 * - 视觉模型可通过 VISION_MODEL_NAME 指定，默认复用当前账户模型
 * - 重试次数、退避基数、超时均可通过环境变量调节
 *
 * 依赖关系：
 * - 上游：openai 官方 SDK
 * - 下游：incrementalReview、negotiationSimulator、reviewTemplates 等需要 LLM 的服务
 */

const clients = new Map();
let roundRobinCursor = 0;
let OpenAIClass;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getRequiredEnv = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required for OpenAI-compatible LLM calls.`);
    return value;
};

const getAccountConfigs = () => {
    const arkAccounts = [1, 2, 3]
        .map((slot) => ({
            id: process.env[`ARK_ACCOUNT_${slot}_ID`] || `ark-account-${slot}`,
            apiKey: process.env[`ARK_ACCOUNT_${slot}_API_KEY`],
            baseURL: process.env[`ARK_ACCOUNT_${slot}_BASE_URL`],
            model: process.env[`ARK_ACCOUNT_${slot}_MODEL`],
        }))
        .filter((account) => account.apiKey && account.baseURL && account.model);

    if (arkAccounts.length > 0) return arkAccounts;

    if (process.env.LLM_API_KEY && process.env.LLM_BASE_URL && process.env.LLM_MODEL) {
        return [{
            id: 'default',
            apiKey: process.env.LLM_API_KEY,
            baseURL: process.env.LLM_BASE_URL,
            model: process.env.LLM_MODEL,
        }];
    }

    return [];
};

const getLlmClient = (account) => {
    if (!account) throw new Error('LLM_API_KEY is required for OpenAI-compatible LLM calls.');
    if (!OpenAIClass) ({ OpenAI: OpenAIClass } = require('openai'));
    const cacheKey = `${account.id}:${account.baseURL}`;
    if (!clients.has(cacheKey)) {
        clients.set(cacheKey, new OpenAIClass({
            apiKey: account.apiKey,
            baseURL: account.baseURL,
        }));
    }
    return clients.get(cacheKey);
};

const getOrderedAccounts = () => {
    const accounts = getAccountConfigs();
    if (accounts.length <= 1) return accounts;
    const start = roundRobinCursor % accounts.length;
    roundRobinCursor = (roundRobinCursor + 1) % accounts.length;
    return accounts.slice(start).concat(accounts.slice(0, start));
};

const getLlmConfigurationStatus = () => {
    const accounts = getAccountConfigs();
    const baseURL = String(accounts[0]?.baseURL || process.env.LLM_BASE_URL || '');
    const model = String(accounts[0]?.model || process.env.LLM_MODEL || '');
    const configured = accounts.length > 0;
    let provider = 'OpenAI 兼容模型';
    if (/volces|volcengine|ark\.cn-/i.test(baseURL)) provider = '豆包（火山方舟）';
    if (/3010|open-webui/i.test(baseURL)) provider = '内部 AI 网关';
    return {
        configured,
        provider,
        model: configured ? model : '',
        accountCount: accounts.length,
    };
};

const isRetryableError = (error) => {
    const status = error?.status || error?.response?.status;
    if (/LLM_(API_KEY|BASE_URL|MODEL) is required/i.test(String(error?.message || ''))) return false;
    if (!status) return true;
    return status === 408 || status === 409 || status === 429 || status >= 500;
};

const isAccountFailoverError = (error) => {
    const status = error?.status || error?.response?.status;
    const code = String(error?.code || error?.error?.code || error?.response?.data?.error?.code || '');
    return isRetryableError(error)
        || status === 401
        || status === 403
        || /AccountOverdue|SetLimitExceeded|Quota|RateLimit|Unauthorized|Forbidden/i.test(code);
};

const safeErrorLabel = (error) => {
    const status = error?.status || error?.response?.status || 'network';
    const code = String(error?.code || error?.error?.code || error?.response?.data?.error?.code || 'unknown');
    return `${status}/${code}`;
};

const createWithAccountFailover = async ({ options, requestOptions, vision = false }) => {
    const accounts = getOrderedAccounts();
    if (accounts.length === 0) {
        getRequiredEnv('LLM_API_KEY');
        getRequiredEnv('LLM_BASE_URL');
        getRequiredEnv('LLM_MODEL');
        throw new Error('No complete LLM account configuration is available.');
    }

    const maxRetries = Number(process.env.LLM_MAX_RETRIES || 2);
    const baseDelay = Number(process.env.LLM_RETRY_BASE_MS || 800);
    const timeout = Number(process.env.LLM_TIMEOUT_MS || 90000);
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        for (let accountIndex = 0; accountIndex < accounts.length; accountIndex += 1) {
            const account = accounts[accountIndex];
            try {
                return await getLlmClient(account).chat.completions.create({
                    model: vision ? (process.env.VISION_MODEL_NAME || account.model) : account.model,
                    ...options,
                }, {
                    timeout,
                    ...requestOptions,
                });
            } catch (error) {
                lastError = error;
                const hasAnotherAccount = accountIndex < accounts.length - 1;
                if (!isAccountFailoverError(error)) throw error;
                if (hasAnotherAccount) {
                    console.warn(`[LLM] Account ${account.id} unavailable (${safeErrorLabel(error)}); switching account.`);
                }
            }
        }

        if (attempt >= maxRetries || !isRetryableError(lastError)) break;
        const delay = baseDelay * (2 ** attempt) + Math.floor(Math.random() * 250);
        console.warn(`[LLM] All configured accounts unavailable; retrying in ${delay}ms (${attempt + 1}/${maxRetries}).`);
        await sleep(delay);
    }

    throw lastError;
};

const createChatCompletion = async (options, requestOptions = {}) => {
    return createWithAccountFailover({ options, requestOptions });
};

const createVisionCompletion = async (options, requestOptions = {}) => {
    return createWithAccountFailover({ options, requestOptions, vision: true });
};

module.exports = {
    createChatCompletion,
    createVisionCompletion,
    getLlmConfigurationStatus,
    getAccountConfigs,
    isAccountFailoverError,
};
