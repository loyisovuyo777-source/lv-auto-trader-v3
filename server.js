
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
  res.json({
    status: "LV Auto Trader V3.1 online"
  });
});

app.post("/analyze", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Gemini API key is missing. Check Render environment variables."
      });
    }

    const { image } = req.body;

    if (!image || typeof image !== "string") {
      return res.status(400).json({
        error: "Please upload a chart screenshot."
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

    const mimeType = match[1].toLowerCase();
    const imageData = match[2].replace(/\s/g, "");

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" +
      encodeURIComponent(apiKey);

    const instructions = `
You are LV AUTO TRADER V3.1, an educational trading chart analysis assistant.

Analyze the uploaded chart carefully.

Your job is to examine BOTH BUY and SELL opportunities independently.

1. TRADING SIGNAL
Choose BUY, SELL or WAIT.

2. MARKET TREND
Bullish, Bearish, Sideways or Unclear.
Explain why.

3. MARKET STRUCTURE
Identify visible higher highs, higher lows, lower highs or lower lows.
If unclear, say so.

4. BUY SETUP
Explain bullish evidence and what confirmation is needed.

5. SELL SETUP
Explain bearish evidence and what confirmation is needed.

6. STRONGEST DIRECTION
Compare BUY and SELL evidence.
Never force a direction.

7. ENTRY PRICE
Only give a price if it can reliably be read or derived from the chart.
Otherwise say NOT CONFIRMED.

8. STOP LOSS
Only suggest a level when a valid entry and market structure are identifiable.
Otherwise say NOT DETERMINED.

9. TAKE PROFIT
Only suggest a target when enough information is available.
Otherwise say NOT DETERMINED.

10. RISK TO REWARD
Calculate only when entry, stop loss and target are available.
Prefer at least 1:2.
Never invent prices.

11. CONFIDENCE
LOW, MEDIUM or HIGH.
Explain the evidence.
Confidence is not a probability of profit.

12. CONFIRMATION REQUIRED
Explain what price action is needed before entering.

13. RISK WARNING
Explain what could invalidate the analysis.

14. TRADE QUALITY SCORE

Give BUY and SELL separate scores from 0 to 100.

Evaluate each direction using:

- Market trend alignment: 20 points
- Market structure: 20 points
- Candlestick confirmation: 20 points
- Entry confirmation: 20 points
- Risk-to-reward quality: 20 points

Show the points awarded for each factor.
Explain why each score was awarded.

SCORE INTERPRETATION:

80-100: Strong setup.
60-79: Moderate setup.
40-59: Weak setup.
0-39: Very weak setup.

IMPORTANT SCORING RULES:

- Never invent evidence.
- Missing information receives no points.
- Do not award points for invisible indicators.
- A high score does not guarantee a winning trade.
- Scores must never automatically trigger BUY or SELL.
- Missing entry confirmation means WAIT.
- Always show both scores.

IMPORTANT SAFETY RULES:

- Never assume bullish automatically means BUY.
- Never assume bearish automatically means SELL.
- Require confirmation before suggesting an entry.
- Never invent chart prices or indicators.
- If the chart is unclear, choose WAIT.
- Never guarantee profits.
- Explain everything in beginner-friendly English.
- This is educational analysis, not guaranteed financial advice.
`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: instructions },
            {
              inlineData: {
                mimeType,
                data: imageData
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2200
      }
    };

 
let result = null;
let lastError = "Gemini analysis failed.";
let succeeded = false;

// Retry temporary server errors, but never retry quota errors.
for (let attempt = 1; attempt <= 4; attempt++) {
  try {
    console.log(`Starting Gemini analysis. Attempt ${attempt}/4`);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(90000)
    });

    const responseText = await response.text();

    try {
      result = JSON.parse(responseText);
    } catch {
      result = {};
    }

    if (response.ok) {
      succeeded = true;
      break;
    }

    lastError =
      result.error?.message ||
      `Gemini returned HTTP ${response.status}.`;

    // Stop immediately when Gemini reports a quota or rate limit.
    if (response.status === 429) {
      const dailyQuota =
        /quota|per day|daily|free.?tier|generate_content_requests/i.test(lastError);

      console.error("Gemini limit reached:", lastError);

      return res.status(429).json({
        code: dailyQuota
          ? "GEMINI_QUOTA_EXCEEDED"
          : "GEMINI_RATE_LIMITED",
        error: dailyQuota
          ? "Gemini daily quota has been reached. Wait for the quota to reset or review your API limits and billing."
          : "Gemini request limit reached. Please wait before trying again."
      });
    }

    // Only retry temporary server errors.
    const temporaryError = [500, 502, 503, 504]
      .includes(response.status);

    if (!temporaryError) {
      return res.status(response.status).json({
        code: "GEMINI_API_ERROR",
        error: lastError
      });
    }

    console.error("Temporary Gemini error:", lastError);

  } catch (error) {
    lastError = error.message || "Network request failed.";

    console.error(
      `Gemini request error on attempt ${attempt}:`,
      lastError
    );
  }

  if (attempt < 4) {
    const waitTime = 2000 * Math.pow(2, attempt - 1);

    console.log(
      `Waiting ${waitTime / 1000} seconds before retry...`
    );

    await new Promise(resolve =>
      setTimeout(resolve, waitTime)
    );
  }
}

if (!succeeded) {
  console.error("Gemini analysis failed:", lastError);

  return res.status(503).json({
    code: "GEMINI_UNAVAILABLE",
    error: "Gemini is temporarily unavailable. Please try again later."
  });
}


    const analysis = result.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("\n")
      .trim();

    if (!analysis) {
      console.error("Gemini returned no usable analysis:", result);

      return res.status(502).json({
        error: "AI returned no readable analysis. Please try again."
      });
    }

    console.log("Gemini analysis completed successfully.");

    return res.json({
      analysis
    });

  } catch (error) {
    console.error("Analysis error:", error);

    return res.status(500).json({
      error: "Analysis failed. Please try again."
    });
  }
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(
    `LV Auto Trader V3.1 running on port ${PORT}`
  );
});
