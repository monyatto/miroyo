const { GoogleGenAI } = require("@google/genai");

const SYSTEM_PROMPT = `あなたはユーザーの「がんばった成果」を解釈するアシスタントです。
ユーザーが入力したテキストから以下の情報を抽出し、JSON形式で返してください。

## 出力フォーマット

{
  "period": "day" | "week" | "month",
  "periodLabel": "期間の日本語表記（例: 1週間、3日間、1ヶ月）",
  "achievements": [
    {
      "content": "がんばりの内容（短い名詞形。例: ジョギング、読書、勉強）",
      "value": 数値,
      "unit": "単位（例: km、冊、時間、kg）",
      "frequency": "頻度の説明（例: 毎日、3回）"
    }
  ],
  "djComment": "DJのお兄さんの紹介セリフ",
  "djTrivia": "数値の偉大さを例え話で紹介するセリフ"
}

## ルール

- periodは入力テキストから判定。「今日」「今週」「今月」等のキーワードから判断。曖昧な場合はdayをデフォルトにする
- achievementsは1つ以上。複数の成果が含まれている場合はそれぞれを分割する
- valueは必ず数値型にする。テキストに明確な数値がない場合は1にする
- frequencyがない場合は空文字にする
- djCommentは、DJで金のブリンブリンのネックレスをしたヒゲのお兄さんが、ユーザーの成果をノリノリで紹介するセリフ。
  ユーザーの成果を褒めちぎり、テンション高く盛り上げる。日本語メインで英語のスラングを混ぜる。100〜200文字程度。
- djTriviaは、ユーザーの達成した数値や日数がどれだけ偉大なのかを、面白い例え話を交えてDJのお兄さんが紹介するセリフ。
  例えば「35km走ったってことは、東京タワーの高さ100回分登ったのと同じカロリーだぜ！」のように、
  身近なものや有名なものに例えて数値のスゴさを伝える。ユーモアと驚きを重視。日本語メインで英語スラングを混ぜる。
  数値データが含まれている場合は必ず生成する。数値がない場合は空文字にする。150〜300文字程度。`;

const MAX_INPUT_LENGTH = 1000;
const MAX_OUTPUT_TOKENS = 2048;
const REQUEST_LIMIT = 20;
const REQUEST_WINDOW_MS = 60 * 1000;
const MODEL_TIMEOUT_MS = 15000;
const ALLOWED_PERIODS = new Set(["day", "week", "month"]);

const requestCounters = new Map();

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) {
    return realIp.trim();
  }

  return "unknown";
}

function consumeRateLimit(ip) {
  const now = Date.now();

  for (const [key, value] of requestCounters.entries()) {
    if (value.resetAt <= now) {
      requestCounters.delete(key);
    }
  }

  const current = requestCounters.get(ip);
  if (!current || current.resetAt <= now) {
    requestCounters.set(ip, { count: 1, resetAt: now + REQUEST_WINDOW_MS });
    return false;
  }

  if (current.count >= REQUEST_LIMIT) {
    return true;
  }

  current.count += 1;
  return false;
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("model_timeout"));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function trimString(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function toSafeNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }

  return Math.max(0, Math.min(value, 1000000));
}

function normalizeAchievements(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return [
      {
        content: "がんばり",
        value: 1,
        unit: "回",
        frequency: "",
      },
    ];
  }

  return input.slice(0, 5).map((item) => ({
    content: trimString(item?.content, 60) || "がんばり",
    value: toSafeNumber(item?.value),
    unit: trimString(item?.unit, 20),
    frequency: trimString(item?.frequency, 30),
  }));
}

function normalizeResult(raw) {
  const period = ALLOWED_PERIODS.has(raw?.period) ? raw.period : "day";

  return {
    period,
    periodLabel: trimString(raw?.periodLabel, 40) || "今日",
    achievements: normalizeAchievements(raw?.achievements),
    djComment: trimString(raw?.djComment, 300),
    djTrivia: trimString(raw?.djTrivia, 400),
  };
}

function isInvalidOrigin(req) {
  const origin = req.headers.origin;
  if (typeof origin !== "string" || origin.length === 0) {
    return false;
  }

  const host = req.headers.host;
  if (typeof host !== "string" || host.length === 0) {
    return true;
  }

  return origin !== `https://${host}` && origin !== `http://${host}`;
}

function isCrossSiteRequest(req) {
  const secFetchSite = req.headers["sec-fetch-site"];
  if (typeof secFetchSite !== "string" || secFetchSite.length === 0) {
    return false;
  }

  return secFetchSite !== "same-origin" && secFetchSite !== "none";
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const contentType = req.headers["content-type"];
  if (typeof contentType !== "string" || !contentType.includes("application/json")) {
    return res.status(415).json({ error: "unsupported_media_type" });
  }

  if (isInvalidOrigin(req) || isCrossSiteRequest(req)) {
    return res.status(403).json({ error: "forbidden" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "server_error" });
  }

  const ip = getClientIp(req);
  if (consumeRateLimit(ip)) {
    return res.status(429).json({ error: "rate_limit" });
  }

  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({ error: "bad_request" });
  }

  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  if (!text) {
    return res.status(400).json({ error: "bad_request" });
  }

  if (text.length > MAX_INPUT_LENGTH) {
    return res.status(400).json({ error: "bad_request" });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await withTimeout(
      ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: text,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          temperature: 0.7,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
      MODEL_TIMEOUT_MS,
    );

    const resultText = typeof response.text === "string" ? response.text : "{}";
    let parsed;
    try {
      parsed = JSON.parse(resultText);
    } catch {
      // MAX_TOKENSでJSONが途中切れした場合、デフォルト値で補完
      parsed = {};
    }
    const normalized = normalizeResult(parsed);

    return res.status(200).json(normalized);
  } catch (error) {
    if (error?.message === "model_timeout") {
      return res.status(504).json({ error: "timeout" });
    }

    if (error?.status === 429 || error?.message?.includes("429")) {
      return res.status(429).json({ error: "rate_limit" });
    }

    console.error("Gemini API error:", {
      status: error?.status,
      message: error?.message,
    });

    return res.status(500).json({ error: "server_error" });
  }
};
