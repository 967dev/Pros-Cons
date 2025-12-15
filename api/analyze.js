export const config = {
    runtime: 'edge',
};

// Define models with their specific provider settings
const MODELS = [
    {
        provider: 'openrouter',
        id: 'tngtech/deepseek-r1t2-chimera:free'
    },
    {
        provider: 'mistral',
        id: 'mistral-small-latest' // Standard efficient model
    }
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

        const openRouterKey = process.env.OPENROUTER_API_KEY;
        const mistralKey = process.env.MISTRAL_API_KEY;

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

        for (const modelConfig of MODELS) {
            try {
                const { provider, id } = modelConfig;
                console.log(`Attempting with provider: ${provider}, model: ${id}`);

                let apiUrl, apiKey, headers;

                if (provider === 'mistral') {
                    if (!mistralKey) {
                        console.warn('Skipping Mistral: API Key missing');
                        continue;
                    }
                    apiUrl = 'https://api.mistral.ai/v1/chat/completions';
                    apiKey = mistralKey;
                    headers = {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    };
                } else {
                    // Default to OpenRouter
                    if (!openRouterKey) {
                        console.warn('Skipping OpenRouter: API Key missing');
                        continue;
                    }
                    apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
                    apiKey = openRouterKey;
                    headers = {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://pros-cons.vercel.app",
                        "X-Title": "Pros & Cons App"
                    };
                }

                const response = await fetch(apiUrl, {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify({
                        "model": id,
                        "messages": [
                            { "role": "user", "content": systemPrompt }
                        ],
                        "stream": true
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.warn(`Model ${id} (${provider}) failed: ${response.status} - ${errorText}`);
                    lastError = `${provider} error: ${response.status} - ${errorText}`;
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
                console.error(`Fetch error for ${modelConfig.id}:`, err);
                lastError = err.message;
            }
        }

        // If all models fail
        return new Response(JSON.stringify({
            error: 'All AI models failed to respond. Please check API quotas.',
            details: lastError
        }), { status: 502 });

    } catch (error) {
        console.error("Internal Server Error:", error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
    }
}
