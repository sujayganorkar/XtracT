/**
 * Decision gate for determining if and how Qwen should be invoked
 * Core intelligence: when to call the expensive LLM
 */

// Configuration thresholds - optimized for 98%/95%/93% accuracy targets
const CONFIDENCE_THRESHOLDS = {
    EXCELLENT: 0.98,                      // >= 98% = OCR only (trust completely)
    HIGH: 0.95,                           // >= 95% = Qwen validation (invoke for safety)
    MEDIUM: 0.93,                         // >= 93% = Qwen validation with caution
    LOW: 0.93,                            // < 93% = Qwen + zoom-reads (full treatment)
    CHAR_SIMILARITY_MIN: 0.98,            // 98%+ character match required for OCR-only
    WORD_DISCREPANCY_MAX: 0.02,           // Max 2% word count difference for OCR-only
    DISCREPANCY_WARNING: 0.05,            // OCR engines < 5% diff = trust
    DISCREPANCY_CRITICAL: 0.07,           // OCR engines > 7% diff = call Qwen
    LOW_REGION_THRESHOLD: 0.93,           // Flag region < 93% confidence
    MAX_LOW_REGIONS_FOR_VALIDATION: 2     // More than 2 low-confidence regions = zoom-reads
};

/**
 * Safely extract properties from OCR baseline with fallback defaults
 * Prevents runtime errors when PaddleOCR or alignment fails
 * @param {Object} ocrBaseline - Combined OCR results
 * @returns {Object} Safe properties with defaults
 */
function extractSafeProperties(ocrBaseline) {
    const safeDefaults = {
        paddle_result: ocrBaseline.paddle_result || {
            full_text: '',
            regions: [],
            overall_confidence: 0
        },
        tesseract_result: ocrBaseline.tesseract_result || {
            text: '',
            confidence: 0
        },
        alignment: ocrBaseline.alignment || {
            char_similarity: 0,
            word_discrepancy_pct: 100,
            agreement_level: 'low'
        },
        combined_confidence: ocrBaseline.combined_confidence || 0
    };

    // Ensure paddle_result has required nested properties
    if (!safeDefaults.paddle_result.regions) {
        safeDefaults.paddle_result.regions = [];
    }
    if (typeof safeDefaults.paddle_result.overall_confidence !== 'number') {
        safeDefaults.paddle_result.overall_confidence = 0;
    }

    return safeDefaults;
}

/**
 * Determine if Qwen should be invoked and in what mode
 * HYBRID APPROACH: Combines confidence, character similarity, and word count matching
 * Targets: 98%+ = trust OCR, 95%+ = validation, 93%+ = caution, <93% = full treatment
 * @param {Object} ocrBaseline - Combined OCR results with alignment stats
 * @returns {Object} Decision with reasoning
 */
