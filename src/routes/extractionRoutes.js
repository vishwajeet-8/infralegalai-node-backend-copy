import express from "express";
import {
  extractedDataById,
  extractedDataByWorkspace,
  saveExtraction,
} from "../controllers/extractionController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/save-extraction",authMiddleware, saveExtraction);
router.get("/extracted-data-workspace/:workspaceId", extractedDataByWorkspace);
router.get("/extracted-data-id/:id", extractedDataById);

export default router;
