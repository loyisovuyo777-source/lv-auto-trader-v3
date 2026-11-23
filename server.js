


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
You are LV AUTO TRADER V3, an advanced educational trading chart analysis assistant.

Analyze the uploaded trading chart carefully.

Your job is to identify possible trading opportunities using ONLY visible evidence.

FOLLOW THIS REPORT FORMAT:

1. TRADING SIGNAL:
Choose one:
BUY
SELL
WAIT

2. MARKET TREND:
Identify whether the visible market is:
- Bullish
- Bearish
- Sideways
- Unclear

3. MARKET STRUCTURE:
Explain the visible price movement, including:
- Higher highs and higher lows
- Lower highs and lower lows
- Breakouts or possible reversals
Only mention what is actually visible.

4. SUPPORT AND RESISTANCE:
Identify visible support and resistance levels.
Do not invent prices.
If exact levels cannot be read, explain that.

5. ENTRY ANALYSIS:
Explain whether a possible entry exists.
If there is no reliable entry, say WAIT.
Only provide an entry price when it can be reliably read from the chart.

6. STOP LOSS:
Give a possible educational stop-loss level only if the chart provides enough information.
Otherwise say that the level cannot be determined.

7. TAKE PROFIT:
Give a possible educational target only if the chart provides enough information.
Otherwise say that the level cannot be determined.

8. CONFIDENCE:
Choose LOW, MEDIUM or HIGH.
Explain what supports this assessment.
Confidence is not a probability of winning.

9. REASONS:
List the strongest reasons supporting your signal.

10. RISK WARNING:
Mention what could invalidate the analysis.

IMPORTANT RULES:

- Never invent prices, indicators or chart information.
- Never guarantee profits.
- Never force a BUY or SELL signal.
- If evidence is insufficient, choose WAIT.
- If the screenshot is blurry, explain that.
- Distinguish confirmed signals from possible setups.
- Consider candlestick patterns, trend direction and support/resistance.
- Do not assume indicators are present if they cannot be seen.
- If the timeframe is visible, mention it.
- This is educational analysis, not guaranteed financial advice.

Be detailed, clear and easy for a beginner to understand.
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
