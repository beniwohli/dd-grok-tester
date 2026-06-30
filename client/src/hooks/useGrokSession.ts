import { useState, useCallback } from 'react';
import { generateId, parseRuleLine } from '../utils';
import { useConfirmActions } from './useConfirmActions';
import { useGrokParser } from './useGrokParser';
import { useGrokHistory } from './useGrokHistory';

export const useGrokSession = () => {
  const [currentTab, setCurrentTab] = useState<'test' | 'history' | 'docs'>('test');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // 1. Parser and Session State Hook
  const parser = useGrokParser({ currentTab });

  // 2. Action Confirmation Hook
  const confirmActions = useConfirmActions();

  // 3. History Hook
  const historyHook = useGrokHistory({
    currentSessionId: parser.currentSessionId,
    setCurrentSessionId: parser.setCurrentSessionId,
    sessionName: parser.sessionName,
    setSessionName: parser.setSessionName,
    matchRules: parser.matchRules,
    setMatchRules: parser.setMatchRules,
    supportRules: parser.supportRules,
    setSupportRules: parser.setSupportRules,
    samples: parser.samples,
    setSamples: parser.setSamples,
    setResults: parser.setResults,
    setCurrentTab,
    requestConfirm: confirmActions.requestConfirm,
    showToast,
  });

  const clearSession = useCallback(() => {
    confirmActions.requestConfirm({ type: 'clear-session' }, () => {
      parser.setSessionName('');
      parser.setMatchRules('');
      parser.setSupportRules('');
      parser.setSamples([{ id: generateId(), text: '' }]);
      parser.setResults({});
      parser.setCurrentSessionId(generateId());
      showToast('Session cleared');
    });
  }, [confirmActions, parser, showToast]);

  const escapeHCLString = (str: string) => {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
  };

  const exportAsTerraform = useCallback(() => {
    const toHCLBlock = (line: string) => {
      const { name, pattern } = parseRuleLine(line);
      return `    {
      name = "${escapeHCLString(name)}"
      rule = "${escapeHCLString(pattern)}"
    }`;
    };

    const rulesList = parser.matchRules
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)
      .map(toHCLBlock)
      .join(',\n');

    const supportRulesList = parser.supportRules
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)
      .map(toHCLBlock)
      .join(',\n');

    const hcl = `{
  id_prefix   = ""
  log_sources = []
  rules = [
${rulesList}
  ]
  support_rules = [
${supportRulesList}
  ]
}`;

    navigator.clipboard.writeText(hcl).then(() => {
      showToast('Terraform configuration copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy: ', err);
      showToast('Failed to copy to clipboard');
    });
  }, [parser.matchRules, parser.supportRules, showToast]);

  return {
    currentTab,
    setCurrentTab,
    toast,
    currentSessionId: parser.currentSessionId,
    sessionName: parser.sessionName,
    setSessionName: parser.setSessionName,
    samples: parser.samples,
    matchRules: parser.matchRules,
    setMatchRules: parser.setMatchRules,
    supportRules: parser.supportRules,
    setSupportRules: parser.setSupportRules,
    history: historyHook.history,
    results: parser.results,
    ddImportCandidates: historyHook.ddImportCandidates,
    setDdImportCandidates: historyHook.setDdImportCandidates,
    addSample: parser.addSample,
    updateSample: parser.updateSample,
    removeSample: parser.removeSample,
    clearSession,
    saveToHistory: historyHook.saveToHistory,
    loadFromHistory: historyHook.loadFromHistory,
    deleteFromHistory: historyHook.deleteFromHistory,
    clearHistory: historyHook.clearHistory,
    exportHistory: historyHook.exportHistory,
    importHistory: historyHook.importHistory,
    importDatadogIntegrations: historyHook.importDatadogIntegrations,
    importFromTerraform: historyHook.importFromTerraform,
    confirmDdImport: historyHook.confirmDdImport,
    exportAsTerraform,
    isClearSessionPending: confirmActions.isClearSessionPending,
    isClearHistoryPending: confirmActions.isClearHistoryPending,
    pendingDeleteId: confirmActions.pendingDeleteId,
  };
};
