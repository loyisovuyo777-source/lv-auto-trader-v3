

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

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" +
      encodeURIComponent(apiKey);

    const requestBody = {
      contents: [{
        parts: [
          {
            text: "You are LV Auto Trader V3, an educational chart analysis assistant. Examine the screenshot carefully. Explain the visible trend, support, resistance and candlestick patterns. Give a cautious assessment of BUY, SELL or WAIT only when supported by visible evidence. If the chart is unclear, say WAIT. Explain your reasoning, mention uncertainty and never guarantee profits. Do not invent prices or indicators."
          },
          {
            inlineData: {
              mimeType,
              data: imageData
            }
          }
        ]
      }]
    };

    let response;
    let result;

    // Try up to 3 times if Gemini is temporarily busy.
    for (let attempt = 1; attempt <= 3; attempt++) {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });

      result = await response.json();

      if (response.ok) {
        break;
      }

      const errorMessage =
        result.error?.message || "Gemini analysis failed.";

      const temporaryError =
        [429, 500, 502, 503, 504].includes(response.status) ||
        /high demand|overloaded|temporarily unavailable|resource_exhausted/i.test(errorMessage);

      if (!temporaryError) {
        console.error("Gemini API error:", result);
        return res.status(response.status).json({
          error: errorMessage
        });
      }

      if (attempt === 3) {
        console.error("Gemini is still busy:", result);

        return res.status(503).json({
          code: "AI_BUSY",
          error: "AI is busy right now. Please wait a few minutes and try again."
        });
      }

      console.log(`Gemini busy. Retrying attempt ${attempt + 1}...`);

      await new Promise(resolve =>
        setTimeout(resolve, attempt * 2000)
      );
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

    return res.json({ analysis });

  } catch (error) {
    console.error("Analysis error:", error);

    return res.status(500).json({
      error: "Analysis failed. Please try again."
    });
  }
});

const port = process.env.PORT || 3000;

app.listen(port, "0.0.0.0", () => {
  console.log(`LV Auto Trader V3 running on port ${port}`);
});
