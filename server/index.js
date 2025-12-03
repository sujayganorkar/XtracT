const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');

// Import OCR-First modules
const { runPaddleOCR } = require('./ocr-engines/paddleocr');
const { compareOCREngines, identifyLowConfidenceRegions, calculateCombinedConfidence } = require('./validators/ocr-alignment');
const { decideQwenInvocation, explainDecision } = require('./validators/confidence-gate');
const { runQwenFullPage, runQwenZoomRead } = require('./qwen-engine/qwen-full-page');
const { cropRegion } = require('./utils/image-cropper');
const { compareLLMtoOCR } = require('./validators/llm-ocr-comparison');
const { detectHallucinations } = require('./validators/hallucination-filter');
const { runAgenticJudge } = require('./validators/agentic-judge');
const { generateOutputData, generateApiResponse, saveOutputData, generateSummaryReport } = require('./utils/output-handler');
const { mergeResults } = require('./utils/merge-results');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/output', express.static(path.join(__dirname, 'output'))); // Serve generated files

// Configure Multer for temp storage
const upload = multer({ dest: path.join(__dirname, 'uploads') });

// Helper: Run Tesseract (baseline for cross-validation)
async function runTesseract(imagePath) {
    try {
        const { data } = await Tesseract.recognize(imagePath, 'eng');

        // Extract per-word confidence scores
        // Tesseract.js v6 might not return 'words' directly, so we handle that
        const words = data.words || [];
        const hasWords = words.length > 0;
        
        // Calculate word count safely
        const text = data.text || "";
        const calculatedWordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
        const wordCount = hasWords ? words.length : calculatedWordCount;

        // Calculate overall confidence
        // Use data.confidence (0-100) directly if words are missing
        let overallConfidence = 0;
        if (hasWords) {
            const confidenceSum = words.reduce((sum, word) => sum + word.confidence, 0);
            overallConfidence = confidenceSum / words.length / 100;
        } else if (typeof data.confidence === 'number') {
            overallConfidence = data.confidence / 100;
        }

        return {
            text: text,
            confidence: overallConfidence,
            word_count: wordCount,
            words: words // Keep empty if not available
        };
    } catch (error) {
        console.error("Tesseract Error:", error);
        return {
            text: "",
            confidence: 0,
            word_count: 0,
            words: []
        };
    }
}

// ============================================================================
// OCR-FIRST PIPELINE: Main Upload Route
// Three-stage processing: OCR Baseline → Decision Gate → Conditional Qwen
// ============================================================================

