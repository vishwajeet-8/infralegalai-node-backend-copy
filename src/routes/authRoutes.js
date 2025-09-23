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

const router = express.Router();

router.post("/create-admin", createAdmin);
router.post("/login", login);
router.post("/request-reset-password", requestPasswordReset);
router.post("/reset-password", resetPassword);
router.get("/users", authMiddleware, getAllUsers);
router.get("/user", authMiddleware, getUserDetails);
router.get("/user/detail", getUserDetailByEmail);
router.patch(
  "/user/profile",
  authMiddleware,
  upload.single("profile_picture"),
  updateUserProfile
);
router.delete("/users/:userId", authMiddleware, deleteUser);

export default router;

// import express from "express";
// import {
//   createAdmin,
//   deleteUser,
//   getAllUsers,
//   getInvitedMembers,
//   getUserDetails,
//   login,
//   requestPasswordReset,
//   resetPassword,
//   updateUserProfile,
// } from "../controllers/authController.js";
// import { authMiddleware } from "../middleware/authMiddleware.js";
// import upload from "../config/multer.js";

// const router = express.Router();

// router.post("/create-admin", createAdmin);
// router.post("/login", login);
// router.post("/request-reset-password", requestPasswordReset);
// router.post("/reset-password", resetPassword);
// router.get("/users", authMiddleware, getAllUsers);
// router.get("/invited-members", authMiddleware, getInvitedMembers);
// router.get("/user", authMiddleware, getUserDetails);
// router.patch(
//   "/user/profile",
//   authMiddleware,
//   upload.single("profile_picture"),
//   updateUserProfile
// );
// router.delete("/users/:userId", authMiddleware, deleteUser);

// export default router;
