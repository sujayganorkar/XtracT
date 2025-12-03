/**
 * Configuration module for OCR-First Pipeline
 * Centralized configuration and constants
 */

// API Configuration
const API_CONFIG = {
    PORT: process.env.PORT || 3000,
    HOST: process.env.HOST || 'localhost',
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
};

// Ollama Configuration
const OLLAMA_CONFIG = {
    URL: process.env.OLLAMA_URL || 'http://localhost:11434',
    MODEL: process.env.OLLAMA_MODEL || 'qwen2.5vl:7b',
    TIMEOUT: parseInt(process.env.OLLAMA_TIMEOUT || '300000', 10) // 5 minutes
};

// File Upload Configuration
const UPLOAD_CONFIG = {
    UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
    OUTPUT_DIR: process.env.OUTPUT_DIR || 'output',
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '50000000', 10), // 50MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
};

// Processing Configuration
const PROCESSING_CONFIG = {
    ENABLE_PADDLE_OCR: process.env.ENABLE_PADDLE_OCR !== 'false',
    ENABLE_TESSERACT: process.env.ENABLE_TESSERACT !== 'false',
    ENABLE_ZOOM_READS: process.env.ENABLE_ZOOM_READS !== 'false',
    ZOOM_READ_REGIONS_LIMIT: parseInt(process.env.ZOOM_READ_REGIONS_LIMIT || '3', 10)
};

// Confidence Thresholds (tunable) - Optimized for 98%/95%/93% accuracy targets
const CONFIDENCE_THRESHOLDS = {
    EXCELLENT: parseFloat(process.env.CONFIDENCE_EXCELLENT || '0.98'),
    HIGH: parseFloat(process.env.CONFIDENCE_HIGH || '0.95'),
    MEDIUM: parseFloat(process.env.CONFIDENCE_MEDIUM || '0.93'),
    LOW: parseFloat(process.env.CONFIDENCE_LOW || '0.93'),
    CHAR_SIMILARITY_MIN: parseFloat(process.env.CHAR_SIMILARITY_MIN || '0.98'),
    WORD_DISCREPANCY_MAX: parseFloat(process.env.WORD_DISCREPANCY_MAX || '0.02'),
    DISCREPANCY_WARNING: parseFloat(process.env.DISCREPANCY_WARNING || '0.05'),
    DISCREPANCY_CRITICAL: parseFloat(process.env.DISCREPANCY_CRITICAL || '0.07'),
    LOW_REGION_THRESHOLD: parseFloat(process.env.LOW_REGION_THRESHOLD || '0.93'),
    MAX_LOW_REGIONS: parseInt(process.env.MAX_LOW_REGIONS || '2', 10)
};

// Logging Configuration
const LOG_CONFIG = {
    LEVEL: process.env.LOG_LEVEL || 'info',
    FORMAT: process.env.LOG_FORMAT || 'default' // 'default' or 'json'
};

// Export all configurations
module.exports = {
    API_CONFIG,
    OLLAMA_CONFIG,
    UPLOAD_CONFIG,
    PROCESSING_CONFIG,
    CONFIDENCE_THRESHOLDS,
    LOG_CONFIG
};
