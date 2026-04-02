const errorMiddleware = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    return res.status(statusCode).json({
        status: false,
        message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        errors: err.errors || [],
    })
}
export default errorMiddleware;