import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  createAutoDraft,
  getAutoDraftDetail,
  getAutoDrafts,
  removeAutoDraft,
  updateAutoDraft,
} from "../controllers/autoDraftController.js";

const router = express.Router();
router.post("/auto-draft", authMiddleware, createAutoDraft);
router.put("/auto-draft/:id", authMiddleware, updateAutoDraft);
router.get("/auto-draft/:id", authMiddleware, getAutoDraftDetail);
router.get("/auto-drafts", authMiddleware, getAutoDrafts);
router.delete("/auto-drafts/:id", authMiddleware, removeAutoDraft);

export default router;
