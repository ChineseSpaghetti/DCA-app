const GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

function chatApiKey() {
  return process.env.GEMINI_CHAT_API_KEY || process.env.GEMINI_API_KEY;
}

export function splitDataUrl(dataUrl) {
  const [header, data] = String(dataUrl || '').split(',');
  const mimeType = header.split(';')[0].replace('data:', '');
  return { mimeType, data };
}

function describeFetchError(error) {
  return error?.cause?.message || error?.message || 'fetch failed';
}

async function fetchGemini(url, requestOptions) {
  try {
    return await fetch(url, requestOptions);
  } catch (error) {
    throw new Error(`Gemini request network failed: ${describeFetchError(error)}`);
  }
}

async function generateGeminiJson({ apiKey, contents, schema, temperature = 0 }) {
  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature,
      },
    }),
  };

  let lastError;
  for (const model of GEMINI_MODELS) {
    const geminiResponse = await fetchGemini(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, requestOptions);
    const geminiData = await geminiResponse.json();
    if (geminiResponse.status === 404) {
      lastError = new Error(JSON.stringify(geminiData));
      continue;
    }
    if (!geminiResponse.ok) {
      const error = new Error(JSON.stringify(geminiData));
      error.status = geminiResponse.status;
      throw error;
    }
    const text = geminiData.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
    if (!text) throw new Error('No structured output returned by Gemini.');
    return JSON.parse(text);
  }
  throw lastError || new Error('Gemini model unavailable.');
}

async function generateGeminiText({ apiKey, contents, temperature = 0.35 }) {
  const requestOptions = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature,
      },
    }),
  };

  let lastError;
  for (const model of GEMINI_MODELS) {
    const geminiResponse = await fetchGemini(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, requestOptions);
    const geminiData = await geminiResponse.json();
    if (geminiResponse.status === 404) {
      lastError = new Error(JSON.stringify(geminiData));
      continue;
    }
    if (!geminiResponse.ok) {
      const error = new Error(JSON.stringify(geminiData));
      error.status = geminiResponse.status;
      throw error;
    }
    const text = geminiData.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
    if (!text) throw new Error('No text output returned by Gemini.');
    return text.trim();
  }
  throw lastError || new Error('Gemini model unavailable.');
}

export async function extractTransactionFromImage(image) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error('Set GEMINI_API_KEY in Vercel project environment variables.');
    error.status = 500;
    throw error;
  }
  if (!image || !String(image).startsWith('data:image/')) {
    const error = new Error('Missing image data URL.');
    error.status = 400;
    throw error;
  }

  const { mimeType, data } = splitDataUrl(image);
  const schema = {
    type: 'OBJECT',
    properties: {
      symbol: { type: 'STRING' },
      side: { type: 'STRING', enum: ['buy', 'sell', 'unknown'] },
      currency: { type: 'STRING' },
      price: { type: 'NUMBER' },
      shares: { type: 'NUMBER' },
      stockValue: { type: 'NUMBER' },
      commission: { type: 'NUMBER' },
      vat: { type: 'NUMBER' },
      fee: { type: 'NUMBER' },
      date: { type: 'STRING' },
      dateConfidence: { type: 'NUMBER' },
      confidence: { type: 'NUMBER' },
      notes: { type: 'STRING' },
    },
    required: ['symbol', 'side', 'currency', 'price', 'shares', 'stockValue', 'commission', 'vat', 'fee', 'date', 'dateConfidence', 'confidence', 'notes'],
    propertyOrdering: ['symbol', 'side', 'currency', 'price', 'shares', 'stockValue', 'commission', 'vat', 'fee', 'date', 'dateConfidence', 'confidence', 'notes'],
  };

  return generateGeminiJson({
    apiKey,
    schema,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'Extract a brokerage stock transaction from this screenshot. It may contain Thai labels. Map ราคาที่ได้จริง to price, จำนวนหุ้น to shares, มูลค่าหุ้น to stockValue, ค่าคอมมิชชั่น to commission, VAT to vat, and fee = commission + vat. Return numbers only, no currency symbols. For date, use the transaction execution or order date only, not settlement date, posting date, or visible clock time. Convert Thai Buddhist years to ISO yyyy-mm-dd. Return dateConfidence from 0 to 1. If the transaction date is missing or ambiguous, return an empty date and dateConfidence below 0.8. If uncertain, use empty string for text fields and 0 for numbers, and explain in notes.',
          },
          { inline_data: { mime_type: mimeType, data } },
        ],
      },
    ],
  });
}

