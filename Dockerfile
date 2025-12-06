# XtrakT - AI-Powered OCR Pipeline
# Docker image for cross-platform deployment

FROM node:20-slim

# Install Python 3.11 and system dependencies for PaddleOCR
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3-pip \
    python3.11-dev \
    libgomp1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first (for layer caching)
COPY server/package*.json ./server/

# Install Node.js dependencies
RUN cd server && npm install

# Install latest stable Python dependencies (Linux has no compatibility issues)
RUN pip3 install --no-cache-dir --break-system-packages \
    paddlepaddle==3.0.0 \
    paddleocr==2.9.1 \
    Pillow \
    numpy \
    opencv-python

# Copy application files
COPY server/ ./server/

# Create output directories
RUN mkdir -p server/uploads server/output

# Expose server port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

# Start the server
WORKDIR /app/server
CMD ["node", "index.js"]
