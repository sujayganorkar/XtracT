/**
 * Intelligently merge OCR and Qwen results based on invocation mode
 * Three strategies depending on how much Qwen was involved
 */

/**
 * Merge results based on invocation mode
 * @param {Object} ocrBaseline - OCR results
 * @param {Object} qwenOutput - Qwen results (may be null)
 * @param {string} invocationMode - 'none' | 'validation' | 'zoom_reads'
 * @returns {Object} Merged final result
 */
function mergeResults(ocrBaseline, qwenOutput, invocationMode) {
    if (invocationMode === 'none') {
        return mergeOCROnly(ocrBaseline);
    } else if (invocationMode === 'validation') {
        return mergeWithQwenValidation(ocrBaseline, qwenOutput);
    } else if (invocationMode === 'zoom_reads') {
        return mergeWithZoomReads(ocrBaseline, qwenOutput);
    }

    throw new Error(`Unknown invocation mode: ${invocationMode}`);
}

/**
 * Strategy 1: Use OCR directly (no Qwen invoked)
 * @param {Object} ocrBaseline - OCR results
 * @returns {Object} Final merged result
 */
function mergeOCROnly(ocrBaseline) {
    const ocrText = ocrBaseline.paddle_result.full_text || '';

    return {
        final_text: ocrText,
        source: 'ocr_only',
        confidence_score: ocrBaseline.combined_confidence,
        extraction_method: 'PaddleOCR + Tesseract baseline (OCR only)',
        details: {
            primary_source: 'PaddleOCR',
            validation_source: 'Tesseract cross-check',
            qwen_invoked: false,
            qwen_calls: 0
        }
    };
}

/**
 * Strategy 2: Use OCR as foundation, enhanced with Qwen validation
 * Qwen was invoked once for full-page validation
 * @param {Object} ocrBaseline - OCR results
 * @param {Object} qwenOutput - Qwen full-page result
 * @returns {Object} Final merged result
 */
function mergeWithQwenValidation(ocrBaseline, qwenOutput) {
    const ocrText = ocrBaseline.paddle_result.full_text || '';

    // Build full Qwen text (import from llm-ocr-comparison)
    const { buildFullQwenText } = require('../validators/llm-ocr-comparison');
    const qwenText = buildFullQwenText(qwenOutput);

    // Intelligent blending with hallucination detection
    const blendResult = blendTexts(ocrText, qwenText, ocrBaseline);

    // Calculate merged confidence based on blend result
    const ocrConfidence = ocrBaseline.combined_confidence;
    let mergedConfidence;

    if (blendResult.source === 'qwen_validated') {
        // High trust in Qwen
        mergedConfidence = (ocrConfidence * 0.4) + (0.85 * 0.6);
    } else {
        // Fell back to OCR
        mergedConfidence = ocrConfidence;
    }

    return {
        final_text: blendResult.text,
        source: blendResult.source,
        confidence_score: Math.round(mergedConfidence * 100) / 100,
        extraction_method: 'OCR baseline + Qwen validation (bag-of-words validated)',
        details: {
            primary_source: 'PaddleOCR',
            validation_source: 'Qwen full-page',
            qwen_invoked: true,
            qwen_calls: 1,
            blend_strategy: blendResult.strategy,
            support_rate: blendResult.support_rate,
            hallucination_risk: blendResult.hallucination_risk,
            warning: blendResult.warning
        }
    };
}

/**
 * Strategy 3: Merge OCR + Qwen full-page + Qwen zoom-reads
 * Most comprehensive approach for difficult documents
 * @param {Object} ocrBaseline - OCR results
 * @param {Object} qwenOutput - Qwen result with zoom_reads array
 * @returns {Object} Final merged result
 */
