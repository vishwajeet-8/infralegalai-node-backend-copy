// import express from "express";
// import { authMiddleware } from "../middleware/authMiddleware.js";
// import {
//   createWorkspace,
//   deleteWorkspace,
//   getSeatUsage,
//   listUserWorkspaces,
// } from "../controllers/workspaceController.js";

// const router = express.Router();

// router.get("/seat-usage", authMiddleware, getSeatUsage);
// router.post("/workspaces", authMiddleware, createWorkspace);
// router.get("/get-workspaces", authMiddleware, listUserWorkspaces);
// router.delete("/workspace/:workspaceId", authMiddleware, deleteWorkspace);

// export default router;

import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  createWorkspace,
  deleteWorkspace,
  getSeatUsage,
  listUserWorkspaces,
} from "../controllers/workspaceController.js";
import { apiRateLimiter } from "../middleware/rateLimiter.js"; // V#8/V#3 fix import

const router = express.Router();

router.get("/seat-usage", authMiddleware, getSeatUsage);
router.post("/workspaces", authMiddleware, apiRateLimiter, createWorkspace); // <-- FIXED V#8: Rate limit workspace creation
router.get(
  "/get-workspaces",
  authMiddleware,
  apiRateLimiter,
  listUserWorkspaces
); // <-- FIXED V#8: Rate limit workspace listing (scraping protection)
router.delete("/workspace/:workspaceId", authMiddleware, deleteWorkspace);

export default router;
