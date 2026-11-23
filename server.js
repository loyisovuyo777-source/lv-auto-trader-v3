import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __filename =
fileURLToPath(import.meta.url);
const __dirname =
path.dirname(__filename); 
const app = express();
app.use(express.static(__dirname));

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
app.get("/", (req, res) => {
 ares.sendFile(path.join(__dirname, "index.html"));
});
app.post("/analyze", async (req, res) => {
  try {
    const { image } = req.body;

    if (!image || !image.startsWith("data:image/")) {
      return res.status(400).json({ error: "Please upload a chart image." });
    }

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [{
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Analyse this trading chart. Explain the visible trend, support and resistance, and candlestick patterns. Give a cautious educational assessment: BUY, SELL, or WAIT only if supported by the chart. If unclear, say WAIT. Never guarantee profit. Mention that screenshot analysis may be delayed and incomplete."
          },
          {
            type: "input_image",
            image_url: image
          }
        ]
      }]
    });

    res.json({ analysis: response.output_text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Analysis failed. Check the server configuration." });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => {
  console.log(`lv Auto Trader v3 running on port ${port}`);
});
