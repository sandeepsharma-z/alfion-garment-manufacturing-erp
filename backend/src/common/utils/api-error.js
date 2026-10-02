/** Operational error with HTTP status — thrown by services, shaped by error-handler. */
class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'ERROR';
    this.isOperational = true;
  }
  static badRequest(msg, code) { return new ApiError(400, msg, code || 'BAD_REQUEST'); }
  static unauthorized(msg) { return new ApiError(401, msg || 'Authentication required', 'UNAUTHORIZED'); }
  static forbidden(msg) { return new ApiError(403, msg || 'You do not have access to this resource', 'FORBIDDEN'); }
  static notFound(msg) { return new ApiError(404, msg || 'Not found', 'NOT_FOUND'); }
  static conflict(msg) { return new ApiError(409, msg, 'CONFLICT'); }
}
module.exports = ApiError;
