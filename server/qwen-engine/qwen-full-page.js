const axios = require('axios');

/**
 * Run Qwen on full-page image for complete extraction
 * @param {string} base64Image - Base64 encoded image
 * @returns {Promise<Object>} Structured JSON extraction
 */
async function runQwenFullPage(base64Image) {
    try {
        const prompt = `
Analyze this academic document image. Extract the content into a structured JSON format.
STRICTLY follow this JSON schema and return ONLY valid JSON (no markdown, no code blocks):

{
  "page_number": "Integer or null",
  "headers": ["List of section headers"],
  "body_text": "Main content text combined",
  "key_terms": ["List of 3-5 keywords"],
  "figures_or_tables": [
      { "type": "chart/table/image", "description": "Brief description" }
  ]
}

If a section is missing, use empty arrays/null.
Focus on accuracy over completeness. Do NOT hallucinate content that is not visible.
`;

        const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        const response = await axios.post(`${ollamaBaseUrl}/api/generate`, {
            model: 'qwen2.5vl:7b',
            prompt: prompt,
            images: [base64Image],
            stream: false,
            format: 'json',
            options: {
                temperature: 0,  // Deterministic output
                seed: 42         // Fixed random seed
            }
        }, { timeout: 300000 }); // 5 minute timeout for Qwen

        const qwenOutput = JSON.parse(response.data.response);

        return {
            ...qwenOutput,
            _metadata: {
                invocation_type: 'full-page',
                timestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        console.error('Qwen full-page error:', error.message);
        throw new Error(`Qwen full-page extraction failed: ${error.message}`);
    }
}

/**
 * Run Qwen on a cropped region (zoom-read)
 * Used for re-analyzing low-confidence areas identified by OCR
 * @param {string} base64Image - Base64 encoded cropped image
 * @param {Object} region - Region metadata {region_id, bbox, text, confidence}
 * @returns {Promise<Object>} Extracted text for this region
 */
async function runQwenZoomRead(base64Image, region) {
    try {
        const prompt = `
Extract the text from this document region carefully.
Be precise, focus on what you actually see, and do NOT hallucinate.
Return ONLY the extracted text, no JSON, no formatting.
`;

        const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        const response = await axios.post(`${ollamaBaseUrl}/api/generate`, {
            model: 'qwen2.5vl:7b',
            prompt: prompt,
            images: [base64Image],
            stream: false,
            options: {
                temperature: 0,  // Deterministic output
                seed: 42         // Fixed random seed
            }
        }, { timeout: 300000 }); // 5 minute timeout

        const extractedText = response.data.response.trim();

        return {
            region_id: region.region_id,
            original_text: region.text,
            original_confidence: region.confidence,
            zoom_read_text: extractedText,
            zoom_read_confidence: 0.8, // Zoom-reads are more focused, thus more confident
            improved: extractedText.length > region.text.length * 0.8,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        console.error('Qwen zoom-read error:', error.message);
        throw new Error(`Qwen zoom-read extraction failed: ${error.message}`);
    }
}

module.exports = {
    runQwenFullPage,
    runQwenZoomRead
};
