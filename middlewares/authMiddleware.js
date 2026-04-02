import jwt from "jsonwebtoken";

const authMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : authHeader;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.role = decoded.role;
    next();
  } catch (error) {
    console.log(error);

    res.status(401).json({ msg: "Invalid token" });
  }
};

const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (authHeader) {
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : authHeader;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded; // agar token valid hai to req.user set karo
    } catch (error) {
      console.log("Optional auth token invalid:", error.message);
    }
  }
  next();
};

export { authMiddleware, optionalAuthMiddleware };