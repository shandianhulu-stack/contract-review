/**
 * @file services/contractAnalysis/llm.js
 * @brief 封装大模型调用，提供 JSON 结构化响应能力
 *
 * 核心职责：
 * - 调用底层 LLM 客户端发起对话补全请求
 * - 清理模型返回内容中的思考标签与代码块标记
 * - 将清理后的文本解析为 JSON 对象返回
 *
 * 关键实现：
 * - callJsonLLM 优先使用 response_format，并为不支持该参数的模型提供提示词约束降级
 * - 显式提高结构化报告输出上限，并在返回非法 JSON 时自动重试一次
 * - cleanJsonResponse 去除 think 标签与 json 代码块后解析
 *
 * 依赖关系：
 * - 上游：../llmClient（统一的大模型调用客户端）
 * - 下游：被 analysisCore、knowledge 等需要结构化输出的模块调用
 */
const { createChatCompletion } = require('../llmClient');

const cleanJsonResponse = (text) => {
    const clean = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```json|```/g, '').trim();
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    const jsonText = firstBrace >= 0 && lastBrace > firstBrace
        ? clean.slice(firstBrace, lastBrace + 1)
        : clean;
    return JSON.parse(jsonText);
};

const clampInteger = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const getJsonRequestPolicy = () => ({
    timeout: clampInteger(process.env.LLM_JSON_TIMEOUT_MS, 180000, 10000, 600000),
    maxRetries: clampInteger(process.env.LLM_JSON_MAX_RETRIES, 0, 0, 2),
});

const buildJsonCompletionOptions = (content, maxTokens) => {
    const responseMode = String(process.env.LLM_JSON_RESPONSE_MODE || 'auto').trim().toLowerCase();
    const options = {
        messages: [{ role: 'user', content }],
        max_tokens: maxTokens,
    };
    if (!['prompt', 'off', 'disabled'].includes(responseMode)) {
        options.response_format = { type: 'json_object' };
    }
    return options;
};

const callJsonLLM = async (prompt, hooks = {}) => {
    const configuredMaxTokens = Number(process.env.LLM_JSON_MAX_TOKENS || 16000);
    const maxTokens = Number.isFinite(configuredMaxTokens)
        ? Math.min(32768, Math.max(1024, configuredMaxTokens))
        : 16000;
    const requestPolicy = getJsonRequestPolicy();
    const requestJson = (content) => createChatCompletion(
        buildJsonCompletionOptions(content, maxTokens),
        { ...requestPolicy, onAttempt: hooks.onAttempt },
    );

    const completion = await requestJson(prompt);
    try {
        return cleanJsonResponse(completion.choices[0].message.content);
    } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        console.warn('[LLM] Model returned invalid JSON; retrying the structured response once.');
        const retryCompletion = await requestJson(`${prompt}\n\n上一次返回的 JSON 不完整或无法解析。请压缩文字长度，重新输出一个完整、合法且可直接解析的 JSON 对象，不要输出任何额外说明。`);
        return cleanJsonResponse(retryCompletion.choices[0].message.content);
    }
};

module.exports = {
    cleanJsonResponse,
    buildJsonCompletionOptions,
    getJsonRequestPolicy,
    callJsonLLM,
};
