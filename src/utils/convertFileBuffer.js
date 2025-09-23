
import { exec } from "child_process";
import mime from "mime-types";
import path from "path";
import { promisify } from "util";
import fs from "fs";

const execAsync = promisify(exec);

// Convert .docx → .md, remove images and their descriptions
export async function convertFileBuffer(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const baseName = path.basename(file.originalname, ext);

  // For non-DOCX files, return immediately without processing
  if (![".docx", ".txt", ".md", ".pdf"].includes(ext)) {
    return {
      data: file.buffer,
      filename: file.originalname,
      mimeType: "application/octet-stream",
    };
  }

  // For non-DOCX files that we want to preserve
  if ([".txt", ".md", ".pdf"].includes(ext)) {
    const mimeType = mime.lookup(ext) || "application/octet-stream";
    return {
      data: file.buffer,
      filename: file.originalname,
      mimeType,
    };
  }

  // For DOCX files - optimized conversion
  if (ext === ".docx") {
    const tempInput = `${baseName}-${Date.now()}.docx`;
    const tempOutput = `${baseName}-${Date.now()}.md`;

    try {
      // Write input buffer to temp file
      fs.writeFileSync(tempInput, file.buffer);

      // Run pandoc to convert DOCX → Markdown
      const cmd = `pandoc "${tempInput}" -f docx -t markdown -o "${tempOutput}"`;
      await execAsync(cmd);

      // Read back converted markdown
      let markdown = fs.readFileSync(tempOutput, "utf-8");

      const markdownBuffer = Buffer.from(markdown, "utf-8");

      return {
        data: markdownBuffer,
        filename: `${baseName}.md`,
        mimeType: "text/markdown",
      };
    } catch (error) {
      console.error("DOCX conversion error:", error);
      // Fallback: return original file if conversion fails
      return {
        data: file.buffer,
        filename: file.originalname,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };

    }  finally {

      // Clean up temporary files
      [tempInput, tempOutput].forEach((f) => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      });
    }
  }
}
