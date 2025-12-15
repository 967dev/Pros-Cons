document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('topicInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loader = document.getElementById('loader');
    const resultsSection = document.getElementById('results');
    const prosList = document.getElementById('prosList');
    const consList = document.getElementById('consList');

    analyzeBtn.addEventListener('click', handleAnalyze);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAnalyze();
    });

    async function handleAnalyze() {
        const topic = input.value.trim();
        if (!topic) return;

        // Reset UI
        setLoading(true);
        resultsSection.classList.add('hidden');
        prosList.innerHTML = '';
        consList.innerHTML = '';

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ topic })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch analysis');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                accumulatedText += decoder.decode(value, { stream: true });
            }

            // Cleanup: Using regex to find the JSON object within the text
            // Sometimes models output text before/after the JSON block
            let jsonString = accumulatedText;

            // Try to extract JSON from markdown block
            const markdownMatch = accumulatedText.match(/```json\s*([\s\S]*?)\s*```/);
            if (markdownMatch) {
                jsonString = markdownMatch[1];
            } else {
                // Or just remove code ticks if no lang specified
                jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '');
            }

            // Find the first { and last } to isolate the object
            const firstBrace = jsonString.indexOf('{');
            const lastBrace = jsonString.lastIndexOf('}');

            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonString = jsonString.substring(firstBrace, lastBrace + 1);
            }

            const data = JSON.parse(jsonString);
            renderResults(data);

        } catch (error) {
            alert('Something went wrong. Please try again.');
            console.error(error);
        } finally {
            setLoading(false);
        }
    }

    function setLoading(isLoading) {
        if (isLoading) {
            loader.classList.remove('hidden');
            analyzeBtn.disabled = true;
            analyzeBtn.innerText = 'Analyzing...';
        } else {
            loader.classList.add('hidden');
            analyzeBtn.disabled = false;
            analyzeBtn.innerText = 'Analyze';
        }
    }

    function renderResults(data) {
        // Expecting data structure: { analysis: { pros: [], cons: [] } }
        const { pros, cons } = data.analysis;

        // Render Pros
        if (pros && pros.length > 0) {
            pros.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                prosList.appendChild(li);
            });
        }

        // Render Cons
        if (cons && cons.length > 0) {
            cons.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                consList.appendChild(li);
            });
        }

        resultsSection.classList.remove('hidden');
    }
});
