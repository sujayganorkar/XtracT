# Qwen Image Analyser

**Qwen Image Analyser** is an intelligent OCR extraction tool designed for academic documents. It leverages **Qwen 2.5 VL** (via Ollama) for smart, structured text extraction and uses **Tesseract.js** as a secondary validation layer to ensure data integrity.

## Features

*   **Dual-Engine OCR:**
    *   **Primary (Smart):** Uses `qwen2.5-vl:7b` to analyze layout, headers, body text, and key terms, returning structured JSON.
    *   **Secondary (Validation):** Uses `Tesseract.js` to extract raw text and cross-reference word counts.
*   **Validation Metrics:** Automatically calculates a discrepancy score between the two engines. If the word count difference exceeds 40%, the result is flagged for manual review.
*   **Structured Output:** Returns clean JSON data containing:
    *   Page Number
    *   Headers
    *   Body Text
    *   Key Terms
    *   Figures/Tables metadata
*   **Web Interface:** A clean, responsive React-based UI for batch uploading and viewing results.
*   **Visual Feedback:** Instantly see JSON outputs, validation stats, and confidence flags (Green/Yellow warnings).

## Prerequisites

Before running the application, ensure you have the following installed:

1.  **Node.js** (v16 or higher)
2.  **Ollama** (for running the Qwen model)

### Setting up Ollama
1.  Download and install [Ollama](https://ollama.com/).
2.  Pull the required model:
    ```bash
    ollama pull qwen2.5-vl:7b
    ```
3.  Start the Ollama server (usually runs automatically, or run `ollama serve`).
    *   Ensure it is listening on `http://localhost:11434`.

## Installation

The project is divided into two parts: `server` and `client`. You need to install dependencies for both.

1.  **Clone/Navigate to the project:**
    ```bash
    cd D:\AIModels\qwen-image-analyser
    ```

2.  **Install Server Dependencies:**
    ```bash
    cd server
    npm install
    ```

3.  **Install Client Dependencies:**
    ```bash
    cd ../client
    npm install
    ```

## Usage

### 1. Start the Server
The backend handles file uploads, processes images with Qwen and Tesseract, and serves the results.

```bash
cd D:\AIModels\qwen-image-analyser\server
node index.js
```
*   The server runs on `http://localhost:3000`.

### 2. Start the Client
The frontend provides the user interface.

```bash
cd D:\AIModels\qwen-image-analyser\client
npm run dev
```
*   Open your browser and navigate to the URL shown (usually `http://localhost:5173`).

### 3. Using the Application
1.  Click "Click to Select Images" or drag & drop files.
2.  Click "Extract Text".
3.  View the structured JSON response and validation statistics.
4.  Download the raw JSON file if needed.

## Testing Scripts

The project includes standalone Python and Shell scripts for testing the Qwen model directly without the UI.

*   **Python Test:**
    ```bash
    cd D:\AIModels\qwen-image-analyser
    python test-qwen.py
    ```
    *   *Note:* Ensure the sample image `photo_1_2025-12-02_04-21-11.jpg` exists in the parent `D:\AIModels` directory.

*   **Shell Test:**
    ```bash
    cd D:\AIModels\qwen-image-analyser
    ./test-qwen.sh
    ```

## Project Structure

```
D:\AIModels\qwen-image-analyser\
├── client\                 # React Frontend
│   ├── src\
│   ├── public\
│   └── ...
├── server\                 # Express Backend
│   ├── output\             # Generated JSON & Text files
│   ├── uploads\            # Temp storage for uploads
│   ├── index.js            # Main server entry point
│   └── ...
├── test-qwen.py            # Standalone Python test script
├── test-qwen-image.py      # Alternative Python test script
├── test-qwen.sh            # Bash test script
└── README.md               # This file
```

## Proposed Architecture: Agentic Judge (Stage 4)

The following modules are planned to implement a self-correcting "Judge" that validates text against a dictionary and uses an LLM agent to fix errors. This architecture is inspired by the **Heuristic + LLM** strategy found in the `ExtractThinker` library.

### 1. `server/validators/agentic-judge.js`

This module acts as the constraint engine and the agent loop manager. It employs a two-step validation process: fast heuristic checks followed by deep LLM verification if needed.

```javascript
const axios = require('axios');
const spellcheck = require('simple-spellchecker');

// Load dictionary once (mock or real)
let dictionary;
try {
    dictionary = spellcheck.getDictionarySync("en-US");
} catch (e) {
    console.warn("Dictionary not found, using fallback.");
    dictionary = { spellCheck: (w) => true }; // Fallback
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
        // Use temperature 0 for deterministic correction
        const response = await axios.post('http://localhost:11434/api/generate', {
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
```

### 2. Integration in `server/index.js`

Add Stage 4 after the result merging.

```javascript
// ... existing imports
const { runAgenticJudge } = require('./validators/agentic-judge');

// ... inside app.post('/upload', ...)

    // STAGE 3: MERGE
    const mergedResult = mergeResults(ocrBaseline, qwenResult, qwenDecision.invoke_mode);

    // ============================================================================
    // STAGE 4: AGENTIC JUDGE (The "100% Accuracy" Safety Net)
    // ============================================================================
    console.log('[STAGE 4] Agentic Judge analyzing...');
    
    // Pass both the final merged text AND the raw OCR text (for context)
    const rawOcrContext = ocrBaseline.paddle_result.full_text; 
    const judgeResult = await runAgenticJudge(mergedResult.final_text, rawOcrContext);
    
    // Override final text with Judge's approved/corrected version
    mergedResult.final_text = judgeResult.final_text;
    mergedResult.judge_details = {
        action: judgeResult.judge_action,
        validity_score: judgeResult.validity_score,
        corrections: judgeResult.corrections
    };

    // ... continue to save output
```

### 3. Update `server/utils/output-handler.js`

Include the Judge's decisions in the final JSON.

```javascript
function generateOutputData(params) {
    // ... params destructuring
    
    return {
        // ... existing meta
        stage4_judge: {
            invoked: true,
            action: params.mergedResult.judge_details.action,
            validity_score: params.mergedResult.judge_details.validity_score,
            corrections_made: params.mergedResult.judge_details.corrections.length
        },
        // ... existing fields
    };
}
```

## Troubleshooting

*   **Ollama Error / Connection Refused:**
    *   Make sure Ollama is running (`ollama serve`).
    *   Verify the model is downloaded: `ollama list`.
*   **"Qwen failed to return valid JSON":**
    *   The model might have hallucinated. Try running the request again.
    *   Ensure the image is clear and readable.
*   **CORS Errors:**
    *   The server is configured with `cors()`, and the client uses a proxy in `vite.config.js`. Ensure you are accessing the frontend via the Vite URL (e.g., localhost:5173), not opening `index.html` directly.

## License

ISC
