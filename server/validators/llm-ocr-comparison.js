/**
 * Compare Qwen LLM output against OCR baseline
 * Detects hallucinations and discrepancies
 */

/**
 * Calculate simple text similarity between two strings
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @returns {number} Similarity score 0-1
 */
function calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
}

/**
 * Build complete text from Qwen structured JSON
 * Includes headers, body, and table descriptions for fair comparison
 * @param {Object} qwenOutput - Qwen extraction result
 * @returns {string} Complete text representation
 */
function buildFullQwenText(qwenOutput) {
    const parts = [];

    // Add headers if present
    if (qwenOutput.headers && Array.isArray(qwenOutput.headers)) {
        qwenOutput.headers.forEach(header => {
            if (header && header.trim()) {
                parts.push(header.trim());
            }
        });
    }

    // Add body text
    if (qwenOutput.body_text && qwenOutput.body_text.trim()) {
        parts.push(qwenOutput.body_text.trim());
    }

    // Add figure/table descriptions
    if (qwenOutput.figures_or_tables && Array.isArray(qwenOutput.figures_or_tables)) {
        qwenOutput.figures_or_tables.forEach(item => {
            if (item.description && item.description.trim()) {
                parts.push(item.description.trim());
            }
        });
    }

    return parts.join(' ');
}

/**
 * Compare Qwen output vs OCR baseline
 * Identifies potential hallucinations and discrepancies
 * @param {Object} qwenOutput - Qwen extraction result
 * @param {Object} ocrBaseline - Combined OCR results
 * @returns {Object} Detailed comparison
 */
function compareLLMtoOCR(qwenOutput, ocrBaseline) {
    // Build complete text from Qwen JSON (headers + body + tables)
    const qwenText = buildFullQwenText(qwenOutput);
    const ocrText = ocrBaseline.paddle_result?.full_text || '';

    // Safety check
    if (!qwenText || !ocrText) {
        return {
            qwen_word_count: 0,
            ocr_word_count: 0,
            word_count_discrepancy_pct: 0,
            text_similarity_score: 0,
            flags: {},
            hallucination_risk: 0,
            summary: 'Insufficient data for comparison'
        };
    }

    const qwenWords = qwenText.split(/\s+/).filter(w => w.length > 0).length;
    const ocrWords = ocrText.split(/\s+/).filter(w => w.length > 0).length;

    const diff = Math.abs(qwenWords - ocrWords);
    const denominator = Math.max(ocrWords, 1);
    const discrepancyPct = Math.round((diff / denominator) * 100);

    const textSimilarity = calculateTextSimilarity(qwenText, ocrText);

    const flags = {
        llm_adds_extra_text: qwenWords > ocrWords * 1.2,
        llm_removes_text: qwenWords < ocrWords * 0.8,
        moderate_difference: discrepancyPct > 20,
        high_similarity: textSimilarity > 0.75,
        low_similarity: textSimilarity < 0.5
    };

    // Calculate hallucination risk
    let hallucination_risk = 0;
    if (flags.llm_adds_extra_text) hallucination_risk += 0.3;
    if (flags.moderate_difference && !flags.high_similarity) hallucination_risk += 0.4;
    if (discrepancyPct > 50) hallucination_risk += 0.3;

    hallucination_risk = Math.min(hallucination_risk, 1.0);

    return {
        qwen_word_count: qwenWords,
        ocr_word_count: ocrWords,
        word_count_discrepancy_pct: discrepancyPct,
        text_similarity_score: Math.round(textSimilarity * 100) / 100,
        flags: flags,
        hallucination_risk: Math.round(hallucination_risk * 100) / 100,
        summary: generateComparisonSummary(flags, discrepancyPct, textSimilarity)
    };
}

/**
 * Generate human-readable summary of comparison
 * @param {Object} flags - Flag object
 * @param {number} discrepancyPct - Discrepancy percentage
 * @param {number} textSimilarity - Text similarity score
 * @returns {string} Summary message
 */
function generateComparisonSummary(flags, discrepancyPct, textSimilarity) {
    if (flags.high_similarity && !flags.moderate_difference) {
        return 'Excellent alignment between Qwen and OCR';
    }

    if (flags.llm_adds_extra_text) {
        return `WARNING: Qwen extracted ${discrepancyPct}% more text than OCR. Possible hallucination.`;
    }

    if (flags.llm_removes_text) {
        return `WARNING: Qwen extracted ${discrepancyPct}% less text than OCR. Possible content loss.`;
    }

    if (flags.low_similarity) {
        return `CAUTION: Low text similarity (${Math.round(textSimilarity * 100)}%) despite word count match.`;
    }

    if (flags.moderate_difference) {
        return `Moderate difference detected (${discrepancyPct}% discrepancy). Review flagged sections.`;
    }

    return 'Comparison complete. No major discrepancies detected.';
}

module.exports = {
    calculateTextSimilarity,
    compareLLMtoOCR,
    generateComparisonSummary,
    buildFullQwenText
};
