import express from "express";
import { createServer as createViteServer } from "vite";
import { Storage } from "@google-cloud/storage";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: '10mb' }));

  // CORS — allow Cloudflare Pages frontend
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // GCS Setup
  let storage: Storage | null = null;
  const bucketName = process.env.GCS_BUCKET_NAME;
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (credentialsJson && bucketName) {
    try {
      const credentials = JSON.parse(credentialsJson);
      storage = new Storage({ credentials });
      console.log("GCS Storage initialized with provided credentials.");
    } catch (error) {
      console.error("Failed to parse GCS credentials:", error);
    }
  } else {
    console.warn("GCS credentials or bucket name missing. Uploads will fail.");
  }

  // API Routes
  app.post("/api/upload-ocr", async (req, res) => {
    const { text, filename } = req.body;

    if (!text || !filename) {
      return res.status(400).json({ error: "Missing text or filename" });
    }

    if (!storage || !bucketName) {
      return res.status(503).json({ 
        error: "GCS not configured", 
        details: "Please set GCS_BUCKET_NAME and GOOGLE_APPLICATION_CREDENTIALS_JSON in environment variables." 
      });
    }

    try {
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(`ocr-results/${filename}.json`);
      
      const data = {
        timestamp: new Date().toISOString(),
        extractedText: text,
        originalFilename: filename
      };

      await file.save(JSON.stringify(data, null, 2), {
        contentType: 'application/json',
      });

      res.json({ success: true, path: `gs://${bucketName}/ocr-results/${filename}.json` });
    } catch (error: any) {
      console.error("GCS Upload Error:", error);
      res.status(500).json({ error: "Failed to upload to GCS", details: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