export async function classifyPortfolioQuestion(text) {
  const apiKey = chatApiKey();
  if (!apiKey) {
    const error = new Error('Set GEMINI_CHAT_API_KEY or GEMINI_API_KEY in Vercel project environment variables.');
    error.status = 500;
    throw error;
  }
  const schema = {
    type: 'OBJECT',
    properties: {
      intent: {
        type: 'STRING',
        enum: ['portfolio_summary', 'symbol_holding', 'unrealized_profit', 'realized_profit', 'average_cost', 'total_value', 'top_gain', 'top_loss', 'recent_records', 'portfolio_advice','market_news', 'market_explanation', 'general_chat', 'help', 'unknown'],
      },
      symbol: { type: 'STRING' },
      limit: { type: 'NUMBER' },
      confidence: { type: 'NUMBER' },
    },
    required: ['intent', 'symbol', 'limit', 'confidence'],
    propertyOrdering: ['intent', 'symbol', 'limit', 'confidence'],
  };

  return generateGeminiJson({
    apiKey,
    schema,
    temperature: 0,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Classify this LINE chat message from a Thai retail investor using a DCA portfolio app.

            Return only the requested JSON.
            
            Choose:
            - market_news when the user asks about latest news, earnings, Fed, macro, market update, stock news, or what happened today.
            - market_explanation when the user asks why a stock/index/crypto moved, why price rose/fell, or asks for explanation of market movement.
            - portfolio_advice when the user asks for suggestions, review, what to do next, risk, allocation, or general portfolio observations.
            - help for greetings or requests for examples.
            - general_chat for simple non-investment conversation.
            - unknown for unrelated text.
            
            Normalize Thai/US stock symbols to uppercase when present.
            
            Message: ${String(text || '').slice(0, 500)}`,
          },
        ],
      },
    ],
  });
}

export async function polishPortfolioAnswer({ userMessage, factualAnswer, intent }) {
  const apiKey = chatApiKey();
  if (!apiKey) return factualAnswer;
  const prompt = [
    'You are a friendly Thai DCA portfolio assistant inside LINE chat.',
    'Rewrite the factual portfolio answer into a natural, concise response.',
    'Language rule: if the user explicitly asks for a language, use that language. For example, "in English", "English", "report back in English", "ตอบภาษาอังกฤษ", or "เป็นภาษาอังกฤษ" means answer in English. If no language is requested, use Thai for Thai or mixed Thai messages, otherwise use English.',
    'Very important rules:',
    '- Never change, add, remove, or recalculate any numeric value from the factual answer.',
    '- Do not invent holdings, prices, profit, losses, or transactions.',
    '- Answer only the specific thing the user asked. Do not include extra portfolio fields just because they are available.',
    '- Do not use Markdown formatting. Do not use **bold**, headings, tables, code blocks, or decorative bullets.',
    '- Plain text only. Short line breaks are okay.',
    '- Tasteful emoji decoration is encouraged when it fits the answer, for example one or two relevant emojis like 📊, 💚, ✅, ⚠️, or 🔎.',
    '- Do not overuse emojis. Avoid emoji-only lines.',
    '- Only add safe next-check suggestions if the user asked for advice, review, suggestions, or what to do next.',
    '- Keep it under 700 characters and suitable for a LINE chat bubble.',
    '- If the factual answer is a help message or says there is no data, keep it practical and brief.',
    '',
    `User message: ${String(userMessage || '').slice(0, 500)}`,
    `Intent: ${JSON.stringify(intent || {})}`,
    'Factual answer, numbers must stay exactly as-is:',
    factualAnswer,
  ].join('\n');

  try {
    const text = await generateGeminiText({
      apiKey,
      temperature: 0.35,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
    });
    return text || factualAnswer;
  } catch {
    return factualAnswer;
  }
}
