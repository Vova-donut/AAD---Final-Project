// Operational errors carry a safe public message and an HTTP status.
export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
// Express 5 handles rejected async routes; this mapper keeps error responses uniform.
export function errorHandler(logger) {
  return (error, req, res, _next) => {
    let status = error.status || 500;
    let message = error.message;
    let details;
    if (error.name === 'ZodError') {
      status = 400;
      message = 'Validation failed';
      details = error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    }
    if (error.code === 11000) {
      status = 409;
      message = 'Email is already registered';
    }
    if (error.type === 'entity.parse.failed') {
      status = 400;
      message = 'Invalid JSON';
    }
    if (status >= 500) {
      logger.error({ requestId: req.id, name: error.name, code: error.code }, 'Request failed');
      message = 'Service temporarily unavailable';
    }
    res
      .status(status)
      .json({ error: { message, ...(details ? { details } : {}), requestId: req.id } });
  };
}
