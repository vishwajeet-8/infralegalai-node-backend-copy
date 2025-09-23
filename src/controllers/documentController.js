import dotenv from "dotenv";
dotenv.config();
import s3 from "../config/s3.js";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import pool from "../../db.js";
import { v4 as uuidv4 } from "uuid";
import { convertFileBuffer } from "../utils/convertFileBuffer.js";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { GoogleGenAI } = require("@google/genai");

const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Helper: Write buffer to temp file
async function writeTempFile(converted) {
  const tmpPath = path.join(os.tmpdir(), `${uuidv4()}_${converted.filename}`);
  await fs.writeFile(tmpPath, converted.data);
  return tmpPath;
}

export const uploadDocument = async (req, res) => {
  const files = req.files;
  const { workspaceId, folderId } = req.body;
  const uploadedBy = req.user.sub;

  if (!files || files.length === 0 || !workspaceId) {
    return res
      .status(400)
      .json({ message: "Files and workspaceId are required" });
  }

  try {
    for (const file of files) {
      const converted = await convertFileBuffer(file);
      const tmpPath = await writeTempFile(converted);

      const geminiFile = await genAI.files.upload({
        file: tmpPath,
        config: { mimeType: converted.mimeType },
      });

      let state = geminiFile.state.name;
      while (state === "PROCESSING") {
        await new Promise((r) => setTimeout(r, 1000));
        const updated = await genAI.files.get({ name: geminiFile.name });
        state = updated.state.name;
      }

      const convertedKey = `workspace_${workspaceId}/converted/${uuidv4()}_${
        converted.filename
      }`;
      const convertedCommand = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: convertedKey,
        Body: converted.data,
        ContentType: converted.mimeType,
      });
      await s3.send(convertedCommand);

      const originalKey = `workspace_${workspaceId}/original/${uuidv4()}_${
        file.originalname
      }`;
      const originalCommand = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: originalKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      });
      await s3.send(originalCommand);

      await pool.query(
        `INSERT INTO documents (
          workspace_id, uploaded_by, filename, s3_key_converted, s3_key_original, gemini_uri, parent_folder_id, type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          workspaceId,
          uploadedBy,
          file.originalname,
          convertedKey,
          originalKey,
          geminiFile.name,
          folderId || null,
          "file",
        ]
      );

      await fs.remove(tmpPath);
    }

    return res.status(200).json({ message: "Upload & Gemini sync successful" });
  } catch (err) {
    console.error("Upload Error:", err);
    return res.status(500).json({ message: "Upload failed" });
  }
};

export const createFolder = async (req, res) => {
  const { workspaceId, folderName, parentFolderId } = req.body;
  const uploadedBy = req.user.sub;

  if (!workspaceId || !folderName) {
    return res
      .status(400)
      .json({ message: "Workspace ID and folder name are required" });
  }

  try {
    await pool.query(
      `INSERT INTO documents (workspace_id, uploaded_by, filename, type, parent_folder_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [workspaceId, uploadedBy, folderName, "folder", parentFolderId || null]
    );

    return res.status(201).json({ message: "Folder created successfully" });
  } catch (err) {
    console.error("Create Folder Error:", err);
    return res.status(500).json({ message: "Failed to create folder" });
  }
};

export async function listFiles(req, res) {
  const { workspaceId } = req.params;
  const { folderId } = req.query;

  try {
    const result = await pool.query(
      `SELECT id, filename, s3_key_original, s3_key_converted, created_at, type, parent_folder_id
       FROM documents
       WHERE workspace_id = $1 AND (parent_folder_id = $2 OR ($2 IS NULL AND parent_folder_id IS NULL))
       ORDER BY type DESC, created_at DESC`,
      [workspaceId, folderId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching items:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function deleteItem(req, res) {
  const { itemId } = req.params;

  try {
    // Fetch the item to determine its type and related data
    const { rows: itemRows } = await pool.query(
      `SELECT id, type, s3_key_original, s3_key_converted, parent_folder_id
       FROM documents
       WHERE id = $1`,
      [itemId]
    );

    if (!itemRows.length) {
      return res.status(404).json({ message: "Item not found" });
    }

    const item = itemRows[0];

    // Recursively delete folder contents if it's a folder
    if (item.type === "folder") {
      const deleteFolderContents = async (folderId) => {
        const { rows: children } = await pool.query(
          `SELECT id, type, s3_key_original, s3_key_converted
           FROM documents
           WHERE parent_folder_id = $1`,
          [folderId]
        );

        for (const child of children) {
          if (child.type === "folder") {
            await deleteFolderContents(child.id); // Recursive call for subfolders
          } else if (child.type === "file") {
            const deleteCommands = [];
            if (child.s3_key_original) {
              deleteCommands.push(
                s3.send(
                  new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: child.s3_key_original,
                  })
                )
              );
            }
            if (child.s3_key_converted) {
              deleteCommands.push(
                s3.send(
                  new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: child.s3_key_converted,
                  })
                )
              );
            }
            await Promise.all(deleteCommands);
          }
          await pool.query(`DELETE FROM documents WHERE id = $1`, [child.id]);
        }
      };

      await deleteFolderContents(itemId);
    } else if (item.type === "file") {
      const deleteCommands = [];
      if (item.s3_key_original) {
        deleteCommands.push(
          s3.send(
            new DeleteObjectCommand({
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: item.s3_key_original,
            })
          )
        );
      }
      if (item.s3_key_converted) {
        deleteCommands.push(
          s3.send(
            new DeleteObjectCommand({
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: item.s3_key_converted,
            })
          )
        );
      }
      await Promise.all(deleteCommands);
    }

    // Delete the item itself
    await pool.query(`DELETE FROM documents WHERE id = $1`, [itemId]);

    res.json({
      message: `${
        item.type === "folder" ? "Folder" : "File"
      } deleted successfully`,
    });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export const getSignedUrlForFile = async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) {
      return res
        .status(400)
        .json({ message: "S3 key query parameter is required" });
    }

    const decodedKey = decodeURIComponent(key);
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: decodedKey,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.json({ url });
  } catch (err) {
    console.error("Error generating signed URL:", err);
    res
      .status(500)
      .json({ message: "Error generating download URL", error: err.message });
  }
};

