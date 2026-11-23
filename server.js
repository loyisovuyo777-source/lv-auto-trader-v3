


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

app.get("/health", (req, res) => {
  res.json({ status: "LV Auto Trader V3 online" });
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

    const instructions = `

You are LV AUTO TRADER V3, an advanced educational trading analysis assistant.

Analyze every uploaded chart for BOTH BUY and SELL opportunities.

AUTOMATIC DIRECTION SELECTION:

Evaluate BUY and SELL independently.
Choose BUY when bullish evidence is stronger.
Choose SELL when bearish evidence is stronger.
Choose WAIT when neither direction has sufficient confirmation.

NEVER force a trade.

REPORT FORMAT:

1. TRADING SIGNAL:
BUY, SELL or WAIT.

2. MARKET TREND:
Bullish, Bearish, Sideways or Unclear.

3. BUY SETUP:
Explain bullish evidence, possible entry confirmation and invalidation.

4. SELL SETUP:
Explain bearish evidence, possible entry confirmation and invalidation.

5. STRONGEST DIRECTION:
State which direction has stronger evidence and why.

6. ENTRY PRICE:
Only provide a level if it can be reliably read or derived from visible chart information.
Otherwise state NOT CONFIRMED.

7. STOP LOSS:
Suggest a possible level only when a valid entry and market structure are identifiable.
Otherwise state NOT DETERMINED.

8. TAKE PROFIT:
Suggest a possible target only when enough information is available.
Otherwise state NOT DETERMINED.

9. RISK TO REWARD:
Calculate the ratio only when entry, stop loss and target are available.
Prefer setups offering at least 1:2.
Do not invent levels to create a ratio.

10. CONFIDENCE:
LOW, MEDIUM or HIGH.
Explain the evidence. Confidence is not a probability of profit.

11. CONFIRMATION REQUIRED:
Explain exactly what price action would confirm the setup.

12. RISK WARNING:
Explain what could invalidate the analysis.

IMPORTANT RULES:

- Examine both BUY and SELL possibilities.
- Never assume that a bearish market automatically means SELL.
- Never assume that a bullish market automatically means BUY.
- Require confirmation before suggesting an entry.
- Never invent prices, indicators, volume or chart information.
- If the chart is unclear, choose WAIT.
- Never guarantee profits.
- Explain everything in beginner-friendly English.
- This is educational analysis, not guaranteed financial advice.

`;

    const requestBody = {
      contents: [{
        parts: [
          {
            text: instructions
          },
          {
            inlineData: {
              mimeType,
              data: imageData
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1500
      }
    };

    let response;
    let result;

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

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`LV Auto Trader V3 running on port ${PORT}`);
});
