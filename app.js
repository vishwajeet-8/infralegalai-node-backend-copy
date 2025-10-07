import express from "express";
import cors from "cors";

import authRoutes from "./src/routes/authRoutes.js";
import inviteRoutes from "./src/routes/inviteRoutes.js";
import workspaceRoutes from "./src/routes/workspaceRoutes.js";
import documentRoutes from "./src/routes/documentRoutes.js";
import researchRoutes from "./src/routes/researchRoutes.js";
import extractionRoutes from "./src/routes/extractionRoutes.js";
import creditRoutes from "./src/routes/creditRoutes.js";
import roadmapRoutes from "./src/routes/roadmapRoutes.js";
import tenatRoutes from "./src/routes/tenatRoutes.js";
import autoDraftRoutes from "./src/routes/autoDraftRoutes.js";

const app = express();

// ✅ CORS must be first
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://law.infrahive.ai",
      "https://infrahive-ai-ui-temp.vercel.app",
      "https://demo-law-infrahive-ai.vercel.app",
      "https://law-infrahive-copy.vercel.app",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ then express.json
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// ✅ then routes
app.use("/legal-api", authRoutes);
app.use("/legal-api", inviteRoutes);
app.use("/legal-api", workspaceRoutes);
app.use("/legal-api", documentRoutes);
app.use("/legal-api", researchRoutes);
app.use("/legal-api", extractionRoutes);
app.use("/legal-api", creditRoutes);
app.use("/legal-api", roadmapRoutes);
app.use("/legal-api", tenatRoutes);
app.use("/legal-api", autoDraftRoutes);

export default app;
