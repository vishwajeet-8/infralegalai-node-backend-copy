import express from "express";
import {
  deleteRoadmap,
  getAllRoadmap,
  postRoadmap,
  updateRoadmap,
} from "../controllers/roadmapController.js";

const router = express.Router();

router.get("/roadmaps", getAllRoadmap);
router.post("/roadmaps", postRoadmap);
router.patch("/roadmaps/:id", updateRoadmap);
router.delete("/roadmaps/:id", deleteRoadmap);

export default router;
