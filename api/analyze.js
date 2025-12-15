export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { topic } = req.body;

        if (!topic) {
            return res.status(400).json({ error: 'Topic is required' });
        }

        const apiKey = process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            console.error('API Key missing');
            return res.status(500).json({ error: 'Server configuration error: API Key missing' });
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
            return res.status(502).json({ error: 'Failed to communicate with AI' });
        }

        const completion = await response.json();

        let content = completion.choices[0].message.content;

        // Cleanup: Remove markdown code blocks if the AI accidentally included them
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();

        try {
            const jsonResponse = JSON.parse(content);
            return res.status(200).json(jsonResponse);
        } catch (parseError) {
            console.error("JSON Parse Error:", parseError, "Content:", content);
            return res.status(500).json({ error: 'Failed to parse AI response' });
        }

    } catch (error) {
        console.error("Internal Server Error:", error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
