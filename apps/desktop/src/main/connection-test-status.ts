import type { ConnectionTestResult, UpdateConnectionInput } from '@maka/core';

export function connectionTestStatusPatch(
  result: ConnectionTestResult,
  now = new Date(),
): Pick<UpdateConnectionInput, 'lastTestStatus' | 'lastTestAt' | 'lastTestMessage'> {
  if (result.ok) {
    return {
      lastTestStatus: 'verified',
      lastTestAt: now.toISOString(),
      lastTestMessage: '连接已验证',
    };
  }

  if (result.errorClass === 'auth' || result.statusCode === 401 || result.statusCode === 403) {
    return {
      lastTestStatus: 'needs_reauth',
      lastTestAt: now.toISOString(),
      lastTestMessage: '鉴权失败',
    };
  }

  return {
    lastTestStatus: 'error',
    lastTestAt: now.toISOString(),
    lastTestMessage: generalizedConnectionErrorMessage(result),
  };
}

function generalizedConnectionErrorMessage(result: ConnectionTestResult): string {
  if (result.errorClass === 'timeout') return '请求超时';
  if (result.errorClass === 'provider_unavailable') return '模型服务返回错误';
  if (result.errorClass === 'network') return '网络错误';
  if (result.statusCode && result.statusCode >= 500) return '模型服务返回错误';
  return '连接测试失败';
}
