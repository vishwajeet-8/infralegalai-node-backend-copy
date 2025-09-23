import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  addExtractionCredit,
  addResearchCredit,
  updateExactionCredit,
  updateResearchCredit,
} from "../controllers/creditController.js";
const router = express.Router();

router.post("/research-credit", authMiddleware, updateResearchCredit);
router.post("/extraction-credit", authMiddleware, updateExactionCredit);
router.post("/add/extraction-credit", addExtractionCredit);
router.post("/add/research-credit", addResearchCredit);

export default router;
