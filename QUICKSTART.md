# Quick Start Guide - XtrakT

Get up and running with the fullstack OCR application in 5 minutes!

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **Node.js** (v16+) - [Download](https://nodejs.org/)
- [ ] **Python 3.12+** - [Download](https://www.python.org/downloads/)
- [ ] **Ollama** - [Download](https://ollama.com/)

## Step-by-Step Setup

### 1. Install Python Dependencies

```bash
# Install PaddleOCR and PaddlePaddle
pip install paddleocr paddlepaddle

# Verify installation
python -c "from paddleocr import PaddleOCR; print('PaddleOCR installed successfully!')"
```

### 2. Setup Ollama

```bash
# Pull the Qwen vision model (7B version)
ollama pull qwen2.5-vl:7b

# Verify Ollama is running
curl http://localhost:11434/api/tags
```

You should see `qwen2.5-vl:7b` in the list of models.

### 3. Install Node Dependencies

```bash
# Navigate to project directory
cd xtrakt

# Install all dependencies (server + client)
npm run install-all
```

Alternative (manual):
```bash
npm install
cd client && npm install && cd ..
```

### 4. Start the Application

#### Option A: Full Stack (Recommended)

```bash
npm run dev
```

This starts both:
- **Backend**: http://localhost:3000
- **Frontend**: http://localhost:5173

Open your browser to **http://localhost:5173**

#### Option B: Server Only

```bash
npm run server
```

Use curl to test:
```bash
curl -X POST http://localhost:3000/upload -F "image=@test-image.jpg"
```

## Using the Web Interface

1. **Open** http://localhost:5173 in your browser
2. **Click** the upload area or drag an image
3. **Wait** for the 4-stage pipeline to complete:
   - Stage 1: OCR Baseline (PaddleOCR + Tesseract)
   - Stage 2: AI Analysis (Qwen)
   - Stage 3: Merge & Validate
   - Stage 4: Agentic Judge
4. **View** results with confidence scores and timings
5. **Download**:
   - Copy text to clipboard
   - Download as `.txt`
   - Download full analysis as `.json`

## Troubleshooting

### "Ollama connection refused"

```bash
# Start Ollama service
ollama serve
```

### "PaddleOCR not found"

```bash
# Reinstall PaddleOCR
pip install --upgrade paddleocr paddlepaddle
```

### "Module not found" errors

```bash
# Reinstall dependencies
npm run install-all
```

### Port 3000 already in use

```bash
# Find and kill process on port 3000
# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac:
lsof -ti:3000 | xargs kill -9
```

## Testing the Pipeline

### Test with Sample Image

```bash
# Using curl
curl -X POST http://localhost:3000/upload \
  -F "image=@sample.jpg" \
  -o result.json

# View results
cat result.json | grep "final_text"
```

### Expected Response Structure

```json
{
  "final_text": "Extracted text here...",
  "combined_confidence": 0.95,
  "quality_flags": {
    "judge_validation": {
      "action": "approved",
      "validity_score": 0.98
    }
  },
  "timings": {
    "total": 24532,
    "stage1": 15200,
    "stage2": 180,
    "stage3": 4100,
    "stage4": 5052
  }
}
```

## Next Steps

- Read the full [README.md](README.md) for detailed documentation
- Check [CLAUDE.md](CLAUDE.md) for architecture details
- Adjust confidence thresholds in `server/.env` (if needed)
- Deploy to GitHub, Netlify, or Railway

## Performance Tips

### Speed Optimization

- **98%+ OCR confidence**: Skips Qwen entirely (~15s total)
- **93-98% confidence**: Invokes Qwen for validation (~30-60s)
- **<93% confidence**: Full treatment with zoom-reads (~60-270s)

### Accuracy Tuning

Edit confidence thresholds:
```bash
# Create .env file in server/
CONFIDENCE_EXCELLENT=0.98
CONFIDENCE_HIGH=0.95
JUDGE_VALIDITY_THRESHOLD=0.95
```

Lower thresholds = More Qwen calls = Higher accuracy + Slower processing

## Common Issues

| Issue | Solution |
|-------|----------|
| Slow processing | Check OCR confidence thresholds |
| Low confidence scores | Improve image quality/resolution |
| Qwen hallucinations | Stage 4 Judge will auto-correct |
| Missing dependencies | Run `npm run install-all` |

## Support

- GitHub Issues: https://github.com/yourusername/xtrakt/issues
- Documentation: [README.md](README.md)

---

**Ready to go?** Run `npm run dev` and start transcribing!