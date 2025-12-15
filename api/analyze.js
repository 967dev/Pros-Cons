export const config = {
    runtime: 'edge',
};

const MODELS = [
    "openrouter/cinematika-7b-alpha:free", // Truly free/unlimited (experimental)
    "liquid/lfm-40b:free",                 // Liquid model (often free)
    "google/gemini-2.0-flash-exp:free",    // High quality (rate limited)
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "google/gemma-3-12b-it:free"
];

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    try {
        const { topic } = await req.json();

        if (!topic) {
            return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400 });
        }

        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            return new Response(JSON.stringify({ error: 'Server configuration error: API Key missing' }), { status: 500 });
        }

        const systemPrompt = `
Вы — эксперт по анализу решений и генерации структурированных данных. Ваша задача — проанализировать указанное ниже занятие или деятельность и сгенерировать исчерпывающий список плюсов и минусов, касающихся этого выбора.

### Строгие инструкции по форматированию:
1.  **Вывод должен быть ТОЛЬКО в формате JSON.** Не добавляйте никакого дополнительного текста, введения, пояснений или markdown-тегов (например, \`\`\`json) до или после самого JSON-объекта.
2.  Объект JSON должен иметь корневой ключ \`analysis\`.
3.  Объект \`analysis\` должен содержать два обязательных ключа: \`pros\` (Плюсы) и \`cons\` (Минусы).
4.  Значения ключей \`pros\` и \`cons\` должны быть **массивами строк**.
5.  Каждая строка в массиве должна быть кратким и четким утверждением (не более одного предложения).
6.  Язык ответа: Русский.

### Запрос для анализа:
**Проанализируйте следующее занятие:** ${topic}

### Требуемый вывод (Строгий формат JSON):
{
  "analysis": {
    "pros": ["...", "..."],
    "cons": ["...", "..."]
  }
}
        `;

        let lastError = null;

        for (const model of MODELS) {
            try {
                console.log(`Attempting with model: ${model}`);
                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://pros-cons.vercel.app", // Required by OpenRouter for free tier
                        "X-Title": "Pros & Cons App"
                    },
                    body: JSON.stringify({
                        "model": model,
                        "messages": [
                            { "role": "user", "content": systemPrompt }
                        ],
                        "stream": true
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.warn(`Model ${model} failed: ${response.status} - ${errorText}`);
                    lastError = `Model ${model} error: ${response.status} - ${errorText}`;
                    continue; // Try next model
                }

                // If successful, start streaming
                const stream = new ReadableStream({
                    async start(controller) {
                        const reader = response.body.getReader();
                        const decoder = new TextDecoder();
                        let buffer = '';

                        try {
                            while (true) {
                                const { done, value } = await reader.read();
                                if (done) break;

                                const chunk = decoder.decode(value, { stream: true });
                                buffer += chunk;
                                const lines = buffer.split('\n');
                                buffer = lines.pop();

                                for (const line of lines) {
                                    if (line.trim() === '') continue;
                                    if (line.trim() === 'data: [DONE]') continue;
                                    if (line.startsWith('data: ')) {
                                        try {
                                            const data = JSON.parse(line.slice(6));
                                            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                                                controller.enqueue(new TextEncoder().encode(data.choices[0].delta.content));
                                            }
                                        } catch (e) {
                                            // Ignore parse errors for partial chunks
                                        }
                                    }
                                }
                            }
                        } catch (err) {
                            console.error('Stream reading error', err);
                            controller.error(err);
                        } finally {
                            controller.close();
                        }
                    }
                });

                return new Response(stream, {
                    headers: {
                        'Content-Type': 'text/plain; charset=utf-8',
                        'Transfer-Encoding': 'chunked'
                    }
                });

            } catch (err) {
                console.error(`Fetch error for ${model}:`, err);
                lastError = err.message;
            }
        }

        // If all models fail
        return new Response(JSON.stringify({
            error: 'All AI models failed to respond. Please try again later.',
            details: lastError
        }), { status: 502 });

    } catch (error) {
        console.error("Internal Server Error:", error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
}
