/**
 * Middleware to restrict incoming HTTP request methods to standard ones (GET, POST, PUT, PATCH, DELETE).
 * This prevents the use of potentially insecure or arbitrary methods like TRACE, TRACK, or CONNECT,
 * which resolves Vulnerability #10.
 */
export function restrictHttpMethods(req, res, next) {
  const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
  const requestMethod = req.method.toUpperCase();

  // Check if the request method is in the allowed list
  if (allowedMethods.includes(requestMethod)) {
    // If 'OPTIONS' is included, it's often handled by CORS, so we let it pass to the CORS middleware/Express default.
    next();
  } else {
    // If an arbitrary or restricted method is used (like TRACE, TRACK, etc.), block it.
    res
      .status(405)
      .set("Allow", allowedMethods.join(", "))
      .json({
        message: `Method ${requestMethod} not allowed.`,
        allowed: allowedMethods.join(", "),
      });
  }
}
