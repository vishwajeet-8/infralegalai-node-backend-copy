// import express from "express";
// import { authMiddleware } from "../middleware/authMiddleware.js";
// import {
//   createFolder,
//   deleteItem, // Updated from deleteFile
//   geminiFileUri,
//   getSignedUrlForFile,
//   listFiles,
//   uploadDocument,
//   userGuide,
// } from "../controllers/documentController.js";
// import multer from "multer";

// const router = express.Router();

// const upload = multer({ storage: multer.memoryStorage() });
// router.post(
//   "/upload-documents",
//   authMiddleware,
//   upload.array("files"),
//   uploadDocument
// );
// router.post("/create-folder", authMiddleware, createFolder);
// router.get("/list-documents/:workspaceId", listFiles);
// router.delete("/delete-item/:itemId", authMiddleware, deleteItem); // Updated route
// router.get("/get-signed-url", authMiddleware, getSignedUrlForFile);
// router.post("/gemini-uri", upload.array("files"), geminiFileUri);
// router.get("/user-Guide", userGuide);

// export default router;

// import express from "express";
// import { authMiddleware } from "../middleware/authMiddleware.js";
// import {
//   createFolder,
//   deleteItem, // Updated from deleteFile
//   geminiFileUri,
//   getSignedUrlForFile,
//   listFiles,
//   uploadDocument,
//   userGuide,
// } from "../controllers/documentController.js";
// import multer from "multer";
// // import { stripExifData } from "../middleware/imageProcessor.js"; // V#7 fix import
// import { apiRateLimiter } from "../middleware/rateLimiter.js"; // V#8/V#3 fix import

// const router = express.Router();

// const upload = multer({ storage: multer.memoryStorage() });
// router.post(
//   "/upload-documents",
//   authMiddleware,
//   upload.array("files"),
//   // stripExifData, // V#7 fix applied
//   apiRateLimiter, // <-- FIXED V#8 (DoS protection)
//   uploadDocument
// );
// router.post("/create-folder", authMiddleware, apiRateLimiter, createFolder); // <-- FIXED V#8
// router.get("/list-documents/:workspaceId", apiRateLimiter, listFiles); // <-- FIXED V#8 (Scraping protection)
// router.delete("/delete-item/:itemId", authMiddleware, deleteItem); // Updated route
// router.get("/get-signed-url", authMiddleware, getSignedUrlForFile);
// router.post("/gemini-uri", upload.array("files"), geminiFileUri);
// router.get("/user-Guide", userGuide);

// export default router;

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
import { apiRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// V#9 FIX: Define allowed file types and max size to prevent RCE and DoS.
const MAX_FILE_SIZE = 20 * 1024 * 1024; // Limit file size to 20 MB

const fileFilter = (req, file, cb) => {
  // Define a strict list of allowed MIME types
  const allowedMimeTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "text/plain",
    "text/csv",
    "image/jpeg",
    "image/png",
    "image/gif",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    // Accept file
    cb(null, true);
  } else {
    // Reject file and send an error
    // Note: The Multer error handling should be done in the final route handler (uploadDocument)
    cb(
      new Error(
        "File type not allowed. Only PDF, DOCX, XLSX, TXT, CSV, and common images are permitted."
      ),
      false
    );
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }, // <-- V#9 Fix: Limit file size
  fileFilter: fileFilter, // <-- V#9 Fix: Enforce allowed MIME types
});

router.post(
  "/upload-documents",
  authMiddleware,
  upload.array("files"),
  apiRateLimiter, // V#8 fix: Rate limit uploads
  uploadDocument
);
router.post("/create-folder", authMiddleware, apiRateLimiter, createFolder);
router.get("/list-documents/:workspaceId", apiRateLimiter, listFiles);
router.delete("/delete-item/:itemId", authMiddleware, deleteItem); // Updated route
router.get("/get-signed-url", authMiddleware, getSignedUrlForFile);
router.post("/gemini-uri", upload.array("files"), geminiFileUri);
router.get("/user-Guide", userGuide);

export default router;
