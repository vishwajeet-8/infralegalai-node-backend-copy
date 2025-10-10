import rateLimit from "express-rate-limit";

/**
 * Global API Rate Limiter
 * Applied to all authenticated endpoints and general scraping targets (e.g., listing documents).
 * Allows 100 requests per user (identified by IP) every 15 minutes.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    status: 429,
    message: "Too many requests, please try again after 15 minutes.",
  },
  standardHeaders: true, // Return rate limit info in the headers
  legacyHeaders: false, // Disable the X-Rate-Limit-* headers
});

/**
 * Strict Login/Auth Rate Limiter
 * Applied to unauthenticated, high-risk endpoints like /login and /request-reset-password.
 * Allows only 5 attempts per user (identified by IP) every 1 minute.
 * This directly mitigates Brute Force attacks (Vulnerability #3).
 */
export const loginRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 login/reset requests per minute
  message: {
    status: 429,
    message: "Too many failed attempts. Please try again after 1 minute.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
