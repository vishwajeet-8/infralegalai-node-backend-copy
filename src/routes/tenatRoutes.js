import express from "express";
import {
  addTenatUser,
  validateTenatUser,
} from "../controllers/tenatController.js";
const router = express.Router();

router.post("/add-tenat", addTenatUser);
router.post("/validate-tenat", validateTenatUser);

export default router;
