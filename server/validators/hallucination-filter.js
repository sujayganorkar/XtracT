/**
 * Detect potential hallucinations in Qwen output
 * Compares Qwen text against OCR-detected regions
 */

/**
 * Simple string similarity using Levenshtein-like approach
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score 0-1
 */
function stringSimilarity(str1, str2) {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();

    // Character-level comparison
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    const editDistance = getEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate edit distance between two strings
 * @param {string} s1
 * @param {string} s2
 * @returns {number} Edit distance
 */
function getEditDistance(s1, s2) {
    const costs = [];

    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }

    return costs[s2.length];
}

/**
 * Detect potential hallucinations in Qwen output
 * Checks if Qwen text is supported by OCR regions
 * @param {string} qwenText - Full text from Qwen
 * @param {Array} ocrRegions - Regions detected by PaddleOCR
 * @param {number} similarityThreshold - Threshold for considering text as "supported" (default 0.7)
 * @returns {Object} Hallucination detection result
 */
function detectHallucinations(qwenText, ocrRegions, similarityThreshold = 0.7) {
    if (!qwenText || !ocrRegions || ocrRegions.length === 0) {
        return {
            hallucination_count: 0,
            hallucination_risk: 0,
            flagged: false,
            potential_hallucinations: [],
            analysis: 'Insufficient data for hallucination detection'
        };
    }

    // Build combined OCR text for reference
    const ocrTexts = ocrRegions.map(r => r.text);

    // Split Qwen text into sentences
    const qwenSentences = qwenText
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 10); // Only consider substantial sentences

    const hallucinations = [];
    const supportedSentences = 0;

    for (const sentence of qwenSentences) {
        // Check if sentence is supported by any OCR region
        const hasOCRSupport = ocrTexts.some(ocrText =>
            stringSimilarity(sentence, ocrText) > similarityThreshold
        );

        if (!hasOCRSupport) {
            hallucinations.push({
                text: sentence,
                likely_hallucinated: true,
                ocr_support: false,
                confidence: 0
            });
        }
    }

    // Calculate hallucination risk
    const hallucination_risk = qwenSentences.length > 0
        ? hallucinations.length / qwenSentences.length
        : 0;

    return {
        hallucination_count: hallucinations.length,
        hallucination_risk: Math.round(hallucination_risk * 100) / 100,
        flagged: hallucinations.length > 0,
        total_sentences_analyzed: qwenSentences.length,
        supported_sentences: qwenSentences.length - hallucinations.length,
        potential_hallucinations: hallucinations.slice(0, 10), // Return first 10 for brevity
        summary: generateHallucinationSummary(hallucinations, qwenSentences.length)
    };
}

/**
 * Generate summary of hallucination detection
 * @param {Array} hallucinations - Detected hallucinations
 * @param {number} totalSentences - Total sentences analyzed
 * @returns {string} Summary message
 */
function generateHallucinationSummary(hallucinations, totalSentences) {
    if (hallucinations.length === 0) {
        return 'No hallucinations detected. All content supported by OCR.';
    }

    const percentage = Math.round((hallucinations.length / totalSentences) * 100);

    if (hallucinations.length === 1) {
        return `1 potential hallucination detected (${percentage}% of content).`;
    }

    if (percentage > 50) {
        return `CRITICAL: ${hallucinations.length} potential hallucinations detected (${percentage}% of content). Review carefully.`;
    }

    if (percentage > 20) {
        return `WARNING: ${hallucinations.length} potential hallucinations detected (${percentage}% of content).`;
    }

    return `${hallucinations.length} potential hallucinations detected (${percentage}% of content). Minor concern.`;
}

module.exports = {
    detectHallucinations,
    stringSimilarity,
    generateHallucinationSummary
};
