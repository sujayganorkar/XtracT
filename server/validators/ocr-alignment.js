/**
 * Compare outputs from different OCR engines
 * Detects when engines disagree significantly
 */

/**
 * Calculate Levenshtein distance (character-level similarity)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;

    // Create 2D array for dynamic programming
    const dp = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

    // Initialize base cases
    for (let i = 0; i <= len1; i++) dp[i][0] = i;
    for (let j = 0; j <= len2; j++) dp[0][j] = j;

    // Fill the dp table
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,      // deletion
                    dp[i][j - 1] + 1,      // insertion
                    dp[i - 1][j - 1] + 1   // substitution
                );
            }
        }
    }

    return dp[len1][len2];
}

/**
 * Calculate character-level similarity score (0-1)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (1.0 = identical, 0.0 = completely different)
 */
function calculateCharSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1.0;

    const distance = levenshteinDistance(str1, str2);
    const maxLen = Math.max(str1.length, str2.length);

    if (maxLen === 0) return 1.0;

    const similarity = 1 - (distance / maxLen);
    return Math.max(0, Math.min(1, similarity)); // Clamp between 0 and 1
}

/**
 * Compare PaddleOCR and Tesseract word counts and text alignment
 * Enhanced with character-level similarity for 98%+ accuracy target
 * @param {Object} paddleResult - PaddleOCR output object
 * @param {Object} tesseractResult - Tesseract result object with text and confidence
 * @returns {Object} Detailed comparison metrics
 */
function compareOCREngines(paddleResult, tesseractResult) {
    const paddleText = paddleResult.full_text || '';
    const tesseractText = tesseractResult.text || '';

    const paddleWords = paddleText.split(/\s+/).filter(w => w.length > 0).length;
    const tessWords = tesseractText.split(/\s+/).filter(w => w.length > 0).length;

    // Word count comparison
    const wordDiff = Math.abs(paddleWords - tessWords);
    const maxWordCount = Math.max(paddleWords, tessWords, 1);
    const wordDiscrepancyPct = (wordDiff / maxWordCount) * 100;
    const normalizedWordDiscrepancy = Math.min(wordDiscrepancyPct / 100, 1);

    // Character-level similarity (NEW - for 98%+ accuracy)
    const charSimilarity = calculateCharSimilarity(paddleText.toLowerCase(), tesseractText.toLowerCase());
    const charSimilarityPct = Math.round(charSimilarity * 100);

    // Hybrid confidence scoring
    // Uses both word count match AND character similarity
    const wordCountMatch = wordDiscrepancyPct < 3; // 3% tolerance for 97%+ word accuracy
    const charMatch = charSimilarity >= 0.98; // 98%+ character accuracy

    // Determine agreement level with strict thresholds
    let agreementLevel;
    if (charSimilarity >= 0.98 && wordDiscrepancyPct < 2) {
        agreementLevel = 'excellent'; // 98%+ - trust OCR completely
    } else if (charSimilarity >= 0.95 && wordDiscrepancyPct < 5) {
        agreementLevel = 'high'; // 95%+ - invoke Qwen validation
    } else if (charSimilarity >= 0.93 && wordDiscrepancyPct < 7) {
        agreementLevel = 'medium'; // 93%+ - invoke Qwen with caution
    } else {
        agreementLevel = 'low'; // <93% - full Qwen treatment
    }

    return {
        paddle_word_count: paddleWords,
        tesseract_word_count: tessWords,
        word_discrepancy_pct: Math.round(wordDiscrepancyPct * 10) / 10,
        normalized_word_discrepancy: Math.round(normalizedWordDiscrepancy * 100) / 100,
        char_similarity: charSimilarity,
        char_similarity_pct: charSimilarityPct,
        word_count_match: wordCountMatch,
        char_match: charMatch,
        agreement_level: agreementLevel,
        paddle_longer: paddleWords > tessWords,
        difference_in_words: wordDiff
    };
}

/**
 * Identify low-confidence regions from PaddleOCR
 * @param {Object} paddleResult - PaddleOCR output
 * @param {number} threshold - Confidence threshold (default 0.65)
 * @returns {Array} Low-confidence regions
 */
function identifyLowConfidenceRegions(paddleResult, threshold = 0.65) {
    if (!paddleResult.regions || paddleResult.regions.length === 0) {
        return [];
    }

    return paddleResult.regions.filter(region => region.confidence < threshold);
}

/**
 * Calculate final confidence score based on both OCR engines
 * Enhanced with Tesseract confidence and character-level similarity
 * @param {Object} paddleResult - PaddleOCR output
 * @param {Object} tesseractResult - Tesseract result with confidence
 * @param {Object} alignment - Alignment comparison result
 * @returns {number} Combined confidence score (0-1)
 */
function calculateCombinedConfidence(paddleResult, tesseractResult, alignment) {
    const paddleConfidence = paddleResult.overall_confidence || 0;
    const tesseractConfidence = tesseractResult.confidence || 0;
    const charSimilarity = alignment.char_similarity || 0;

    // Hybrid confidence calculation for 98%+ accuracy:
    // - 40% PaddleOCR confidence (structured OCR with bbox)
    // - 30% Tesseract confidence (cross-validation)
    // - 30% Character-level similarity (exact match verification)
    const combinedConfidence =
        (paddleConfidence * 0.40) +
        (tesseractConfidence * 0.30) +
        (charSimilarity * 0.30);

    return Math.round(combinedConfidence * 1000) / 1000; // 3 decimal precision
}

module.exports = {
    compareOCREngines,
    identifyLowConfidenceRegions,
    calculateCombinedConfidence
};
