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
        # PaddleOCR 2.9.1+ with auto GPU detection
        _ocr_instance = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)
    return _ocr_instance

def run_paddle_ocr(image_path):
    """
    Run PaddleOCR on image and return structured regions with confidence
    """
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

        # Run OCR on image (old API version 2.7.3)
        result = ocr.ocr(image_path, cls=True)

        # Extract regions with confidence and bounding boxes
        regions = []
        word_count = 0
        confidences = []

        for line_idx, line in enumerate(result):
            if not line:
                continue

            for word_idx, word_info in enumerate(line):
                bbox, (text, confidence) = word_info

                # Normalize bbox to 4 points format
                bbox_normalized = [[int(p[0]), int(p[1])] for p in bbox]

                region = {
                    'region_id': len(regions) + 1,
                    'text': text,
                    'bbox': bbox_normalized,
                    'confidence': float(confidence),
                    'line_index': line_idx,
                    'word_index': word_idx
                }

                regions.append(region)
                word_count += len(text.split())
                confidences.append(float(confidence))

        # Calculate overall confidence
        overall_confidence = sum(confidences) / len(confidences) if confidences else 0

        # Group regions by lines for reading order
        lines = {}
        for region in regions:
            line_idx = region['line_index']
            if line_idx not in lines:
                lines[line_idx] = []
            lines[line_idx].append(region)

        # Extract full text with reading order
        full_text = '\n'.join([
            ' '.join([r['text'] for r in sorted(lines[line_idx], key=lambda x: x['word_index'])])
            for line_idx in sorted(lines.keys())
        ])

        return {
            'regions': regions,
            'full_text': full_text,
            'layout': {
                'total_lines': len(lines),
                'total_regions': len(regions)
            },
            'overall_confidence': round(overall_confidence, 4),
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
    print(json.dumps(result, ensure_ascii=False))
