const axios = require('axios');
const spellcheck = require('simple-spellchecker');

// Load dictionary once (mock or real)
let dictionary;
try {
    dictionary = spellcheck.getDictionarySync("en-US");
} catch (e) {
    console.warn("Dictionary not found, using fallback.");
    // Simple fallback: allow all words > 3 chars to pass if dictionary fails
    dictionary = { spellCheck: (w) => true }; 
}

/**
 * Validate text using Heuristic + LLM Strategy
 * @param {string} finalText - The final merged text to validate
 * @param {string} rawOcrText - The raw OCR text (ground truth bag-of-words)
 * @returns {Promise<Object>} Validated and potentially corrected text
 */
async function runAgenticJudge(finalText, rawOcrText) {
    // 1. Heuristic Check (Fast)
    // Check if words in final text exist in OCR raw text (fuzzy match)
    // or are valid dictionary words.
    const words = finalText.split(/\s+/);
    const ocrBagOfWords = new Set(rawOcrText.toLowerCase().split(/\s+/));
    
    const riskyWords = words.filter(w => {
        const cleanW = w.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanW.length < 4) return false; // Skip short words
        
        const inDict = dictionary.spellCheck(cleanW);
        const inOCR = ocrBagOfWords.has(cleanW); // Simple exact match check
        
        // Flag if NEITHER in dictionary NOR in OCR source
        return !inDict && !inOCR;
    });
    
    const validityScore = 1 - (riskyWords.length / words.length);

    // 2. Decision Gate
    if (validityScore > 0.98) {
        return {
            final_text: finalText,
            judge_action: 'approved',
            validity_score: validityScore,
            corrections: []
        };
    }

    // 3. LLM Correction (Deep Check)
    console.log(`[JUDGE] Low validity (${Math.round(validityScore*100)}%). Risky words: ${riskyWords.slice(0,5)}. Invoking Agent...`);
    
    const correction = await runAgentCorrection(finalText, riskyWords, rawOcrText);
    
    return {
        final_text: correction.text,
        judge_action: 'corrected',
        validity_score: validityScore, // Score *before* correction
        corrections: correction.changes
    };
}

async function runAgentCorrection(text, riskyWords, context) {
    const prompt = `
You are a strict text validator. 
The following text may contain hallucinations or OCR errors.
Risky words detected: "${riskyWords.join(', ')}".

Context from raw OCR:
"${context.substring(0, 1000)}..."

Task:
1. Check if the risky words are valid in context.
2. If they are hallucinations, remove or fix them based on the OCR context.
3. Return ONLY the corrected text. Do not add explanations.

Text to Fix:
${text}
`;

    try {
        const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        // Use temperature 0 for deterministic correction
        const response = await axios.post(`${ollamaBaseUrl}/api/generate`, {
            model: 'qwen2.5vl:7b',
            prompt: prompt,
            stream: false,
            options: { temperature: 0, seed: 42 }
        });
        
        return {
            text: response.data.response.trim(),
            changes: riskyWords // Tracking
        };
    } catch (e) {
        console.error("Agent correction failed", e);
        return { text: text, changes: [] }; // Fallback to original
    }
}

module.exports = { runAgenticJudge };