// export const geminiFileUri = async (req, res) => {
//   const files = req.files;

//   if (!files || files.length === 0) {
//     return res.status(400).json({ message: "Files are required" });
//   }

//   if (files.length > 2) {
//     return res.status(400).json({ message: "Maximum of 2 files allowed" });
//   }

//   try {
//     const geminiUris = await Promise.all(
//       files.map(async (file) => {
//         const converted = await convertFileBuffer(file);
//         const tmpPath = await writeTempFile(converted);
//         const geminiFile = await genAI.files.upload({
//           file: tmpPath,
//           config: { mimeType: converted.mimeType },
//         });

//         let state = geminiFile.state.name;
//         while (state === "PROCESSING") {
//           await new Promise((r) => setTimeout(r, 1000));
//           const updated = await genAI.files.get({ name: geminiFile.name });
//           state = updated.state.name;
//         }

//         await fs.remove(tmpPath);

//         return {
//           filename: converted.filename,
//           uri: geminiFile.name,
//           mimeType: converted.mimeType,
//         };
//       })
//     );

//     return res.status(200).json({
//       message: "Files processed and uploaded to Gemini successfully",
//       files: geminiUris,
//     });
//   } catch (error) {
//     console.error("Upload Error:", error);
//     return res
//       .status(500)
//       .json({ message: "Upload failed", error: error.message });
//   }
// };

export const geminiFileUri = async (req, res) => {
  const files = req.files;

  if (!files || files.length === 0) {
    return res.status(400).json({ message: "Files are required" });
  }

  if (files.length > 2) {
    return res.status(400).json({ message: "Maximum of 2 files allowed" });
  }

  try {
    const geminiUris = await Promise.all(
      files.map(async (file) => {
        try {
          // For large DOCX files, consider uploading the original file directly
          // instead of converting to markdown first
          const ext = path.extname(file.originalname).toLowerCase();

          if (ext === ".docx" && file.buffer.length > 5 * 1024 * 1024) {
            // >5MB
            // For large DOCX files, upload the original file
            const tmpPath = path.join(os.tmpdir(), file.originalname);
            await fs.writeFile(tmpPath, file.buffer);

            const geminiFile = await genAI.files.upload({
              file: tmpPath,
              config: {
                mimeType:
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              },
            });

            await fs.remove(tmpPath);

            return {
              filename: file.originalname,
              uri: geminiFile.name,
              mimeType:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            };
          } else {
            // For smaller files or non-DOCX files, use the normal conversion
            const converted = await convertFileBuffer(file);
            const tmpPath = await writeTempFile(converted);
            const geminiFile = await genAI.files.upload({
              file: tmpPath,
              config: { mimeType: converted.mimeType },
            });

            await fs.remove(tmpPath);

            return {
              filename: converted.filename,
              uri: geminiFile.name,
              mimeType: converted.mimeType,
            };
          }
        } catch (fileError) {
          console.error(
            `Error processing file ${file.originalname}:`,
            fileError
          );
          throw fileError;
        }
      })
    );

    return res.status(200).json({
      message: "Files processed and uploaded to Gemini successfully",
      files: geminiUris,
    });
  } catch (error) {
    console.error("Upload Error:", error);
    return res.status(500).json({
      message: "Upload failed",
      error: error.message,
    });
  }
};

export const userGuide = async (req, res) => {
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: "User Guide - InfraLegal AI.pdf",
    });

    const { Body, ContentType } = await s3.send(command);

    res.set({
      "Content-Type": ContentType || "application/pdf",
      "Content-Disposition":
        'attachment; filename="User-Guide-InfraLegal-AI.pdf"',
    });

    Body.pipe(res);
  } catch (err) {
    console.error("Failed to fetch PDF from S3:", err);
    res.status(500).json({ error: "Failed to download user guide" });
  }
};
