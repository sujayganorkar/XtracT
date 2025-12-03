const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Run PaddleOCR on image and return structured regions with confidence
 * @param {string} imagePath - Path to image file
 * @returns {Promise<Object>} Structured OCR result with regions, layout, confidence
 */
async function runPaddleOCR(imagePath) {
    return new Promise((resolve, reject) => {
        const pythonScript = path.join(__dirname, '..', 'scripts', 'paddle_ocr_runner.py');

        // Spawn Python subprocess to run PaddleOCR
        // Use 'python3' for Linux containers, fallback to 'python' for Windows
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        const python = spawn(pythonCmd, [pythonScript, imagePath]);
        let output = '';
        let errorOutput = '';

        python.stdout.on('data', (data) => {
            output += data.toString();
        });

        python.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        python.on('close', (code) => {
            if (code !== 0) {
                console.error('PaddleOCR Python error:', errorOutput);
                reject(new Error(`PaddleOCR failed with code ${code}: ${errorOutput}`));
                return;
            }

            try {
                // Locate the JSON object within the potentially noisy output
                const jsonStartIndex = output.indexOf('{');
                const jsonEndIndex = output.lastIndexOf('}');
                
                if (jsonStartIndex === -1 || jsonEndIndex === -1) {
                    throw new Error('No JSON object found in output');
                }

                const jsonString = output.substring(jsonStartIndex, jsonEndIndex + 1);
                const result = JSON.parse(jsonString);
                resolve(result);
            } catch (e) {
                console.error('Failed to parse PaddleOCR output:', output);
                reject(new Error(`Invalid PaddleOCR JSON output: ${e.message}`));
            }
        });

        python.on('error', (err) => {
            reject(new Error(`Failed to spawn PaddleOCR process: ${err.message}`));
        });
    });
}

/**
 * Identify regions with low confidence
 * @param {Array} regions - From PaddleOCR output
 * @param {number} threshold - Confidence threshold (default 0.65)
 * @returns {Array} Low-confidence regions
 */
function getLowConfidenceRegions(regions, threshold = 0.65) {
    return regions.filter(r => r.confidence < threshold);
}

/**
 * Calculate overall confidence from regions
 * @param {Array} regions - From PaddleOCR
 * @returns {number} Overall confidence score (0-1)
 */
function calculateOverallConfidence(regions) {
    if (!regions || regions.length === 0) return 0;

    const sum = regions.reduce((acc, r) => acc + r.confidence, 0);
    return sum / regions.length;
}

module.exports = {
    runPaddleOCR,
    getLowConfidenceRegions,
    calculateOverallConfidence
};