function decideQwenInvocation(ocrBaseline) {
    // Apply safe defaults to prevent null reference errors
    const safeBaseline = extractSafeProperties(ocrBaseline);

    const {
        paddle_result,
        tesseract_result,
        alignment,
        combined_confidence
    } = safeBaseline;

    // Extract key metrics for hybrid validation
    const overallConfidence = combined_confidence;
    const charSimilarity = alignment.char_similarity;
    const wordDiscrepancyPct = alignment.word_discrepancy_pct;
    const agreementLevel = alignment.agreement_level;

    const lowConfidenceRegions = paddle_result.regions ?
        paddle_result.regions.filter(r => r.confidence < CONFIDENCE_THRESHOLDS.LOW_REGION_THRESHOLD) :
        [];

    const decision = {
        should_invoke_qwen: false,
        invoke_mode: 'none', // 'none' | 'validation' | 'zoom_reads'
        reason: '',
        confidence_score: overallConfidence,
        char_similarity: charSimilarity,
        estimated_qwen_calls: 0,
        estimated_time_ms: 0,
        gate_triggered: [] // Which gate(s) triggered the decision
    };

    // HYBRID GATE 1: EXCELLENT (98%+) - Trust OCR completely
    // Requirements: High confidence + High char similarity + Low word discrepancy + No problem regions
    const wordCountMatch = wordDiscrepancyPct <= (CONFIDENCE_THRESHOLDS.WORD_DISCREPANCY_MAX * 100);
    const charMatch = charSimilarity >= CONFIDENCE_THRESHOLDS.CHAR_SIMILARITY_MIN;
    const bothHighConfidence = (paddle_result.overall_confidence || 0) >= 0.98 &&
                               (tesseract_result.confidence || 0) >= 0.98;

    if (overallConfidence >= CONFIDENCE_THRESHOLDS.EXCELLENT &&
        charMatch &&
        wordCountMatch &&
        bothHighConfidence &&
        lowConfidenceRegions.length === 0) {
        decision.reason = `Excellent OCR quality: ${Math.round(overallConfidence * 100)}% confidence, ${Math.round(charSimilarity * 100)}% character match - Skip Qwen`;
        decision.gate_triggered.push('gate1_excellent_98plus');
        decision.estimated_time_ms = 10; // Just OCR
        return decision;
    }

    // HYBRID GATE 2: HIGH (95-98%) - Invoke Qwen for validation
    if (overallConfidence >= CONFIDENCE_THRESHOLDS.HIGH &&
        overallConfidence < CONFIDENCE_THRESHOLDS.EXCELLENT) {
        decision.should_invoke_qwen = true;
        decision.invoke_mode = 'validation';
        decision.reason = `Good OCR quality (${Math.round(overallConfidence * 100)}%), but below 98% threshold - Qwen validation recommended`;
        decision.gate_triggered.push('gate2_high_95to98');
        decision.estimated_qwen_calls = 1;
        decision.estimated_time_ms = 180;
        return decision;
    }

    // HYBRID GATE 3: MEDIUM (93-95%) - Invoke Qwen with caution
    if (overallConfidence >= CONFIDENCE_THRESHOLDS.MEDIUM &&
        overallConfidence < CONFIDENCE_THRESHOLDS.HIGH) {
        decision.should_invoke_qwen = true;
        decision.invoke_mode = 'validation';
        decision.reason = `Moderate OCR quality (${Math.round(overallConfidence * 100)}%) - Qwen validation needed`;
        decision.gate_triggered.push('gate3_medium_93to95');
        decision.estimated_qwen_calls = 1;
        decision.estimated_time_ms = 180;
        return decision;
    }

    // HYBRID GATE 4: LOW (<93%) - Full Qwen treatment with zoom-reads
    if (overallConfidence < CONFIDENCE_THRESHOLDS.MEDIUM ||
        lowConfidenceRegions.length > CONFIDENCE_THRESHOLDS.MAX_LOW_REGIONS_FOR_VALIDATION ||
        agreementLevel === 'low') {
        decision.should_invoke_qwen = true;
        decision.invoke_mode = 'zoom_reads';
        decision.reason = `Low OCR quality (${Math.round(overallConfidence * 100)}%) or multiple problem regions - Full Qwen treatment with zoom-reads`;
        decision.gate_triggered.push('gate4_low_below93');
        const zoomCount = Math.min(lowConfidenceRegions.length, 3);
        decision.estimated_qwen_calls = 1 + zoomCount; // 1 full-page + up to 3 zooms
        decision.estimated_time_ms = 170 + (50 * zoomCount);
        return decision;
    }

    // HYBRID GATE 5: Character similarity check (fallback)
    if (charSimilarity < CONFIDENCE_THRESHOLDS.CHAR_SIMILARITY_MIN) {
        decision.should_invoke_qwen = true;
        decision.invoke_mode = 'validation';
        decision.reason = `OCR engines disagree (${Math.round(charSimilarity * 100)}% similarity) - Qwen tiebreaker needed`;
        decision.gate_triggered.push('gate5_low_char_similarity');
        decision.estimated_qwen_calls = 1;
        decision.estimated_time_ms = 180;
        return decision;
    }

    // Default fallback
    return decision;
}

/**
 * Get explanation of why a decision was made
 * Useful for debugging and understanding the system
 * @param {Object} decision - Decision object from decideQwenInvocation
 * @returns {string} Human-readable explanation
 */
function explainDecision(decision) {
    const { invoke_mode, reason, estimated_qwen_calls, estimated_time_ms } = decision;

    let explanation = `Decision: ${invoke_mode.toUpperCase()}\n`;
    explanation += `Reason: ${reason}\n`;

    if (invoke_mode === 'none') {
        explanation += `Expected time: ~10 seconds (OCR only)\n`;
        explanation += `Qwen calls: 0\n`;
    } else if (invoke_mode === 'validation') {
        explanation += `Expected time: ~${estimated_time_ms}ms\n`;
        explanation += `Qwen calls: ${estimated_qwen_calls} (full-page validation)\n`;
        explanation += `Strategy: Use OCR as foundation, validate with Qwen\n`;
    } else if (invoke_mode === 'zoom_reads') {
        explanation += `Expected time: ~${estimated_time_ms}ms\n`;
        explanation += `Qwen calls: ${estimated_qwen_calls} (1 full-page + ${estimated_qwen_calls - 1} zoom-reads)\n`;
        explanation += `Strategy: Full Qwen treatment with focused zoom-reads on problem areas\n`;
    }

    return explanation;
}

module.exports = {
    CONFIDENCE_THRESHOLDS,
    decideQwenInvocation,
    explainDecision,
    extractSafeProperties
};
