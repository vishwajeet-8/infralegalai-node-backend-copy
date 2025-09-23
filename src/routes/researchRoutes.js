import express from "express";
import {
  followCase,
  getFollowedCases,
  getFollowedCasesByCourt,
  unfollowCase,
  setCronInterval,
  getCronInterval,
  stopCron,
} from "../controllers/researchController.js";

const router = express.Router();

router.get("/get-followed-cases", getFollowedCases);
router.get("/get-followed-cases-by-court", getFollowedCasesByCourt);
router.post("/follow-case", followCase);
router.delete("/unfollow-case", unfollowCase);
router.post("/set-cron-interval", setCronInterval);
router.get("/get-cron-interval", getCronInterval);
router.delete("/stop-cron", stopCron);


export default router;