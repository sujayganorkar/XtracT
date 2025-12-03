# Codebase Issues Report

## Effect on Accuracy

### Critical Severity

#### 1. Inaccurate Data Merging (Duplication)
**Location:** `server/utils/merge-results.js`

The merging strategy is overly simplistic and leads to data duplication rather than intelligent blending. This is the most direct negative impact on the accuracy of the final text output.

*   **Issue:** The `blendTexts` function simply concatenates the OCR text and the Qwen text if both exist.
    ```javascript
    if (ocrParagraphs.length > 0 && qwenParagraphs.length > 0) {
        return ocrText + '\n[Qwen Validation]\n' + qwenText;
    }
    ```
*   **Impact:** The final output will contain the document text **twice**—once from OCR and once from the LLM—confusing downstream applications and bloating the result.
*   **Recommendation:** If the LLM confidence is high, prefer the LLM text entirely, or use a "diff-match-patch" algorithm to merge them. At minimum, do not blindly append one to the other.

#### 2. Non-Deterministic LLM Output
**Location:** `server/qwen-engine/qwen-full-page.js`

The calls to the Qwen LLM via Ollama are missing parameters to enforce determinism. This prevents consistent accuracy measurements.

*   **Issue:** The `axios.post` bodies in `runQwenFullPage` and `runQwenZoomRead` lack `temperature` and `seed` settings.
*   **Impact:** Running the same image twice may yield different results, making debugging, quality assurance, and accuracy tuning impossible.
*   **Recommendation:** Set `temperature: 0` and provide a fixed `seed` (e.g., `42`) in the API call options.

### Moderate Severity

#### 3. Flawed Validation Logic (False Positives)
**Location:** `server/validators/llm-ocr-comparison.js`

The comparison logic compares apples to oranges, likely causing false warnings about "missing text". This affects the *reported* accuracy metrics, even if the extraction is correct.

*   **Issue:** `compareLLMtoOCR` compares `qwenOutput.body_text` (structured, body only) against `ocrBaseline.paddle_result.full_text` (unstructured, contains headers/footers/captions).
*   **Impact:** If Qwen correctly identifies a header and puts it in the `headers` JSON array (removing it from `body_text`), this validator will flag it as `llm_removes_text` because the word count of `body_text` will be lower than the OCR's full raw dump.
*   **Recommendation:** The comparison should construct a "full text" representation from the Qwen JSON (joining headers + body + table descriptions) before comparing it to the OCR raw text.

### Stability & Edge Cases

#### 4. Unchecked Input Dependencies
**Location:** `server/validators/confidence-gate.js`

The gate logic assumes `alignment` and `paddle_result` always exist and have the expected structure.

*   **Issue:** If `ocr-engines/paddleocr.js` returns a safe default or a partial object (e.g., after a Python script crash), accessing properties like `alignment.agreement_level` could throw runtime errors or result in `undefined`.
*   **Impact:** This can cause the logic to default to the "Low Confidence" path unexpectedly, triggering expensive LLM calls for reasons unrelated to actual document quality.
*   **Recommendation:** Implement robust null-checking for `paddle_result` and `alignment` properties before use.

## Suggested Fixes for Merge Logic

To resolve the inaccurate merging and ensure the system selects the *better* draft, the following strategies should be implemented in `server/utils/merge-results.js`.

### 1. Use "Diff-Match-Patch" to Avoid Duplication

Instead of naive concatenation, use a diff-based approach to merge texts.

**Logic:**
*   Align the OCR and LLM text sequences.
*   Where they agree, accept the text.
*   Where they differ, check the confidence score (OCR confidence vs. LLM probability).

**Proposed Code Structure:**
```javascript
// server/utils/merge-results.js

const DiffMatchPatch = require('diff-match-patch');
const dmp = new DiffMatchPatch();

function intelligentMerge(ocrText, llmText) {
    // Compute diffs
    const diffs = dmp.diff_main(ocrText, llmText);
    dmp.diff_cleanupSemantic(diffs);

    let finalText = '';
    
    diffs.forEach(([operation, text]) => {
        if (operation === 0) { 
            // Equality: Text exists in both
            finalText += text; 
        } else if (operation === 1) {
            // Insertion (LLM has it, OCR doesn't):
            // Check if it's a known hallucination or valid addition
            if (isValidAddition(text)) {
                finalText += text;
            }
        } 
        // Deletion (OCR has it, LLM doesn't):
        // If OCR confidence for this region was low, allow deletion.
        // Otherwise, keep OCR text.
    });

    return finalText;
}
```

### 2. Trust LLM Structure, Verify with OCR Content

Leverage the LLM's ability to parse layout (JSON) while using OCR's character precision.

**Logic:**
*   Use the LLM's JSON output as the structural skeleton.
*   For each text block in the JSON, perform a fuzzy search in the raw OCR text.
*   If a match is found, use the OCR's exact character representation (fixes spelling).
*   If no match is found, trust the LLM (fixes missed columns).

**Proposed Code Structure:**
```javascript
function refineContentWithOCR(llmJson, ocrRawText) {
    const refinedBody = llmJson.body_text.split('\n').map(paragraph => {
        // Find this paragraph in OCR text using fuzzy matching (e.g., Dice coefficient)
        const bestMatch = findBestSubstringMatch(ocrRawText, paragraph);
        
        if (bestMatch.similarity > 0.85) {
            // OCR confirms this text exists; use OCR's version for precision
            return bestMatch.text;
        } else {
            // OCR missed this, or LLM hallucinated. 
            // If LLM confidence is high, keep it.
            return paragraph;
        }
    }).join('\n');

    return { ...llmJson, body_text: refinedBody };
}
```

