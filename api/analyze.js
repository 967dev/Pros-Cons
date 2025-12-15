export const config = {
    runtime: 'edge', // Using Edge Runtime for speed and higher timeout (30s vs 10s)
};

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const { topic } = await req.json();

        if (!topic) {
            return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            console.error('API Key missing');
            return new Response(JSON.stringify({ error: 'Server configuration error: API Key missing' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
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

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "google/gemini-2.0-flash-exp:free",
                "messages": [
                    { "role": "user", "content": systemPrompt }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("OpenRouter API Error:", errorText);
            return new Response(JSON.stringify({ error: 'Failed to communicate with AI' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
        }

        const completion = await response.json();

        // Safety check to ensure we actually got choices
        if (!completion.choices || !completion.choices[0] || !completion.choices[0].message) {
            console.error("Invalid AI Response Structure:", JSON.stringify(completion));
            return new Response(JSON.stringify({ error: 'Invalid response from AI provider' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
        }

        let content = completion.choices[0].message.content;

        // Cleanup: Remove markdown code blocks if the AI accidentally included them
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            const jsonResponse = JSON.parse(content);
            return new Response(JSON.stringify(jsonResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError, "Content:", content);
            return new Response(JSON.stringify({ error: 'Failed to parse AI response' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }

    } catch (error) {
        console.error("Internal Server Error:", error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
