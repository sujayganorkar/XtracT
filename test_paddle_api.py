from paddleocr import PaddleOCR
import sys

ocr = PaddleOCR(use_angle_cls=True, lang='en')
result = ocr.predict('photo_15_2025-12-02_04-21-11.jpg', use_textline_orientation=True)

print(f"Result type: {type(result)}")
print(f"Length: {len(result)}")

if len(result) > 0:
    ocr_result = result[0]
    print(f"First item type: {type(ocr_result)}")
    print(f"Keys: {list(ocr_result.keys())}")

    # Check structure
    if 'dt_polys' in ocr_result:
        print(f"dt_polys length: {len(ocr_result['dt_polys'])}")
        if len(ocr_result['dt_polys']) > 0:
            print(f"First dt_poly: {ocr_result['dt_polys'][0]}")

    if 'rec_text' in ocr_result:
        print(f"rec_text length: {len(ocr_result['rec_text'])}")
        if len(ocr_result['rec_text']) > 0:
            print(f"First rec_text: {ocr_result['rec_text'][0][:50]}")

    if 'rec_scores' in ocr_result:
        scores = ocr_result['rec_scores']
        print(f"rec_scores length: {len(scores)}")
        if len(scores) > 0:
            print(f"First 5 scores: {scores[:5]}")
            print(f"Average score: {sum(scores) / len(scores)}")
            print(f"Min score: {min(scores)}")
            print(f"Max score: {max(scores)}")
