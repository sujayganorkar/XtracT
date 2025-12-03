/**
 * Output Handler - Formats and saves processing results
 * Provides consistent output structure for the hybrid OCR + LLM pipeline
 */

const fs = require('fs');
const path = require('path');

/**
 * Generate comprehensive output data structure
 * @param {Object} params - All processing results
 * @returns {Object} Formatted output data
 */
function generateOutputData(params) {
    const {
        filename,
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
        timings
    } = params;

    return {
        meta: {
            original_filename: filename,
            timestamp: new Date().toISOString(),
            processing_version: '2.0.0-hybrid',
            total_processing_time_ms: timings.total,
            stage1_ocr_time_ms: timings.stage1,
            stage2_qwen_time_ms: timings.stage2,
            stage3_merge_time_ms: timings.stage3,
            stage4_judge_time_ms: timings.stage4,
            qwen_invoked: qwenDecision.should_invoke_qwen,
            qwen_mode: qwenDecision.invoke_mode,
            qwen_calls: qwenDecision.estimated_qwen_calls,
            zoom_reads: zoomReadResults.length
        },
        stage1_ocr: {
            paddle_ocr: {
                regions: paddleResult.regions || [],
                full_text: paddleResult.full_text || '',
                overall_confidence: paddleResult.overall_confidence,
                word_count: paddleResult.word_count
            },
            tesseract: {
                text: tesseractResult.text || '',
                confidence: tesseractResult.confidence,
                word_count: tesseractResult.word_count
            },
            alignment: {
                paddle_word_count: alignment.paddle_word_count,
                tesseract_word_count: alignment.tesseract_word_count,
                word_discrepancy_pct: alignment.word_discrepancy_pct,
                char_similarity: alignment.char_similarity,
                char_similarity_pct: alignment.char_similarity_pct,
                word_count_match: alignment.word_count_match,
                char_match: alignment.char_match,
                agreement_level: alignment.agreement_level,
                paddle_longer: alignment.paddle_longer,
                difference_in_words: alignment.difference_in_words
            },
            combined_confidence: combinedConfidence,
            low_confidence_regions: lowConfidenceRegions.map(r => ({
                region_id: r.region_id,
                text: r.text,
                confidence: r.confidence,
                bbox: r.bbox
            }))
        },
        stage2_decision: {
            should_invoke_qwen: qwenDecision.should_invoke_qwen,
            invoke_mode: qwenDecision.invoke_mode,
            reason: qwenDecision.reason,
            confidence_score: qwenDecision.confidence_score,
            char_similarity: qwenDecision.char_similarity,
            estimated_qwen_calls: qwenDecision.estimated_qwen_calls,
            estimated_time_ms: qwenDecision.estimated_time_ms,
            gate_triggered: qwenDecision.gate_triggered
        },
        stage2_qwen: qwenResult,
        stage3_final: {
            final_text: mergedResult.final_text,
            extraction_method: mergedResult.extraction_method,
            confidence_score: mergedResult.confidence_score,
            source: mergedResult.source,
            details: mergedResult.details
        },
        stage4_judge: {
            invoked: true,
            action: mergedResult.judge_validation?.action || 'not_run',
            validity_score: mergedResult.judge_validation?.validity_score || 1.0,
            corrections_made: mergedResult.judge_validation?.corrections?.length || 0,
            risky_words_detected: mergedResult.judge_validation?.risky_words?.length || 0,
            summary: mergedResult.judge_validation?.summary || 'Judge not invoked'
        },
        quality_flags: qualityFlags
    };
}

/**
 * Generate API response summary
 * @param {Object} params - Processing results
 * @returns {Object} API response object
 */
