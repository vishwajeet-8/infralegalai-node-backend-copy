import pool from "../../db.js"; // Assuming your database connection pool is available here

/**
 * Middleware to strictly check user roles against the database,
 * preventing reliance on potentially modified JWT payloads for authorization.
 * * @param {string[]} requiredRoles - An array of roles (e.g., ['Owner', 'Admin']) allowed to access the route.
 */
export const requireRole = (requiredRoles) => {
  return async (req, res, next) => {
    // req.user.sub (user ID) is trusted because the JWT signature was validated by authMiddleware.
    // req.user.role is UNTRUSTED (ignored).

    const userId = req.user.sub;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required." });
    }

    // 1. Fetch the actual role from the trusted source (the database)
    try {
      const result = await pool.query("SELECT role FROM users WHERE id = $1", [
        userId,
      ]);

      const dbUser = result.rows[0];

      if (!dbUser) {
        return res
          .status(401)
          .json({ message: "User not found or credentials revoked." });
      }

      const actualRole = dbUser.role;

      // 2. Perform the authorization check against the database role
      if (!requiredRoles.includes(actualRole)) {
        // Forbidden: Block the request if the actual database role is insufficient.
        return res
          .status(403)
          .json({ message: "Access denied. Insufficient privileges." });
      }

      // 3. Attach the TRULY verified role to the request (if needed downstream)
      req.user.verifiedRole = actualRole;

      next(); // Authorization successful
    } catch (err) {
      console.error("Authorization database error:", err);
      res
        .status(500)
        .json({ message: "Internal server error during authorization." });
    }
  };
};
