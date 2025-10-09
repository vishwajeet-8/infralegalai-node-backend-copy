// import { verifyToken } from "../utils/jwt.js";

// export function authMiddleware(req, res, next) {
//   const authHeader = req.headers.authorization;

//   if (!authHeader || !authHeader.startsWith("Bearer ")) {
//     return res.status(401).json({ message: "No token provided" });
//   }

//   const token = authHeader.split(" ")[1];
//   // console.log(token);

//   const user = verifyToken(token);
//   // console.log(user);

//   if (!user) {
//     return res.status(401).json({ message: "Invalid or expired token" });
//   }

//   req.user = user; // contains: sub, role, workspaceId
//   next();
// }

import { verifyToken, signAccessToken } from "../utils/jwt.js"; // Note: changed to jwt_management.js based on your file name

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  // The verifyToken function handles signature, absolute expiration, and inactivity check.
  const payload = verifyToken(token);

  if (!payload) {
    // If verifyToken fails, it's either invalid or expired (by inactivity or absolute time).
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  // --- FIX IMPLEMENTATION: TOKEN REFRESH ---

  // 1. Create a NEW token using the existing, valid payload.
  // This automatically resets the 'lastActivity' timestamp to 'now'.
  const newToken = signAccessToken(payload);

  // 2. Send the new token back to the client in a custom header.
  // The client's Axios interceptor will read this header and save the new token.
  res.setHeader("X-New-Token", newToken);

  // --- END FIX IMPLEMENTATION ---

  req.user = payload; // contains: sub, role, workspaceId, iat, exp, lastActivity
  next();
}