function mergeWithZoomReads(ocrBaseline, qwenOutput) {
    const ocrRegions = ocrBaseline.paddle_result.regions || [];
    const zoomReads = qwenOutput.zoom_reads || [];

    // Create a map of region_id to zoom_read result for quick lookup
    const zoomMap = {};
    zoomReads.forEach(zoom => {
        zoomMap[zoom.region_id] = zoom;
    });

    // Reconstruct text using OCR regions, replacing with zoom results where available
    let finalText = '';

    for (const region of ocrRegions) {
        if (zoomMap[region.region_id] && zoomMap[region.region_id].improved) {
            // Use zoom-read result if it improved the region
            finalText += zoomMap[region.region_id].zoom_read_text + ' ';
        } else {
            // Use original OCR region
            finalText += region.text + ' ';
        }
    }

    // If zoom-reads don't fully cover, add Qwen full-page insights
    const qwenText = qwenOutput.body_text || '';
    if (qwenText && !finalText.includes(qwenText)) {
        finalText += '\n[Qwen Full-Page Insights]\n' + qwenText;
    }

    // Calculate merged confidence
    // More aggressive use of Qwen here since we're handling difficult content
    const ocrConfidence = ocrBaseline.combined_confidence;
    const mergedConfidence = (ocrConfidence * 0.4) + (0.75 * 0.6); // Favor Qwen in zoom mode

    return {
        final_text: finalText.trim(),
        source: 'hybrid_ocr_qwen',
        confidence_score: Math.round(mergedConfidence * 100) / 100,
        extraction_method: 'OCR baseline + Qwen full-page + Qwen zoom-reads',
        details: {
            primary_source: 'PaddleOCR',
            validation_source: 'Qwen full-page',
            enhancement_source: `Qwen zoom-reads (${zoomReads.length} regions)`,
            qwen_invoked: true,
            qwen_calls: 1 + zoomReads.length,
            regions_improved_by_zoom: zoomReads.filter(z => z.improved).length
        }
    };
}

/**
 * Build bag-of-words set from OCR text for validation
 * @param {string} ocrText - Raw OCR text
 * @returns {Set<string>} Set of normalized words
 */
function buildOCRBagOfWords(ocrText) {
    return new Set(
        ocrText
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 0)
    );
}

/**
 * Check if text is supported by OCR bag-of-words
 * Detects hallucinations by verifying words exist in OCR source
 * @param {string} text - Text to validate
 * @param {Set<string>} ocrWords - OCR word set
 * @returns {Object} Validation result
 */
function validateAgainstOCR(text, ocrWords) {
    const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3); // Only check substantial words

    let unsupportedWords = 0;
    const riskyWords = [];

    for (const word of words) {
        if (!ocrWords.has(word)) {
            // Word not in OCR - potential hallucination
            unsupportedWords++;
            if (riskyWords.length < 10) {
                riskyWords.push(word);
            }
        }
    }

    const supportRate = words.length > 0
        ? 1 - (unsupportedWords / words.length)
        : 0;

    return {
        support_rate: supportRate,
        unsupported_count: unsupportedWords,
        total_words: words.length,
        risky_words: riskyWords,
        is_valid: supportRate > 0.80 // 80% of words must be in OCR
    };
}

/**
 * Intelligently blend OCR and Qwen text using bag-of-words validation
 * Prevents duplication and hallucinations
 * @param {string} ocrText - OCR baseline text
 * @param {string} qwenText - Qwen validation text
 * @param {Object} ocrBaseline - Full OCR baseline for context
 * @returns {Object} Merged text with metadata
 */
function blendTexts(ocrText, qwenText, ocrBaseline) {
    // Build OCR bag-of-words for validation
    const ocrWords = buildOCRBagOfWords(ocrText);

    // Validate Qwen text against OCR
    const qwenValidation = validateAgainstOCR(qwenText, ocrWords);

    // Decision logic based on validation
    if (qwenValidation.is_valid) {
        // Qwen text is well-supported by OCR - use it
        return {
            text: qwenText,
            source: 'qwen_validated',
            strategy: 'Used Qwen text (validated against OCR)',
            support_rate: qwenValidation.support_rate,
            hallucination_risk: 1 - qwenValidation.support_rate
        };
    } else if (qwenValidation.support_rate > 0.60) {
        // Partial support - use OCR but note Qwen added structure
        return {
            text: ocrText,
            source: 'ocr_primary',
            strategy: 'Used OCR text (Qwen had low support)',
            support_rate: 1.0, // OCR is ground truth
            hallucination_risk: 0,
            warning: `Qwen had ${qwenValidation.unsupported_count} unsupported words: ${qwenValidation.risky_words.slice(0, 5).join(', ')}`
        };
    } else {
        // High hallucination risk - use OCR only
        return {
            text: ocrText,
            source: 'ocr_only',
            strategy: 'Used OCR only (Qwen failed validation)',
            support_rate: 1.0,
            hallucination_risk: 1 - qwenValidation.support_rate,
            warning: `Qwen had HIGH hallucination risk. Risky words: ${qwenValidation.risky_words.slice(0, 5).join(', ')}`
        };
    }
}

module.exports = {
    mergeResults,
    mergeOCROnly,
    mergeWithQwenValidation,
    mergeWithZoomReads,
    blendTexts,
    buildOCRBagOfWords,
    validateAgainstOCR
};