### 3. Implement "Hallucination Checks"

Prevent the system from accepting invented words by verifying against the OCR "bag of words".

**Logic:**
*   Create a set of all unique words found by OCR.
*   Identify unique words in the LLM output that are *not* in the OCR set.
*   If the count of "unsupported" words exceeds a threshold, reject the LLM output or flag it.

**Proposed Code Structure:**
```javascript
function checkHallucinations(ocrText, llmText) {
    const ocrWords = new Set(ocrText.toLowerCase().split(/\W+/));
    const llmWords = llmText.toLowerCase().split(/\W+/);
    
    let unsupportedCount = 0;
    
    llmWords.forEach(word => {
        if (word.length > 3 && !ocrWords.has(word)) {
            // Check for fuzzy match (e.g. "teh" vs "the")
            if (!hasFuzzyMatch(word, ocrWords)) {
                unsupportedCount++;
            }
        }
    });

    // If > 10% of words are unsupported, fallback to OCR
    if (unsupportedCount / llmWords.length > 0.10) {
        return { useLLM: false, reason: "High hallucination risk" };
    }
    return { useLLM: true };
}
```

### 4. Dictionary-Based Zoom Read Validation

Replace the flawed "length check" (longer = better) with a "validity check".

**Logic:**
*   When a zoom read returns text, check if it contains valid dictionary words.
*   This prevents replacing "gibberish" (OCR) with slightly shorter "real words" (LLM) from being rejected.

**Proposed Code Structure:**
```javascript
// In server/qwen-engine/qwen-full-page.js

const spellcheck = require('simple-spellchecker');
const dictionary = spellcheck.getDictionarySync("en-US");

function evaluateZoomResult(originalText, newText) {
    const originalValid = countValidWords(originalText);
    const newValid = countValidWords(newText);

    // If LLM finds more real English words, it wins, regardless of length
    if (newValid > originalValid) {
        return true; // Improved
    }
    
    // Fallback to length check only if word counts are similar
    return newText.length > originalText.length * 0.8;
}

function countValidWords(text) {
    return text.split(/\s+/).filter(w => dictionary.spellCheck(w)).length;
}
```

Thank you for providing the file structure of the ExtractThinker repository. It's a comprehensive document processing library. Based on the file structure and
  naming conventions, here are the key components and concepts we can adopt for your qwen-image-analyser project, especially to enhance the "Agentic Judge" (Stage 4)
  and overall modularity.

  1. Core Concepts & Abstractions to Adopt

   * `DocumentLoader` Pattern:
       * Repo: extract_thinker/document_loader/ contains specific loaders like document_loader_tesseract.py, document_loader_aws_textract.py,
         document_loader_pdfplumber.py.
       * Adoption: You currently have a hybrid mix of runPaddleOCR and runTesseract in index.js. You can refactor this into a DocumentLoader interface. This would   
         make it easier to swap or add OCR engines (e.g., adding Azure Form Recognizer or easyOCR later) without rewriting the main logic.
       * Benefit: Decouples the OCR "how" from the extraction "what".

   * `Extractor` & `Contract` Pattern:
       * Repo: extract_thinker/extractor.py and extract_thinker/models/contract.py. They likely use Pydantic models (in Python) to define the expected output schema
         (the "Contract").
       * Adoption: Your runQwenFullPage.js has the prompt hardcoded. Adopting a Contract concept means defining your output schema (JSON structure) separately. The
         Extractor then takes a Contract and a Document and ensures the LLM output matches the contract.
       * Benefit: Type safety and easier prompt management. If you want to extract a "Receipt" vs "Invoice", you just swap the Contract, not the whole engine.

   * `Classification` Logic:
       * Repo: extract_thinker/models/classification.py and classification_strategy.py. They have explicit steps to classify a document before extraction.
       * Adoption: Your current pipeline assumes every image is a generic "academic document". Adopting a classification step (even a simple one using Qwen) could
         let you choose different prompts/strategies for "Table-heavy docs" vs "Text-heavy docs".

   * `Splitter` Pattern:
       * Repo: extract_thinker/splitter.py and image_splitter.py.
       * Adoption: You are already doing "Zoom Reads" (which is a form of splitting). Formalizing this into a Splitter class would clarify the logic. You could have
         a LowConfidenceSplitter (your current logic) vs a TableSplitter (for large tables).

  2. Specific Features to Explore for "Agentic Judge"

   * `HallucinationDetectionStrategy`:
       * Repo: extract_thinker/eval/HallucinationDetectionStrategy.py.
       * Adoption: This is directly relevant to your Stage 4. We should look at how they implement this. It likely compares the LLM output against the raw text from
         the DocumentLoader (OCR). This validates your plan to use OCR as a "bag of words" check.

   * `CompletionStrategy` (Paginate/Concatenate):
       * Repo: extract_thinker/models/completion_strategy.py.
       * Adoption: Your merge-results.js is currently a simple concatenation or replacement. ExtractThinker seems to have more sophisticated strategies for handling 
         large documents that don't fit in context (Pagination) or need specific merging (Concatenation).

  3. Plan for Deep Dive

  I will now fetch specific files to understand the implementation details of these concepts, particularly focusing on how they can improve your Agentic Judge and
  Merge Logic.

   1. Hallucination Detection: extract_thinker/eval/hallucination.py and HallucinationDetectionStrategy.py.
   2. Extraction Logic: extract_thinker/extractor.py (to see how they prompt the LLM with the Contract).
   3. Document Loading: extract_thinker/document_loader/document_loader_tesseract.py (to compare with your Tesseract implementation).


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
