// import jws from "jws";
// import dotenv from "dotenv";
// dotenv.config();

// const secret = process.env.JWT_SECRET; // keep this strong & private
// const twentyFourHour = 60 * 60 * 24; // seconds

// export function signAccessToken({ sub, email, role, workspaceId }) {
//   const now = Math.floor(Date.now() / 1000);

//   return jws.sign({
//     header: { alg: "HS256", typ: "JWT" },
//     payload: {
//       sub, // subject = user id
//       email,
//       role, // 'Owner'
//       workspaceId,
//       iat: now, // issued‑at
//       exp: now + twentyFourHour,
//     },
//     secret,
//   });
// }

// export function verifyToken(token) {
//   try {
//     /* 1️⃣  Verify signature */
//     const isValid = jws.verify(token, "HS256", secret);
//     if (!isValid) return null;

//     /* 2️⃣  Decode payload */
//     const { payload } = jws.decode(token);
//     // console.log(payload);
//     // payload is a plain JSON string → parse it
//     // const data = JSON.parse(payload);

//     /* 3️⃣  Check expiration */
//     const now = Math.floor(Date.now() / 1000);
//     if (payload.exp && now >= payload.exp) return null; // token expired

//     return payload; // { sub, role, workspaceId, iat, exp }
//   } catch (err) {
//     return null; // malformed token
//   }
// }

// import jws from "jws";
// import dotenv from "dotenv";
// dotenv.config();

// const secret = process.env.JWT_SECRET; // keep this strong & private

// // --- FIX FOR VULNERABILITY #5 ---
// // 1. Absolute Timeout (The maximum life of the token, regardless of activity)
// const twentyFourHour = 60 * 60 * 24; // 24 hours (Used for the 'exp' claim)

// // 2. Inactivity Timeout (The maximum time allowed between user actions)
// // Setting this to 15 minutes (900 seconds) dramatically reduces the time
// // a local adversary can hijack a session.
// const ACTIVITY_TIMEOUT_SECONDS = 60 * 2; // 15 minutes

// // --- END FIX ---

// /**
//  * Signs a new access token, including the 'lastActivity' timestamp.
//  * This function is called during login and token refresh.
//  */
// export function signAccessToken({ sub, email, role, workspaceId }) {
//   const now = Math.floor(Date.now() / 1000);

//   return jws.sign({
//     header: { alg: "HS256", typ: "JWT" },
//     payload: {
//       sub, // subject = user id
//       email,
//       role, // 'Owner'
//       workspaceId,
//       iat: now, // issued-at
//       exp: now + twentyFourHour, // Absolute expiration (24 hours)
//       lastActivity: now, // NEW: Timestamp of last activity (for inactivity check)
//     },
//     secret,
//   });
// }

// /**
//  * Verifies the token's signature, expiration, AND inactivity.
//  */
// export function verifyToken(token) {
//   try {
//     /* 1. Verify signature */
//     const isValid = jws.verify(token, "HS256", secret);
//     if (!isValid) return null;

//     /* 2. Decode payload */
//     const { payload } = jws.decode(token);
//     const parsedPayload = JSON.parse(payload); // Payload needs parsing

//     /* 3. Check ABSOLUTE expiration (exp) */
//     const now = Math.floor(Date.now() / 1000);
//     if (parsedPayload.exp && now >= parsedPayload.exp) {
//       console.log("Token expired (absolute timeout).");
//       return null;
//     }

//     // --- FIX IMPLEMENTATION: Check INACTIVITY (lastActivity) ---
//     const lastActivityTime = parsedPayload.lastActivity;

//     // Check if the token has the lastActivity claim and if the time since then
//     // exceeds the allowed limit (15 minutes).
//     if (
//       lastActivityTime &&
//       now >= lastActivityTime + ACTIVITY_TIMEOUT_SECONDS
//     ) {
//       console.log(
//         `Token expired (inactivity timeout: > ${ACTIVITY_TIMEOUT_SECONDS}s).`
//       );
//       return null; // Token failed the inactivity check
//     }
//     // --- END FIX IMPLEMENTATION ---

//     return parsedPayload; // { sub, role, workspaceId, iat, exp, lastActivity }
//   } catch (err) {
//     console.error("Error verifying token:", err.message);
//     return null; // malformed token
//   }
// }

import jws from "jws";
import dotenv from "dotenv";
dotenv.config();

const secret = process.env.JWT_SECRET; // keep this strong & private

// --- FIX FOR VULNERABILITY #5 ---
// 1. Absolute Timeout (The maximum life of the token, regardless of activity)
const twentyFourHour = 60 * 60 * 24; // 24 hours (Used for the 'exp' claim)

// 2. Inactivity Timeout (The maximum time allowed between user actions)
// Setting this to 15 minutes (900 seconds) dramatically reduces the time
// a local adversary can hijack a session.
const ACTIVITY_TIMEOUT_SECONDS = 60 * 15; // 15 minutes

// --- END FIX ---

/**
 * Signs a new access token, including the 'lastActivity' timestamp.
 * This function is called during login and token refresh.
 */
export function signAccessToken({ sub, email, role, workspaceId }) {
  const now = Math.floor(Date.now() / 1000);

  return jws.sign({
    header: { alg: "HS256", typ: "JWT" },
    payload: {
      sub, // subject = user id
      email,
      role, // 'Owner'
      workspaceId,
      iat: now, // issued-at
      exp: now + twentyFourHour, // Absolute expiration (24 hours)
      lastActivity: now, // NEW: Timestamp of last activity (for inactivity check)
    },
    secret,
  });
}

/**
 * Verifies the token's signature, expiration, AND inactivity.
 */
export function verifyToken(token) {
  try {
    /* 1. Verify signature */
    const isValid = jws.verify(token, "HS256", secret);
    if (!isValid) return null;

    /* 2. Decode payload */
    const { payload } = jws.decode(token);

    let parsedPayload;

    // --- FIX: Safely parse the payload ---
    if (typeof payload === "string") {
      // The payload is a string, attempt to parse it (this handles valid JSON strings)
      parsedPayload = JSON.parse(payload);
    } else if (typeof payload === "object" && payload !== null) {
      // The payload is already a JavaScript object (this is often the case)
      parsedPayload = payload;
    } else {
      // Unexpected payload type
      console.error("Token payload is neither a string nor an object.");
      return null;
    }
    // --- END FIX ---

    /* 3. Check ABSOLUTE expiration (exp) */
    const now = Math.floor(Date.now() / 1000);
    if (parsedPayload.exp && now >= parsedPayload.exp) {
      console.log("Token expired (absolute timeout).");
      return null;
    }

    // --- FIX IMPLEMENTATION: Check INACTIVITY (lastActivity) ---
    const lastActivityTime = parsedPayload.lastActivity;

    // Check if the token has the lastActivity claim and if the time since then
    // exceeds the allowed limit (15 minutes).
    if (
      lastActivityTime &&
      now >= lastActivityTime + ACTIVITY_TIMEOUT_SECONDS
    ) {
      console.log(
        `Token expired (inactivity timeout: > ${ACTIVITY_TIMEOUT_SECONDS}s).`
      );
      return null; // Token failed the inactivity check
    }
    // --- END FIX IMPLEMENTATION ---

    return parsedPayload; // { sub, role, workspaceId, iat, exp, lastActivity }
  } catch (err) {
    // This will now catch the JSON.parse error if the string is malformed
    console.error(
      "Error verifying token: Payload parsing failed.",
      err.message
    );
    return null; // malformed token
  }
}
