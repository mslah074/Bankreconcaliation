import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Helper functions for converting and parsing multilingual numerals and prices
function convertArabicNumerals(str: string): string {
  const arabicNums = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
  const persianNums = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /٨/g, /٩/g];
  for (let i = 0; i < 10; i++) {
    str = str.replace(arabicNums[i], String(i));
    str = str.replace(persianNums[i], String(i));
  }
  return str;
}

function safeParseNumber(val: any): number {
  if (val === undefined || val === null) return 0;
  let s = String(val).trim();
  s = convertArabicNumerals(s);
  // Remove commas, spaces, currency symbols, and keep digits, dots, minuses
  s = s.replace(/[, ]/g, '').replace(/[^0-9.\-]/g, '');
  const parsed = parseFloat(s);
  return isNaN(parsed) ? 0 : parsed;
}

// Set up large payload limit
app.use(express.json({ limit: "20mb" }));

// Initialize Gemini Client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// AI Reconciliation Endpoint
app.post("/api/gemini/reconcile", async (req, res) => {
  try {
    const { bankRows, sysRows, bankMapping, sysMapping, clientApiKey } = req.body;

    const apiKey = (clientApiKey && clientApiKey.trim() !== "")
      ? clientApiKey.trim()
      : process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      return res.status(200).json({
        success: false,
        error: "GEMINI_API_KEY is not configured. Please supply your personal Gemini API key under 'Personal API Key Settings' in the app.",
      });
    }

    const taskAi = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    if (!bankRows || !sysRows || !bankMapping || !sysMapping) {
      return res.status(400).json({
        success: false,
        error: "Missing required properties: bankRows, sysRows, bankMapping, or sysMapping.",
      });
    }

    // Process a safe batch of unmatched items to optimize latency and reliability
    const maxItems = 100;
    const limitedBank = bankRows.slice(0, maxItems);
    const limitedSys = sysRows.slice(0, maxItems);

    if (limitedBank.length === 0 || limitedSys.length === 0) {
      return res.json({
        success: true,
        matches: [],
      });
    }

    // Construct a highly strict, context-rich accounting prompt
    const prompt = `You are an expert, bilingual Arabic-English double-entry accounting auditor. Your task is to analyze unmatched Bank Statement items and System ERP entries to find high-confidence reconciliation matches.

STRICT DOUBLE-ENTRY BALANCE MANDATE:
An accounting match is strictly INVALID unless it balances mathematically.
For every match group:
1. Calculate the TOTAL Bank Amount (the active debit or credit) for all selected bank items in the group.
2. Calculate the TOTAL System Amount (the active debit or credit) for all selected system items in the group.
3. These sum totals MUST be identical (or within a tiny variance under 1-2% for potential transfer fees/bank charges). Never suggest matches where the sum totals do not balance.
4. If there are no logically or mathematically sound matches, simply return empty matches: {"matches": []}. Do not make random guesses or "best effort" combinations that do not balance.

GUIDELINES FOR BILINGUAL ARABIC & ENGLISH MATCHING:
- Date Proximity: Matched items should usually occur within 1-14 days of each other. Allow a wider window (up to 14 days) if amounts are unique and descriptions match.
- Description & Semantics: Look for similar words, business entity types, and common English-Arabic counterparts.
  * Counterparts: Match "الراجحي" with "Alrajhi", "فودافون" with "Vodafone", "الاتصالات" with "STC" or "telecom".
  * Accounting keywords: "سداد" (payment), "تحويل" (transfer), "فاتورة" (invoice), "إيداع" (deposit), "رواتب" (salaries/payroll), "عميل" (client), "مورد" (supplier).
  * Arabic Norm: Strip / ignore prefix "ال" (the), normalize "أإآ" to "ا", and "ة" to "e/h" conceptually to find semantic relations (e.g., "الشركة" and "شركة" are the same; "الراجحي" and "راجحي" are the same).
- Reference & Invoice Numbers: If descriptions contain matching numbers (e.g., invoice "Inv-2024-998" or reference "998"), they are very strong match indicators even if the names are slightly different!
- Grouping: A group can be 'one-to-one', 'one-to-many', 'many-to-one', or 'many-to-many'.

Bank Statement (Unmatched, max ${maxItems} items):
${JSON.stringify(
  limitedBank.map((b: any) => ({
    id: b._origIdx,
    date: b[bankMapping.date] || b.Date || "",
    desc: b[bankMapping.desc] || b.Description || "",
    debit: safeParseNumber(b[bankMapping.debit]),
    credit: safeParseNumber(b[bankMapping.credit]),
  }))
)}

System Transactions (Unmatched, max ${maxItems} items):
${JSON.stringify(
  limitedSys.map((s: any) => ({
    id: s._origIdx,
    date: s[sysMapping.date] || s.Date || "",
    desc: s[sysMapping.desc] || s.Description || "",
    debit: safeParseNumber(s[sysMapping.debit]),
    credit: safeParseNumber(s[sysMapping.credit]),
  }))
)}

Find up to 15 best proposed matches. Double check that every ID references an actual item index in the lists. Always output in the requested JSON structure.`;

    const response = await taskAi.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["matches"],
          properties: {
            matches: {
              type: Type.ARRAY,
              description: "Array of recommended matches found by Gemini",
              items: {
                type: Type.OBJECT,
                required: ["type", "bankOrigIdxs", "sysOrigIdxs", "confidence", "reasonAr", "reasonEn"],
                properties: {
                  type: {
                    type: Type.STRING,
                    description: "One of: 'one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'",
                  },
                  bankOrigIdxs: {
                    type: Type.ARRAY,
                    items: { type: Type.INTEGER },
                    description: "Original index integers (_origIdx) from the Bank Statement",
                  },
                  sysOrigIdxs: {
                    type: Type.ARRAY,
                    items: { type: Type.INTEGER },
                    description: "Original index integers (_origIdx) from the System ledger",
                  },
                  confidence: {
                    type: Type.INTEGER,
                    description: "Reconciliation match confidence percentage from 0 to 100",
                  },
                  reasonAr: {
                    type: Type.STRING,
                    description: "Short Arabic explanation of the match logic, targeting human reviewer (max 15 words)",
                  },
                  reasonEn: {
                    type: Type.STRING,
                    description: "Short English explanation of the match logic, targeting human reviewer (max 15 words)",
                  },
                },
              },
            },
          },
        },
      },
    });

    const aiText = response.text;
    if (!aiText) {
      throw new Error("Empty response received from Gemini API");
    }

    const data = JSON.parse(aiText);
    res.json({
      success: true,
      matches: data.matches || [],
    });
  } catch (error: any) {
    console.error("Gemini reconcile error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "An error occurred during AI reconciliation analysis.",
    });
  }
});

// Vite server linkage
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express dev-server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
