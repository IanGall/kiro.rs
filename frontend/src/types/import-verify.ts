// 导入验活结果类型定义

export type ImportStatus = 'pending' | 'checking' | 'success' | 'duplicate' | 'failed';

export interface ImportVerificationResult {
  index: number;
  status: ImportStatus;
  error?: string;
  usage?: string;
  email?: string;
  credentialId?: number;
  rollbackStatus?: 'success' | 'failed' | 'skipped';
  rollbackError?: string;
}

export interface ImportProgress {
  current: number;
  total: number;
}

