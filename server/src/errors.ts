// 服务端稳定错误码：所有失败响应都必须带其中之一，客户端据此做双语翻译。
// 新增错误码必须同时在 client/src/i18n.tsx 的 SERVER_ERRORS 中登记中文文案，
// tests/server.test.mjs 会校验两侧一致。

export const ERROR_CODES = [
  'NOT_FOUND',
  'UNKNOWN_TABLE',
  'NO_FIELDS',
  'BAD_REQUEST',
  'BACKUP_KEPT',
  'BACKUP_MISSING',
  'BACKUP_INVALID',
  'BACKUP_FAILED',
  'RESTORE_FAILED',
  'INTEGRITY_FAIL',
  'INVALID_ORIGIN',
  'IMPORT_INVALID',
  'IMPORT_NEWER_SCHEMA',
  'IMPORT_FAILED',
  'EXPORT_FAILED',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const KNOWN = new Set<string>(ERROR_CODES);

export interface CodedError extends Error {
  code?: string;
  detail?: string;
  status?: number;
}

/** 带稳定错误码的异常；status 默认为 400（可预期的业务错误） */
export function codedError(message: string, code: ErrorCode, detail?: string, status = 400): CodedError {
  const err = new Error(message) as CodedError;
  err.code = code;
  err.detail = detail;
  err.status = status;
  return err;
}

/** 把任意异常（含第三方中间件抛出的）归一为带稳定错误码的响应体 */
export function normalizeError(err: unknown): { status: number; code: ErrorCode; error: string; detail?: string } {
  const e = (err || {}) as CodedError & { type?: string; statusCode?: number };
  const message = e.message || '服务器内部错误';

  if (e.code && KNOWN.has(e.code)) {
    return { status: e.status || 400, code: e.code as ErrorCode, error: message, detail: e.detail };
  }
  if (e.type === 'entity.too.large') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', error: '请求内容过大', detail: message };
  }
  const httpStatus = Number(e.status || e.statusCode) || 500;
  if (httpStatus >= 400 && httpStatus < 500) {
    return { status: httpStatus, code: 'BAD_REQUEST', error: '请求无效', detail: message };
  }
  // 未登记的底层异常（如文件系统 ENOENT）统一归为内部错误，原始信息放入 detail 供排查
  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    error: '服务器内部错误',
    detail: e.code ? `${e.code}: ${message}` : message,
  };
}
