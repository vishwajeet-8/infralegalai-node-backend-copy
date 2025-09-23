import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  createFolder,
  deleteItem, // Updated from deleteFile
  geminiFileUri,
  getSignedUrlForFile,
  listFiles,
  uploadDocument,
  userGuide,
} from "../controllers/documentController.js";
import multer from "multer";

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });
router.post(
  "/upload-documents",
  authMiddleware,
  upload.array("files"),
  uploadDocument
);
router.post("/create-folder", authMiddleware, createFolder);
router.get("/list-documents/:workspaceId", listFiles);
router.delete("/delete-item/:itemId", authMiddleware, deleteItem); // Updated route
router.get("/get-signed-url", authMiddleware, getSignedUrlForFile);
router.post("/gemini-uri", upload.array("files"), geminiFileUri);
router.get("/user-Guide", userGuide);

export default router;
