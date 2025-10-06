import express from "express";
import {
  createAdmin,
  deleteUser,
  getAllUsers,
  getUserDetailByEmail,
  getUserDetails,
  login,
  requestPasswordReset,
  resetPassword,
  updateUserProfile,
} from "../controllers/authController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import upload from "../config/multer.js";
import { requireRole } from "../middleware/authorize.js";

const router = express.Router();

router.post("/create-admin", createAdmin);
router.post("/login", login);
router.post("/request-reset-password", requestPasswordReset);
router.post("/reset-password", resetPassword);

// 🔒 SECURE FIX: Now requires the database role to be 'Owner'
router.get("/users", authMiddleware, requireRole(["Owner"]), getAllUsers);

router.get("/user", authMiddleware, getUserDetails);
router.get("/user/detail", getUserDetailByEmail);
router.patch(
  "/user/profile",
  authMiddleware,
  upload.single("profile_picture"),
  updateUserProfile
);

// 🔒 SECURE FIX: The internal logic in deleteUser now verifies the requester's role against the DB.
router.delete("/users/:userId", authMiddleware, deleteUser);

export default router;
