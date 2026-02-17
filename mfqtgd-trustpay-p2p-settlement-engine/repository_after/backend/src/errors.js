class AppError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} status
   * @param {any} details
   */
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function errorResponse(err) {
  const isApp = err && err.name === "AppError";
  const status = isApp ? err.status : 500;
  const code = isApp ? err.code : "INTERNAL_ERROR";
  const message = isApp ? err.message : "Unexpected server error";
  const details = isApp ? err.details : undefined;

  return {
    status,
    body: {
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
  };
}

module.exports = { AppError, errorResponse };

