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

            const data = await response.json();
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
