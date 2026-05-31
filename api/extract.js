function splitDataUrl(dataUrl) {
  const [header, data] = dataUrl.split(',');
  const mimeType = header.split(';')[0].replace('data:', '');
  return { mimeType, data };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    response.status(500).json({ error: 'Set GEMINI_API_KEY in Vercel project environment variables.' });
    return;
  }

  try {
    const { image } = request.body || {};
    if (!image || !image.startsWith('data:image/')) {
      response.status(400).json({ error: 'Missing image data URL.' });
      return;
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

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0,
        },
      }),
    });

    const geminiData = await geminiResponse.json();
    if (!geminiResponse.ok) {
      response.status(geminiResponse.status).json({ error: JSON.stringify(geminiData) });
      return;
    }

    const text = geminiData.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
    if (!text) {
      response.status(500).json({ error: 'No structured output returned by Gemini.' });
      return;
    }

    response.status(200).json(JSON.parse(text));
  } catch (error) {
    response.status(500).json({ error: error.message || 'Gemini extraction failed.' });
  }
}
