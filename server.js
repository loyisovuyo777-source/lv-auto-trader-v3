
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/analyze", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Gemini API key is missing."
      });
    }

    const { image } = req.body;

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        error: "Please upload a chart image."
      });
    }

    const match = image.match(
      /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/i
    );

    if (!match) {
      return res.status(400).json({
        error: "Please upload a PNG, JPEG or WebP image."
      });
    }

    const mimeType = match[1];
    const imageData = match[2].replace(/\s/g, "");

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" +
      encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: "You are LV Auto Trader V3, an educational chart analysis assistant. Examine the screenshot carefully. Explain the visible trend, support, resistance and candlestick patterns. Give a cautious assessment of BUY, SELL or WAIT only when supported by visible evidence. If the chart is unclear, say WAIT. Explain your reasoning, mention uncertainty and never guarantee profits. Do not invent prices or indicators."
              },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: imageData
                }
              }
            ]
          }]
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", result);
      return res.status(response.status).json({
        error: result.error?.message || "Gemini analysis failed."
      });
    }

    const analysis = result.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("\n")
      .trim();

    if (!analysis) {
      return res.status(500).json({
        error: "Gemini returned no analysis. Please try again."
      });
    }

    res.json({ analysis });

  } catch (error) {
    console.error("Analysis error:", error);

    res.status(500).json({
      error: "Analysis failed. Please try again."
    });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, "0.0.0.0", () => {
  console.log(`LV Auto Trader V3 running on port ${port}`);
});
