// 导入凭据验活与回滚流程 Hook

import { useCallback, useState } from 'react';
import { credentialsApi, type ImportCredentialItem } from '@/api';
import type { CredentialItem } from '@/api';
import type { ImportProgress, ImportVerificationResult } from '@/types/import-verify';

interface UseImportVerifyOptions {
  credentials: CredentialItem[];
}

interface ImportSummary {
  successCount: number;
  duplicateCount: number;
  failCount: number;
  rollbackSuccessCount: number;
  rollbackFailedCount: number;
  rollbackSkippedCount: number;
}

export function useImportVerify({ credentials }: UseImportVerifyOptions) {
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ current: 0, total: 0 });
  const [currentProcessing, setCurrentProcessing] = useState('');
  const [importResults, setImportResults] = useState<ImportVerificationResult[]>([]);

  const resetImportState = useCallback(() => {
    setImporting(false);
    setImportProgress({ current: 0, total: 0 });
    setCurrentProcessing('');
    setImportResults([]);
  }, []);

  const rollbackCredential = useCallback(async (id: number): Promise<{ success: boolean; error?: string }> => {
    try {
      await credentialsApi.setDisabled(id, true);
    } catch (error) {
      return {
        success: false,
        error: `禁用失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }

    try {
      await credentialsApi.delete(id);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `删除失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }, []);

  const getImportStatusText = useCallback((result: ImportVerificationResult) => {
    switch (result.status) {
      case 'pending':
        return '等待中';
      case 'checking':
        return '验活中';
      case 'success':
        return '验活成功';
      case 'duplicate':
        return '重复凭据';
      case 'failed':
        if (result.rollbackStatus === 'success') return '验活失败（已排除）';
        if (result.rollbackStatus === 'failed') return '验活失败（未排除）';
        return '验活失败（未创建）';
    }
  }, []);

  const validateImportList = useCallback((list: ImportCredentialItem[]): { ok: true } | { ok: false; message: string } => {
    for (let index = 0; index < list.length; index++) {
      const credential = list[index];
      const clientId = credential.clientId?.trim();
      const clientSecret = credential.clientSecret?.trim();

      if ((clientId && !clientSecret) || (!clientId && clientSecret)) {
        return {
          ok: false,
          message: `第 ${index + 1} 条凭据校验失败：idc 模式需要同时提供 clientId 和 clientSecret`,
        };
      }
    }

    return { ok: true };
  }, []);

  const runImportVerify = useCallback(async (list: ImportCredentialItem[]): Promise<ImportSummary> => {
    const initialResults: ImportVerificationResult[] = list.map((_, index) => ({
      index,
      status: 'pending',
    }));
    setImportResults(initialResults);
    setImportProgress({ current: 0, total: list.length });
    setCurrentProcessing('准备开始导入...');
    setImporting(true);

    let successCount = 0;
    let duplicateCount = 0;
    let failCount = 0;
    let rollbackSuccessCount = 0;
    let rollbackFailedCount = 0;
    let rollbackSkippedCount = 0;

    for (let index = 0; index < list.length; index++) {
      const credential = list[index];
      const refreshToken = credential.refreshToken?.trim() || '';
      const clientId = credential.clientId?.trim() || undefined;
      const clientSecret = credential.clientSecret?.trim() || undefined;
      const region = credential.region?.trim() || undefined;
      const machineId = credential.machineId?.trim() || undefined;
      const proxyUrl = credential.proxyUrl?.trim() || undefined;
      const authMethod = clientId && clientSecret ? 'idc' : 'social';

      setCurrentProcessing(`正在处理凭据 ${index + 1}/${list.length}`);
      setImportResults((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], status: 'checking' };
        return next;
      });

      if (!refreshToken) {
        failCount++;
        rollbackSkippedCount++;
        setImportResults((prev) => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            status: 'failed',
            error: 'refreshToken 不能为空',
            rollbackStatus: 'skipped',
          };
          return next;
        });
        setImportProgress({ current: index + 1, total: list.length });
        continue;
      }

      let addedCredentialId: number | undefined;

      try {
        const addResult = await credentialsApi.add({
          refreshToken,
          authMethod,
          clientId,
          clientSecret,
          region,
          machineId,
          proxyUrl,
        });
        addedCredentialId = addResult.credentialId;

        const balance = await credentialsApi.getBalance(addedCredentialId);

        successCount++;
        setImportResults((prev) => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            status: 'success',
            credentialId: addedCredentialId,
            usage: `${balance.currentUsage.toFixed(0)} / ${balance.usageLimit.toFixed(0)}`,
            email: credentials.find((item) => item.id === addedCredentialId)?.email,
          };
          return next;
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';

        if (errorMessage.includes('凭据已存在') || errorMessage.includes('refreshToken 重复')) {
          duplicateCount++;
          setImportResults((prev) => {
            const next = [...prev];
            next[index] = {
              ...next[index],
              status: 'duplicate',
              error: errorMessage,
            };
            return next;
          });
        } else {
          let rollbackStatus: ImportVerificationResult['rollbackStatus'] = 'skipped';
          let rollbackError: string | undefined;

          if (addedCredentialId) {
            const rollbackResult = await rollbackCredential(addedCredentialId);
            if (rollbackResult.success) {
              rollbackStatus = 'success';
              rollbackSuccessCount++;
            } else {
              rollbackStatus = 'failed';
              rollbackFailedCount++;
              rollbackError = rollbackResult.error;
            }
          } else {
            rollbackSkippedCount++;
          }

          failCount++;
          setImportResults((prev) => {
            const next = [...prev];
            next[index] = {
              ...next[index],
              status: 'failed',
              error: errorMessage,
              rollbackStatus,
              rollbackError,
            };
            return next;
          });
        }
      }

      setImportProgress({ current: index + 1, total: list.length });
    }

    setCurrentProcessing('');
    setImporting(false);

    return {
      successCount,
      duplicateCount,
      failCount,
      rollbackSuccessCount,
      rollbackFailedCount,
      rollbackSkippedCount,
    };
  }, [credentials, rollbackCredential]);

  return {
    importing,
    importProgress,
    currentProcessing,
    importResults,
    setImporting,
    resetImportState,
    getImportStatusText,
    validateImportList,
    runImportVerify,
  };
}

