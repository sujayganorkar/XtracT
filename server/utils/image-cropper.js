const fs = require('fs');
const path = require('path');

// Check if sharp is available for image cropping
let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    console.warn('sharp not installed, image cropping will be limited');
    sharp = null;
}

/**
 * Crop a region from an image using bounding box
 * Bounding box format: [[x1, y1], [x2, y2], [x3, y3], [x4, y4]] (4-point format from PaddleOCR)
 * @param {string} imagePath - Path to image file
 * @param {Array} bbox - Bounding box coordinates
 * @param {number} paddingPct - Percentage padding around region (default 10%)
 * @returns {Promise<Buffer>} Cropped image as Buffer
 */
async function cropRegion(imagePath, bbox, paddingPct = 10) {
    if (!sharp) {
        throw new Error('sharp library not installed. Install with: npm install sharp');
    }

    try {
        // Get image metadata to know its size
        const metadata = await sharp(imagePath).metadata();
        const { width, height } = metadata;

        // Extract coordinates from bounding box
        const xs = bbox.map(p => p[0]);
        const ys = bbox.map(p => p[1]);

        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);

        // Calculate region dimensions
        let regionWidth = maxX - minX;
        let regionHeight = maxY - minY;

        // Add padding
        const paddingX = Math.round(regionWidth * (paddingPct / 100));
        const paddingY = Math.round(regionHeight * (paddingPct / 100));

        let cropLeft = Math.max(0, minX - paddingX);
        let cropTop = Math.max(0, minY - paddingY);
        let cropWidth = Math.min(width - cropLeft, regionWidth + paddingX * 2);
        let cropHeight = Math.min(height - cropTop, regionHeight + paddingY * 2);

        // Crop and return as buffer
        return await sharp(imagePath)
            .extract({
                left: cropLeft,
                top: cropTop,
                width: cropWidth,
                height: cropHeight
            })
            .toBuffer();

    } catch (error) {
        throw new Error(`Failed to crop region: ${error.message}`);
    }
}

/**
 * Crop multiple regions from an image
 * @param {string} imagePath - Path to image file
 * @param {Array} bboxes - Array of bounding boxes
 * @param {number} paddingPct - Percentage padding around regions
 * @returns {Promise<Array>} Array of cropped image buffers
 */
async function cropMultipleRegions(imagePath, bboxes, paddingPct = 10) {
    return Promise.all(
        bboxes.map(bbox => cropRegion(imagePath, bbox, paddingPct))
    );
}

/**
 * Save cropped region to file (useful for debugging)
 * @param {string} imagePath - Path to original image
 * @param {Array} bbox - Bounding box
 * @param {string} outputPath - Path to save cropped image
 * @param {number} paddingPct - Padding percentage
 * @returns {Promise<string>} Path to saved file
 */
async function saveCroppedRegion(imagePath, bbox, outputPath, paddingPct = 10) {
    const croppedBuffer = await cropRegion(imagePath, bbox, paddingPct);
    fs.writeFileSync(outputPath, croppedBuffer);
    return outputPath;
}

module.exports = {
    cropRegion,
    cropMultipleRegions,
    saveCroppedRegion
};
