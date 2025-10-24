import express from "express";
import multer from "multer";
import sharp from "sharp";
import axios from "axios";
import cors from "cors";
import ImageTracer from "imagetracerjs";
import { createCanvas, Image } from "canvas"; 
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());

// Helper function: convert buffer → ImageData (required by imagetracer)
function bufferToImageData(buffer) {
  const img = new Image();
  img.src = buffer;
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

app.post("/convert", upload.single("image"), async (req, res) => {
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

    // ------------------------------------------------------------
    // 🧩 RASTER → SVG (vectorization)
    // ------------------------------------------------------------
    if (direction === "to-svg") {
      const imgData = bufferToImageData(buffer);
      const svgString = ImageTracer.imagedataToSVG(imgData, { ltres: 1, qtres: 1, pathomit: 8 });
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
});

app.get("/health", (req, res) => {
  res.send({ status: "OK", uptime: process.uptime() });
});

app.get("/", (req, res) => {
  res.send({ status: "Vector Conversion API", uptime: process.uptime() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
