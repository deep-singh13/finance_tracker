import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // __dirname will be /opt/render/project/src/dist in production
  const distPath = path.join(__dirname, "public");

  console.log("Serving static files from:", distPath);

  if (!fs.existsSync(distPath)) {
    console.error("Static build folder not found:", distPath);
    process.exit(1);
  }

  app.use(express.static(distPath));

  // SPA fallback
  app.use("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}