// class ApiError extends Error {
//   constructor(statusCode, message, errors = [], stack = "") {
//     super(message);
//     this.statusCode = statusCode;
//     this.message = message;
//     this.errors = errors;

//     if (stack) {
//       this.stack = stack;
//     } else {
//       Error.captureStackTrace(this, this.constructor);
//     }
//   }
// }

// class ApiResponse {
//   constructor(statusCode, messaage, data = null) {
//     this.statusCode = statusCode;
//     this.message = messaage;
//     this.data = data;
//   }
// }

// const asyncHandler = (fn) => (req, res, next) => {
//   Promise.resolve(fn(req, res, next)).catch(next);
// };

// export { ApiError, ApiResponse, asyncHandler };

class ApiError extends Error {
  constructor(statusCode, message, errors = [], stack = "") {
    super(message);
    this.statusCode = statusCode;
    this.message = message;
    this.errors = errors;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

class ApiResponse {
  constructor(statusCode, message, data = null) {
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }
}

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
}
