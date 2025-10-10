import sharp from "sharp";

/**
 * Strips all EXIF, GPS, and other metadata from uploaded image files.
 * This middleware is crucial for fixing Vulnerability #7 (EXIF Geo-location Data Not Stripped).
 * * It must be placed AFTER the multer middleware (which provides file.buffer)
 * but BEFORE the controller that saves the file (e.g., updateUserProfile or uploadDocument).
 * * @param {object} req - Express request object, expects req.file or req.files
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
export async function stripExifData(req, res, next) {
  try {
    const filesToProcess = [];

    // Check for single file (req.file) or array of files (req.files)
    if (req.file) {
      filesToProcess.push(req.file);
    } else if (req.files && Array.isArray(req.files)) {
      filesToProcess.push(...req.files);
    }

    // If no files are present, skip processing
    if (filesToProcess.length === 0) {
      return next();
    }

    // Process all files found
    for (let file of filesToProcess) {
      // Ensure we only process images and that buffer data exists (requires multer.memoryStorage)
      if (file.mimetype.startsWith("image/") && file.buffer) {
        // Use sharp to process the buffer.
        // .withMetadata({}) strips all existing metadata (EXIF, GPS, camera data, etc.).
        const strippedBuffer = await sharp(file.buffer)
          .withMetadata({})
          .toBuffer();

        // Overwrite the original file buffer with the new, clean buffer.
        file.buffer = strippedBuffer;
        console.log(
          `Successfully stripped EXIF data from: ${file.originalname}`
        );
      }
    }

    next();
  } catch (error) {
    console.error("Error stripping EXIF data:", error);
    // Continue processing the request to avoid blocking the user, but log the error.
    next();
  }
}
