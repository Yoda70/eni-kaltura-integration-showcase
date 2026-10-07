export class ApplicationError extends Error {
  constructor(code, message, httpStatus = 500, details = undefined, retryable = false) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
    this.retryable = retryable;
  }
}

export function asApplicationError(error) {
  if (error instanceof ApplicationError) return error;
  return new ApplicationError(error?.code || 'INTERNAL_ERROR', error?.message || 'Unexpected error', error?.httpStatus || error?.http || 500, undefined, Boolean(error?.retryable));
}