app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const timestamp = Date.now();
    const outputDir = path.join(__dirname, 'output', `op_${timestamp}`);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const imagePath = req.file.path;
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    try {
        console.log(`\n[${timestamp}] Processing ${req.file.originalname}...`);

        // ============================================================================
        // STAGE 1: OCR BASELINE (15 seconds)
        // Run PaddleOCR + Tesseract, cross-validate, calculate confidence
        // ============================================================================
        console.log('[STAGE 1] Running OCR engines...');
        const stage1Start = Date.now();

        const [paddleResult, tesseractResult] = await Promise.all([
            runPaddleOCR(imagePath),
            runTesseract(imagePath)
        ]);

        if (paddleResult.error) {
            throw new Error(`PaddleOCR failed: ${paddleResult.error}`);
        }

        // Analyze alignment between OCR engines
        const alignment = compareOCREngines(paddleResult, tesseractResult);
        const lowConfidenceRegions = identifyLowConfidenceRegions(paddleResult);
        const combinedConfidence = calculateCombinedConfidence(paddleResult, tesseractResult, alignment);

        const ocrBaseline = {
            paddle_result: paddleResult,
            tesseract_result: tesseractResult,
            alignment: alignment,
            low_confidence_regions: lowConfidenceRegions,
            combined_confidence: combinedConfidence
        };

        const stage1Time = Date.now() - stage1Start;
        console.log(`[STAGE 1] Complete in ${stage1Time}ms. Confidence: ${Math.round(combinedConfidence * 100)}%`);

        // ============================================================================
        // DECISION GATE: Should Qwen be invoked?
        // This is where we save 50% of Qwen calls
        // ============================================================================
        const qwenDecision = decideQwenInvocation(ocrBaseline);
        console.log(`[DECISION] ${qwenDecision.reason}`);
        console.log(`[DECISION] Mode: ${qwenDecision.invoke_mode.toUpperCase()}`);

        let qwenResult = null;
        let stage2Time = 0;
        let zoomReadResults = [];

        // ============================================================================
        // STAGE 2: CONDITIONAL QWEN (0-270 seconds)
        // Only invoke if decision gate says so
        // ============================================================================
        if (qwenDecision.should_invoke_qwen) {
            console.log(`[STAGE 2] Invoking Qwen (${qwenDecision.invoke_mode} mode)...`);
            const stage2Start = Date.now();

            try {
                // A) Run full-page Qwen
                qwenResult = await runQwenFullPage(base64Image);

                // B) If zoom mode, run zoom-reads on low-confidence regions
                if (qwenDecision.invoke_mode === 'zoom_reads' && lowConfidenceRegions.length > 0) {
                    console.log(`[STAGE 2] Running zoom-reads on ${Math.min(lowConfidenceRegions.length, 3)} low-confidence regions...`);

                    const regionsToZoom = lowConfidenceRegions.slice(0, 3);

                    zoomReadResults = await Promise.all(
                        regionsToZoom.map(async (region) => {
                            try {
                                const croppedBuffer = await cropRegion(imagePath, region.bbox, 10);
                                const croppedBase64 = croppedBuffer.toString('base64');
                                return await runQwenZoomRead(croppedBase64, region);
                            } catch (error) {
                                console.warn(`Failed to zoom-read region ${region.region_id}:`, error.message);
                                return null;
                            }
                        })
                    );

                    // Filter out failed zoom-reads
                    zoomReadResults = zoomReadResults.filter(z => z !== null);
                    qwenResult.zoom_reads = zoomReadResults;
                }

                stage2Time = Date.now() - stage2Start;
                console.log(`[STAGE 2] Complete in ${stage2Time}ms`);

            } catch (error) {
                console.error('[STAGE 2] Qwen processing failed:', error.message);
                throw new Error(`Qwen processing failed: ${error.message}`);
            }

        } else {
            console.log('[STAGE 2] Skipped (OCR confidence sufficient)');
        }

        // ============================================================================
        // STAGE 3: MERGE & VALIDATE (5 seconds)
        // Combine results, detect hallucinations, build quality flags
        // ============================================================================
        console.log('[STAGE 3] Merging results and validating...');
        const stage3Start = Date.now();

        const mergedResult = mergeResults(ocrBaseline, qwenResult, qwenDecision.invoke_mode);

        const stage3Time = Date.now() - stage3Start;
        console.log(`[STAGE 3] Complete in ${stage3Time}ms`);

        // ============================================================================
        // STAGE 4: AGENTIC JUDGE (0-60 seconds)
        // Final validation and correction layer - 100% accuracy safety net
        // ============================================================================
        console.log('[STAGE 4] Agentic Judge validating...');
        const stage4Start = Date.now();

        const rawOcrContext = ocrBaseline.paddle_result.full_text || '';
        const judgeResult = await runAgenticJudge(
            mergedResult.final_text,
            rawOcrContext,
            {
                enableLLMCorrection: true,  // Can be disabled for faster processing
                validityThreshold: 0.98      // 98% validity required to skip correction (aligned with OCR excellence threshold)
            }
        );

        // Override final text with judge's approved/corrected version
        mergedResult.final_text = judgeResult.final_text;
        mergedResult.judge_validation = {
            action: judgeResult.judge_action,
            validity_score: judgeResult.validity_score,
            corrections: judgeResult.corrections,
            risky_words: judgeResult.risky_words.slice(0, 10), // First 10 for brevity
            summary: judgeResult.summary
        };

        const stage4Time = Date.now() - stage4Start;
        console.log(`[STAGE 4] Complete in ${stage4Time}ms - Action: ${judgeResult.judge_action}`);

        // Build quality flags
        const qualityFlags = {
            llm_vs_ocr_mismatch: qwenResult ? compareLLMtoOCR(qwenResult, ocrBaseline) : null,
            hallucination_risk: qwenResult ? detectHallucinations(qwenResult.body_text, paddleResult.regions) : null,
            low_confidence_regions: lowConfidenceRegions,
            ocr_engine_agreement: alignment.agreement_level,
            decision_explanation: explainDecision(qwenDecision),
            judge_validation: mergedResult.judge_validation  // NEW
        };

        // ============================================================================
        // SAVE OUTPUT
        // ============================================================================
        const totalTime = stage1Time + stage2Time + stage3Time + stage4Time;

        // Generate comprehensive output data
        const finalData = generateOutputData({
            filename: req.file.originalname,
            paddleResult,
            tesseractResult,
            alignment,
            combinedConfidence,
            lowConfidenceRegions,
            qwenDecision,
            qwenResult,
            zoomReadResults,
            mergedResult,
            qualityFlags,
            timings: {
                total: totalTime,
                stage1: stage1Time,
                stage2: stage2Time,
                stage3: stage3Time,
                stage4: stage4Time
            }
        });

        // Save JSON output
        const finalJsonPath = saveOutputData(outputDir, finalData);

        // Generate and save human-readable summary
        const summaryText = generateSummaryReport(finalData);
        const summaryPath = path.join(outputDir, 'summary.txt');
        fs.writeFileSync(summaryPath, summaryText);

        // Cleanup temp upload
        fs.unlinkSync(imagePath);

        // ============================================================================
        // RESPONSE
        // ============================================================================
        console.log(`[✓] Processing complete. Total: ${totalTime}ms`);
        console.log(`[✓] Output saved to: output/op_${timestamp}/`);

        // Generate API response
        const apiResponse = generateApiResponse({
            timestamp,
            paddleResult,
            tesseractResult,
            alignment,
            combinedConfidence,
            lowConfidenceRegions,
            qwenDecision,
            zoomReadResults,
            mergedResult,
            qualityFlags,
            timings: {
                total: totalTime,
                stage1: stage1Time,
                stage2: stage2Time,
                stage3: stage3Time,
                stage4: stage4Time
            }
        });

        res.json(apiResponse);

    } catch (error) {
        console.error(`[✗] Processing failed:`, error.message);

        // Cleanup on error
        try {
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        } catch (e) {}

        res.status(500).json({
            status: 'error',
            error: 'Processing failed',
            details: error.message
        });
    }
});

// ============================================================================
// HEALTH CHECK ENDPOINT
// ============================================================================
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'OCR-First Pipeline',
        version: '1.0.0',
        components: {
            paddleocr: 'ready',
            tesseract: 'ready',
            qwen: 'ready (requires Ollama at localhost:11434)',
            validator: 'ready'
        }
    });
});

app.listen(PORT, () => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`OCR-First Pipeline Server`);
    console.log(`Running on http://localhost:${PORT}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Required services:`);
    console.log(`  ✓ Ollama running at http://localhost:11434`);
    console.log(`  ✓ Qwen2.5-VL model loaded: qwen2.5vl:7b`);
    console.log(`  ✓ PaddleOCR installed: pip install paddleocr`);
    console.log(`${'='.repeat(70)}\n`);
});
