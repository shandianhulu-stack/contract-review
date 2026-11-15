<template>
  <div class="space-y-5">
    <section class="overflow-hidden rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div class="p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="font-semibold text-text-dark">合同审查工作台</h4>
              <span class="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-xs font-medium text-primary">{{ isPdfContract ? 'PDF 人工编辑模式' : 'DOCX 智能采纳模式' }}</span>
            </div>
            <p class="mt-1 text-xs leading-5 text-text-light">{{ contract.original_filename || '当前合同' }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button @click="prepareFocusedReviewFromSelection" class="rounded border border-primary bg-white px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary-light">读取当前选区</button>
            <button @click="forceSaveCurrentDocument(false)" class="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark">立即保存合同</button>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div v-for="item in capabilityItems" :key="item.key" :class="item.enabled ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-400'" class="flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
            <span :class="item.enabled ? 'bg-green-500' : 'bg-gray-300'" class="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white">{{ item.enabled ? '✓' : '—' }}</span>
            <span>{{ item.label }}</span>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-4 gap-2">
          <div class="rounded-md border border-red-100 bg-white p-2 text-center"><p class="text-lg font-bold text-red-600">{{ riskDashboard.stats.high }}</p><p class="text-[11px] text-text-light">高危风险</p></div>
          <div class="rounded-md border border-amber-100 bg-white p-2 text-center"><p class="text-lg font-bold text-amber-600">{{ riskDashboard.stats.medium }}</p><p class="text-[11px] text-text-light">中危风险</p></div>
          <div class="rounded-md border border-blue-100 bg-white p-2 text-center"><p class="text-lg font-bold text-blue-600">{{ riskDashboard.stats.low }}</p><p class="text-[11px] text-text-light">低危风险</p></div>
          <div class="rounded-md border border-indigo-100 bg-white p-2 text-center"><p class="text-lg font-bold text-indigo-600">{{ focusedReviewHistory.length }}</p><p class="text-[11px] text-text-light">专项审查</p></div>
        </div>
      </div>
      <div class="border-t border-blue-100 bg-white/70 px-4 py-3">
        <div class="grid grid-cols-4 gap-1 text-center text-[11px]">
          <div v-for="(step, index) in workflowSteps" :key="step" class="relative">
            <div class="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{{ index + 1 }}</div>
            <p class="mt-1 text-text-main">{{ step }}</p>
            <span v-if="index < workflowSteps.length - 1" class="absolute left-[62%] top-3 hidden h-px w-[76%] bg-blue-200 sm:block"></span>
          </div>
        </div>
      </div>
    </section>

    <section class="rounded-lg border border-border-color bg-white p-4 shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div><h4 class="font-semibold text-text-dark">1. 选取条款并设定审查任务</h4><p class="mt-1 text-xs text-text-light">在左侧选中条款后读取，也可直接粘贴文本。</p></div>
        <button @click="prepareFocusedReviewFromSelection" class="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark">从左侧读取</button>
      </div>
      <el-input v-model="focusedReviewText" class="mt-3" type="textarea" :rows="7" placeholder="请粘贴或读取需要专项审查的合同条款" />
      <div class="mt-3">
        <p class="text-xs font-medium text-text-main">快捷审查任务</p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button v-for="item in quickQuestions" :key="item.label" @click="focusedReviewQuestion = item.question" :class="focusedReviewQuestion === item.question ? 'border-primary bg-primary-light text-primary' : 'border-border-color bg-white text-text-main hover:border-primary hover:text-primary'" class="rounded-full border px-3 py-1.5 text-xs transition-colors">{{ item.label }}</button>
        </div>
      </div>
      <el-input v-model="focusedReviewQuestion" class="mt-3" placeholder="输入具体问题，例如：付款与验收条件是否对我方不利，并给出替换条款" />
      <div class="mt-3 flex items-center justify-between gap-3">
        <p class="text-xs text-text-light">将结合当前审查立场、合同类型和模板执行分析。</p>
        <button @click="submitFocusedReview" :disabled="focusedReviewLoading || !focusedReviewText.trim()" class="flex-shrink-0 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50">{{ focusedReviewLoading ? '正在审查...' : '开始专项审查' }}</button>
      </div>
    </section>

    <section v-if="focusedReviewResult" class="overflow-hidden rounded-lg border border-blue-200 bg-white shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50 px-4 py-3">
        <div><p class="font-semibold text-blue-900">2. AI 专项审查结论</p><p class="mt-0.5 text-xs text-blue-700">先核对风险与依据，再决定是否处置。</p></div>
        <button @click="copyText(buildConclusionText(), '审查结论')" class="rounded border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">复制完整结论</button>
      </div>
      <div class="space-y-4 p-4">
        <div><p class="text-xs font-semibold uppercase tracking-wide text-text-light">风险判断</p><p class="mt-2 whitespace-pre-line text-sm leading-6 text-text-main">{{ focusedReviewResult.risk_summary }}</p></div>
        <div v-if="focusedReviewResult.plain_language" class="rounded-md border-l-4 border-blue-400 bg-blue-50 p-3 text-blue-900"><p class="mb-1 text-xs font-bold">大白话说明</p><p class="text-sm leading-6">{{ focusedReviewResult.plain_language }}</p></div>
        <div v-if="focusedReviewResult.suggested_text" class="rounded-md border border-green-200 bg-green-50 p-3">
          <div class="flex items-center justify-between gap-2"><p class="text-xs font-bold text-green-800">建议替换条款</p><button @click="copyText(focusedReviewResult.suggested_text, '建议条款')" class="rounded border border-green-300 bg-white px-2 py-1 text-xs text-green-700 hover:bg-green-100">复制条款</button></div>
          <p class="mt-2 whitespace-pre-line text-sm leading-6 text-green-900">{{ focusedReviewResult.suggested_text }}</p>
          <div class="mt-3 border-t border-green-200 pt-3">
            <button v-if="!isPdfContract" @click="applyFocusedSuggestion" class="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-dark">替换左侧选中文本</button>
            <p v-else class="text-xs leading-5 text-amber-700">PDF 已开放左侧原生编辑与批注；Community 版不支持 AI 面板自动替换 PDF，请复制上方条款后在左侧手工修改。</p>
          </div>
        </div>
        <div v-if="focusedReviewResult.relevant_laws && focusedReviewResult.relevant_laws.length">
          <p class="text-xs font-semibold uppercase tracking-wide text-text-light">法律与案例依据</p>
          <div v-for="(item, index) in focusedReviewResult.relevant_laws" :key="'fr-law-' + index" class="mt-2 rounded-md border border-border-color bg-bg-subtle p-3 text-xs leading-5"><p class="font-semibold text-text-dark">【{{ item.law }}】{{ item.clause }}</p><p class="mt-1 text-text-main">{{ item.content }}</p></div>
        </div>
      </div>
    </section>

    <section v-if="focusedReviewHistory.length" class="rounded-lg border border-border-color bg-white p-4 shadow-sm">
      <div class="flex items-center justify-between"><div><p class="font-semibold text-text-dark">3. 专项审查记录</p><p class="mt-1 text-xs text-text-light">已持久化保存，可随时回看和复用。</p></div><span class="rounded-full bg-bg-subtle px-2 py-1 text-xs text-text-light">{{ focusedReviewHistory.length }} 条</span></div>
      <div class="mt-3 max-h-80 space-y-2 overflow-y-auto">
        <article v-for="item in focusedReviewHistory" :key="'fr-h-' + item.id" class="rounded-md border border-border-color bg-bg-subtle p-3 text-xs transition-colors hover:border-primary">
          <div class="flex items-start justify-between gap-3"><div class="min-w-0 flex-1"><p class="font-semibold leading-5 text-text-main">{{ item.question || '（未指定专项问题）' }}</p><p class="mt-1 line-clamp-2 leading-5 text-text-light">原文：{{ item.source_text }}</p><p class="mt-1 text-text-light">{{ formatHistoryTime(item.created_at) }}</p></div><div class="flex flex-shrink-0 gap-1"><button @click="loadFocusedReviewFromHistory(item)" class="rounded border border-primary px-2 py-1 text-primary hover:bg-primary hover:text-white">查看</button><button @click="deleteFocusedReviewFromHistory(item.id)" class="rounded border border-red-300 px-2 py-1 text-red-500 hover:bg-red-500 hover:text-white">删除</button></div></div>
        </article>
      </div>
    </section>

    <details class="group rounded-lg border border-border-color bg-white shadow-sm">
      <summary class="flex cursor-pointer list-none items-center justify-between p-4"><div><p class="font-semibold text-text-dark">版本与最近变更</p><p class="mt-1 text-xs text-text-light">查看建议采纳前后的新增与删除文本。</p></div><span class="text-lg text-primary transition-transform group-open:rotate-180">⌄</span></summary>
      <div class="border-t border-border-color p-4">
        <div class="flex justify-end"><button @click="loadLatestDiff" :disabled="diffLoading" class="rounded border border-primary bg-white px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary-light disabled:opacity-50">{{ diffLoading ? '加载中...' : '查看最近变更' }}</button></div>
        <div v-if="diffItems.length" class="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-bg-subtle p-3 text-xs leading-6"><template v-for="(part, index) in diffItems" :key="'diff-' + index"><span v-if="part.type === 'insert'" class="diff-insert">{{ part.text }}</span><span v-else-if="part.type === 'delete'" class="diff-delete">{{ part.text }}</span><span v-else>{{ part.text }}</span></template></div>
        <p v-else class="mt-3 text-xs text-text-light">尚未加载变更，采纳 DOCX 修改后会自动保存原始快照。</p>
      </div>
    </details>

    <details class="group rounded-lg border border-border-color bg-white shadow-sm">
      <summary class="flex cursor-pointer list-none items-center justify-between p-4"><div><p class="font-semibold text-text-dark">调整审查策略并重新审查</p><p class="mt-1 text-xs text-text-light">重新设定合同类型、审查立场、审查点和核心目的。</p></div><span class="text-lg text-primary transition-transform group-open:rotate-180">⌄</span></summary>
      <div class="space-y-5 border-t border-border-color p-4">
        <div><label class="block text-sm font-medium text-text-main">合同类型</label><el-input v-model="preAnalysisData.contract_type" class="mt-1" /></div>
        <div><label class="block text-sm font-medium text-text-main">审查立场</label><el-select v-model="perspective" placeholder="请选择或输入您的立场" class="mt-1 w-full" filterable allow-create><el-option v-for="party in allPotentialParties" :key="party" :label="party" :value="party" /></el-select></div>
        <div><label class="block text-sm font-medium text-text-main">审查点选择</label><div class="mt-2 rounded-md bg-bg-subtle p-3"><el-checkbox-group v-model="selectedReviewPoints" class="flex flex-wrap gap-2"><el-checkbox v-for="point in allSuggestedReviewPoints" :key="point" :label="point" :value="point" border /></el-checkbox-group></div></div>
        <div>
          <label class="block text-sm font-medium text-text-main">审查核心目的</label>
          <div v-for="(purpose, index) in customPurposes" :key="index" class="mt-2 flex items-center"><el-autocomplete v-model="purpose.value" :fetch-suggestions="querySearchCorePurposes" placeholder="搜索或输入新目的" class="w-full" trigger-on-focus /><button @click="removePurpose(index)" class="ml-2 text-gray-400 hover:text-danger" aria-label="删除审查目的">−</button></div>
          <button @click="addPurpose" class="mt-2 text-sm font-medium text-primary hover:text-primary-dark">+ 添加目的</button>
        </div>
        <button @click="startReAnalysis" :disabled="!perspective || selectedReviewPoints.length === 0 || reAnalyzing" class="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50">{{ reAnalyzing ? '正在重审...' : '确认重审' }}</button>
        <div v-if="reAnalyzing || analysisActive" class="reanalysis-progress rounded-md border border-border-color bg-white p-4">
          <div class="mb-2 flex items-center justify-between"><span class="text-sm font-semibold text-text-dark">{{ loadingMessage || '正在重新审查合同...' }}</span><span v-if="analysisPercent > 0" class="text-lg font-bold text-primary">{{ analysisPercent }}%</span></div>
          <div class="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200"><div class="h-2 rounded-full bg-primary transition-all duration-500 ease-out" :style="{ width: analysisPercent + '%' }" /></div>
          <div class="mb-3 flex justify-between text-xs text-text-light"><span>已用时：{{ formatDuration(analysisElapsed) }}</span><span v-if="analysisEta > 0">预计剩余：{{ formatDuration(analysisEta) }}</span></div>
          <div v-if="analysisSteps.length" class="analysis-progress mt-2 w-full">
            <div v-for="(step, index) in analysisSteps" :key="'re-step-' + index" class="analysis-progress__item" :class="[`analysis-progress__item--${progressStatusClass(step.status)}`]">
              <div class="analysis-progress__marker"><span v-if="step.status === 'completed'">✓</span><span v-else-if="step.status === 'failed'">!</span><span v-else-if="step.status === 'running'" class="analysis-progress__spinner" /><span v-else>{{ index + 1 }}</span></div>
              <div class="analysis-progress__content"><div class="analysis-progress__title"><span>{{ step.label }}</span><span class="analysis-progress__status">{{ progressStatusLabel(step.status) }}</span></div><p v-if="step.message" class="analysis-progress__message">{{ step.message }}</p></div>
            </div>
          </div>
        </div>
      </div>
    </details>
  </div>
</template>

<script>
import { computed, inject, unref } from 'vue';
import { ElAutocomplete, ElCheckbox, ElCheckboxGroup, ElInput, ElMessage, ElOption, ElSelect } from 'element-plus';

export default {
  name: 'ReviewWorkspaceTab',
  components: { ElAutocomplete, ElCheckbox, ElCheckboxGroup, ElInput, ElOption, ElSelect },
  setup() {
    const review = inject('review');
    const {
      contract, isPdfContract, riskDashboard,
      diffItems, diffLoading, loadLatestDiff,
      prepareFocusedReviewFromSelection, forceSaveCurrentDocument,
      focusedReviewText, focusedReviewQuestion, focusedReviewResult, focusedReviewLoading,
      submitFocusedReview, applyFocusedSuggestion,
      focusedReviewHistory, formatHistoryTime, loadFocusedReviewFromHistory, deleteFocusedReviewFromHistory,
      preAnalysisData, perspective, allPotentialParties,
      selectedReviewPoints, allSuggestedReviewPoints,
      customPurposes, querySearchCorePurposes, removePurpose, addPurpose,
      startReAnalysis, reAnalyzing,
      analysisActive, loadingMessage, analysisPercent, analysisElapsed, analysisEta,
      formatDuration, analysisSteps, progressStatusClass, progressStatusLabel,
    } = review;

    const workflowSteps = ['选取条款', '设定问题', 'AI 审查', '处置与留痕'];
    const quickQuestions = [
      { label: '合法性与效力', question: '审查该条款的合法性、效力风险及可执行性，并给出修改建议。' },
      { label: '权利义务对等', question: '审查该条款的权利义务是否对等，识别对我方不利的单方义务。' },
      { label: '违约与赔偿', question: '审查违约责任、赔偿范围、责任上限和免责事由是否合理。' },
      { label: '付款与验收', question: '审查付款节点、验收标准、默认验收和发票条件对我方的风险。' },
      { label: '保密与数据', question: '审查保密范围、数据安全、个人信息处理和泄露责任。' },
      { label: '生成替换条款', question: '结合我方立场指出风险，并生成一段可直接使用的完整替换条款。' },
    ];

    const capabilityItems = computed(() => {
      const permissions = contract.editorConfig?.document?.permissions || {};
      const editable = contract.editorConfig?.editorConfig?.mode === 'edit';
      return [
        { key: 'edit', label: '可编辑', enabled: editable && permissions.edit !== false },
        { key: 'comment', label: '可批注', enabled: editable && permissions.comment !== false },
        { key: 'fillForms', label: '可填表', enabled: editable && permissions.fillForms !== false },
        { key: 'copy', label: '可复制', enabled: permissions.copy !== false },
        { key: 'download', label: '可下载', enabled: permissions.download !== false },
        { key: 'print', label: '可打印', enabled: permissions.print !== false },
      ];
    });

    const copyText = async (text, label) => {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(String(text));
        ElMessage.success(`${label}已复制`);
      } catch {
        ElMessage.warning('浏览器未开放剪贴板权限，请手动复制。');
      }
    };

    const buildConclusionText = () => {
      const result = unref(focusedReviewResult);
      if (!result) return '';
      return [
        result.risk_summary && `风险判断\n${result.risk_summary}`,
        result.plain_language && `大白话说明\n${result.plain_language}`,
        result.suggested_text && `建议替换条款\n${result.suggested_text}`,
      ].filter(Boolean).join('\n\n');
    };

    return {
      contract, isPdfContract, riskDashboard, workflowSteps, quickQuestions, capabilityItems,
      diffItems, diffLoading, loadLatestDiff,
      prepareFocusedReviewFromSelection, forceSaveCurrentDocument,
      focusedReviewText, focusedReviewQuestion, focusedReviewResult, focusedReviewLoading,
      submitFocusedReview, applyFocusedSuggestion, copyText, buildConclusionText,
      focusedReviewHistory, formatHistoryTime, loadFocusedReviewFromHistory, deleteFocusedReviewFromHistory,
      preAnalysisData, perspective, allPotentialParties,
      selectedReviewPoints, allSuggestedReviewPoints,
      customPurposes, querySearchCorePurposes, removePurpose, addPurpose,
      startReAnalysis, reAnalyzing,
      analysisActive, loadingMessage, analysisPercent, analysisElapsed, analysisEta,
      formatDuration, analysisSteps, progressStatusClass, progressStatusLabel,
    };
  },
};
</script>

<style scoped>
.reanalysis-progress .analysis-progress {
  max-height: 280px;
  overflow-y: auto;
}
</style>
