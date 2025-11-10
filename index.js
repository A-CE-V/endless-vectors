import express from "express";
import multer from "multer";
import sharp from "sharp";
import axios from "axios";
import cors from "cors";
import ImageTracer from "imagetracerjs";
import { createCanvas, Image } from "canvas";

import { verifyApiKey } from "./shared/apiKeyMiddleware.js";
import { enforceLimit } from "./shared/rateLimit.js";
import { priorityMiddleware } from "./shared/priorityQueue.js";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());

function bufferToImageData(buffer) {
  const img = new Image();
  img.src = buffer;
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

/* ======================
   ROUTES
====================== */
app.post(
  "/convert",
  verifyApiKey,
  priorityMiddleware,
  (req, res, next) => enforceLimit(req, res, next, "conversion"),
  upload.single("image"),
  async (req, res) => {
    try {
      const direction = (req.body.direction || req.query.direction || "to-raster").toLowerCase();
      const requestedFormat = (req.body.format || req.query.format || "png").toLowerCase();

      let buffer;
      if (req.file) {
        buffer = req.file.buffer;
      } else if (req.query.url) {
        const response = await axios.get(req.query.url, { responseType: "arraybuffer" });
        buffer = Buffer.from(response.data, "binary");
      } else {
        return res.status(400).json({ error: "No file or URL provided" });
      }

      if (direction === "to-svg") {
        const imgData = bufferToImageData(buffer);

        const options = {
          ltres: 2,
          qtres: 2,
          pathomit: 16,
          numberofcolors: 24,
          blurradius: 1,
          blurdelta: 10,
          scale: 1,
        };

        const svgString = ImageTracer.imagedataToSVG(imgData, options);
        res.set("Content-Type", "image/svg+xml");
        return res.send(svgString);
      }

      // ------------------------------------------------------------
      // 🖼️ SVG → RASTER (rendering)
      // ------------------------------------------------------------
      const supportedFormats = ["jpeg", "png", "webp", "avif"];
      let sharpFormat = requestedFormat === "jpg" ? "jpeg" : requestedFormat;
      if (!supportedFormats.includes(sharpFormat)) sharpFormat = "png";

      const outputBuffer = await sharp(buffer, { density: 300 })
        .toFormat(sharpFormat)
        .toBuffer();

      res.set("Content-Type", `image/${sharpFormat}`);
      res.send(outputBuffer);
    } catch (err) {
      console.error("Error converting image:", err);
      res.status(500).json({ error: "Conversion failed", details: err.message });
    }
  }
);

/* ======================
   STATUS ENDPOINTS
====================== */
app.get("/health", (req, res) => {
  res.send({ status: "OK", uptime: process.uptime() });
});

app.get("/", (req, res) => {
  res.send({ status: "Endless Vector Conversion API", uptime: process.uptime() });
});

/* ======================
   SERVER START
====================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`Endless Vector Conversion API now running on port ${PORT}`)
);