function generateApiResponse(params) {
    const {
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
        timings
    } = params;

    return {
        status: 'success',
        file_path: `output/op_${timestamp}/data.json`,
        summary: {
            extraction_method: mergedResult.extraction_method,
            final_confidence: mergedResult.confidence_score,
            qwen_invoked: qwenDecision.should_invoke_qwen,
            qwen_mode: qwenDecision.invoke_mode,
            qwen_calls_made: qwenDecision.estimated_qwen_calls,
            zoom_reads_performed: zoomReadResults.length,
            total_time_ms: timings.total,
            stage_breakdown: {
                ocr: timings.stage1,
                qwen: timings.stage2,
                merge: timings.stage3,
                judge: timings.stage4
            }
        },
        hybrid_validation: {
            ocr_confidence: combinedConfidence,
            char_similarity: alignment.char_similarity,
            char_similarity_pct: alignment.char_similarity_pct,
            word_discrepancy_pct: alignment.word_discrepancy_pct,
            agreement_level: alignment.agreement_level,
            decision_gate: qwenDecision.gate_triggered[0] || 'none',
            decision_reason: qwenDecision.reason
        },
        quality_summary: {
            hallucination_risk: qualityFlags.hallucination_risk?.hallucination_risk || 0,
            ocr_engine_agreement: alignment.agreement_level,
            low_confidence_regions: lowConfidenceRegions.length,
            paddle_confidence: paddleResult.overall_confidence,
            tesseract_confidence: tesseractResult.confidence,
            judge_validation: qualityFlags.judge_validation
        }
    };
}

/**
 * Save output data to JSON file
 * @param {string} outputDir - Output directory path
 * @param {Object} data - Data to save
 * @returns {string} Path to saved file
 */
function saveOutputData(outputDir, data) {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const jsonPath = path.join(outputDir, 'data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

    return jsonPath;
}

/**
 * Generate human-readable summary report
 * @param {Object} data - Output data
 * @returns {string} Text summary
 */
function generateSummaryReport(data) {
    const meta = data.meta;
    const ocr = data.stage1_ocr;
    const decision = data.stage2_decision;
    const final = data.stage3_final;

    let report = '======================================================================\n';
    report += 'OCR-FIRST HYBRID PIPELINE - PROCESSING SUMMARY\n';
    report += '======================================================================\n\n';

    report += `File: ${meta.original_filename}\n`;
    report += `Processed: ${meta.timestamp}\n`;
    report += `Total Time: ${meta.total_processing_time_ms}ms\n\n`;

    report += '--- STAGE 1: OCR ANALYSIS ---\n';
    report += `PaddleOCR Confidence: ${Math.round(ocr.paddle_ocr.overall_confidence * 100)}%\n`;
    report += `Tesseract Confidence: ${Math.round(ocr.tesseract.confidence * 100)}%\n`;
    report += `Combined Confidence: ${Math.round(ocr.combined_confidence * 100)}%\n`;
    report += `Character Similarity: ${ocr.alignment.char_similarity_pct}%\n`;
    report += `Word Count Match: ${ocr.alignment.word_count_match ? 'YES' : 'NO'}\n`;
    report += `Agreement Level: ${ocr.alignment.agreement_level.toUpperCase()}\n`;
    report += `Low Confidence Regions: ${ocr.low_confidence_regions.length}\n\n`;

    report += '--- STAGE 2: DECISION GATE ---\n';
    report += `Gate Triggered: ${decision.gate_triggered.join(', ') || 'none'}\n`;
    report += `Decision: ${decision.invoke_mode.toUpperCase()}\n`;
    report += `Reason: ${decision.reason}\n`;
    report += `Qwen Invoked: ${meta.qwen_invoked ? 'YES' : 'NO'}\n`;
    if (meta.qwen_invoked) {
        report += `Qwen Calls: ${meta.qwen_calls}\n`;
        report += `Zoom Reads: ${meta.zoom_reads}\n`;
    }
    report += '\n';

    report += '--- STAGE 3: FINAL OUTPUT ---\n';
    report += `Extraction Method: ${final.extraction_method}\n`;
    report += `Final Confidence: ${Math.round(final.confidence_score * 100)}%\n`;
    report += `Source: ${final.source}\n`;
    report += `Text Length: ${final.final_text.length} characters\n\n`;

    report += '--- STAGE 4: AGENTIC JUDGE ---\n';
    report += `Action: ${data.stage4_judge.action.toUpperCase()}\n`;
    report += `Validity Score: ${Math.round(data.stage4_judge.validity_score * 100)}%\n`;
    report += `Corrections Applied: ${data.stage4_judge.corrections_made}\n`;
    report += `Risky Words Detected: ${data.stage4_judge.risky_words_detected}\n`;
    report += `Summary: ${data.stage4_judge.summary}\n\n`;

    report += '======================================================================\n';

    return report;
}

module.exports = {
    generateOutputData,
    generateApiResponse,
    saveOutputData,
    generateSummaryReport
};
