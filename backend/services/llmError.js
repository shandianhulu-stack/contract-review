/**
 * 将上游大模型错误转换为稳定、可展示的业务错误。
 * 不向前端返回 API Key、上游响应正文或 SDK 堆栈。
 */

const getErrorText = (error) => [
    error?.message,
    error?.code,
    error?.error?.code,
    error?.error?.message,
    error?.response?.data?.code,
    error?.response?.data?.error?.code,
    error?.response?.data?.error?.message,
].filter(Boolean).join(' ');

const classifyLlmError = (error) => {
    const text = getErrorText(error);
    const status = Number(error?.status || error?.response?.status || 0);

    if (/LLM_(API_KEY|BASE_URL|MODEL) is required/i.test(text)) {
        return {
            status: 503,
            code: 'MODEL_NOT_CONFIGURED',
            error: 'AI 模型尚未完成配置，请联系管理员配置豆包模型后重试。',
        };
    }
    if (/AccountOverdue|overdue|欠费/i.test(text)) {
        return {
            status: 503,
            code: 'MODEL_ACCOUNT_OVERDUE',
            error: '豆包模型账户当前欠费或不可用，请充值恢复后重试。',
        };
    }
    if (/SetLimitExceeded|quota|usage limit|额度/i.test(text) || status === 429) {
        return {
            status: 429,
            code: 'MODEL_QUOTA_EXHAUSTED',
            error: '豆包模型调用额度已用尽或触发限流，请恢复额度后重试。',
        };
    }
    if (/ModelNotOpen|model[^\n]*(not open|not enabled)|模型[^\n]*未开通/i.test(text)) {
        return {
            status: 503,
            code: 'MODEL_NOT_OPEN',
            error: '当前豆包模型尚未开通，请在火山引擎开通该模型后重试。',
        };
    }
    if (/authentication|unauthorized|invalid api.?key|incorrect api.?key/i.test(text) || status === 401 || status === 403) {
        return {
            status: 503,
            code: 'MODEL_AUTH_FAILED',
            error: '豆包模型鉴权失败，请管理员检查 API Key 与访问权限。',
        };
    }
    if (status >= 400 || error?.name === 'APIError') {
        return {
            status: 502,
            code: 'MODEL_UPSTREAM_ERROR',
            error: '豆包模型服务暂时不可用，请稍后重试。',
        };
    }
    return null;
};

module.exports = {
    classifyLlmError,
};
