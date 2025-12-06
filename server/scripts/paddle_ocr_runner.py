#!/usr/bin/env python3
"""
PaddleOCR runner for Node.js integration
Detects text regions, provides confidence scores, and analyzes layout
"""

import sys
import json
import os
import warnings
warnings.filterwarnings('ignore')  # Suppress warnings

from paddleocr import PaddleOCR

# Global OCR instance (singleton pattern to avoid re-initialization)
_ocr_instance = None

def get_ocr_instance():
    """Get or create PaddleOCR instance"""
    global _ocr_instance
    if _ocr_instance is None:
        # PaddleOCR 3.x+ with auto GPU detection
        # Note: show_log parameter removed in v3.x - use DISABLE_AUTO_LOGGING_CONFIG env var instead
        _ocr_instance = PaddleOCR(use_angle_cls=True, lang='en')
    return _ocr_instance

def run_paddle_ocr(image_path):
    """
    Run PaddleOCR on image and return structured regions with confidence
    Compatible with PaddleOCR 3.x OCRResult format
    """
    # Debug: Print to stderr so it doesn't interfere with JSON output
    import sys
    print(f"[DEBUG] Image path: {image_path}", file=sys.stderr)
    print(f"[DEBUG] Image exists: {os.path.exists(image_path)}", file=sys.stderr)
    print(f"[DEBUG] Current working directory: {os.getcwd()}", file=sys.stderr)

    if not os.path.exists(image_path):
        return {
            'error': f'Image not found: {image_path}',
            'regions': [],
            'overall_confidence': 0,
            'word_count': 0
        }

    try:
        # Get singleton OCR instance (avoids re-initialization which causes crashes on Windows)
        ocr = get_ocr_instance()

        # Run OCR on image (PaddleOCR 3.x API)
        # Returns list of OCRResult objects
        results = ocr.predict(image_path, use_textline_orientation=True)

        if not results or len(results) == 0:
            return {
                'error': 'No OCR results returned',
                'regions': [],
                'overall_confidence': 0,
                'word_count': 0
            }

        # Get the first result (single page)
        ocr_result = results[0]

        # Extract data from OCRResult object (PaddleOCR 3.x format)
        dt_polys = ocr_result.get('dt_polys', [])
        rec_texts = ocr_result.get('rec_texts', [])
        rec_scores = ocr_result.get('rec_scores', [])

        # Build regions list
        regions = []
        word_count = 0

        for idx in range(len(rec_texts)):
            text = rec_texts[idx]
            confidence = rec_scores[idx] if idx < len(rec_scores) else 0.0
            bbox = dt_polys[idx].tolist() if idx < len(dt_polys) else []

            region = {
                'region_id': idx + 1,
                'text': text,
                'bbox': bbox,  # numpy array converted to list
                'confidence': float(confidence),
                'line_index': idx,  # Simplified - PaddleOCR 3.x doesn't group by lines
                'word_index': idx
            }

            regions.append(region)
            word_count += len(text.split())

        # Calculate overall confidence
        overall_confidence = sum(rec_scores) / len(rec_scores) if rec_scores else 0

        # Extract full text (join all recognized text)
        full_text = ' '.join(rec_texts)

        return {
            'regions': regions,
            'full_text': full_text,
            'layout': {
                'total_lines': len(rec_texts),  # Treat each detection as a line
                'total_regions': len(regions)
            },
            'overall_confidence': round(float(overall_confidence), 4),
            'word_count': word_count,
            'processing_time_ms': 0  # Will be calculated by Node.js
        }

    except Exception as e:
        return {
            'error': f'PaddleOCR error: {str(e)}',
            'regions': [],
            'overall_confidence': 0,
            'word_count': 0
        }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({
            'error': 'Usage: python paddle_ocr_runner.py <image_path>',
            'regions': [],
            'overall_confidence': 0,
            'word_count': 0
        }))
        sys.exit(1)

    image_path = sys.argv[1]
    result = run_paddle_ocr(image_path)
    # Use ensure_ascii=True to escape Unicode characters and avoid encoding issues on Windows
    print(json.dumps(result, ensure_ascii=True))
