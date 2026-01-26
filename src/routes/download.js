const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const config = require('../utils/config');

/**
 * GET /download/:filename
 * Serves PDF files for download
 * Files are automatically cleaned up after 10 days
 */
router.get('/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        
        // Security: Only allow PDF files
        if (!filename.endsWith('.pdf')) {
            return res.status(400).json({ error: 'Invalid file type' });
        }

        const filePath = path.join(config.tempDir, filename);

        // Check if file exists
        try {
            await fs.access(filePath);
        } catch (error) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Get file stats to check age
        const stats = await fs.stat(filePath);
        const fileAgeDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

        // Delete file if older than 10 days
        if (fileAgeDays > 10) {
            logger.info(`Deleting expired file: ${filename} (${fileAgeDays.toFixed(1)} days old)`);
            await fs.unlink(filePath);
            return res.status(410).json({ error: 'File has expired' });
        }

        // Set headers for PDF viewing (inline instead of attachment)
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-cache');

        // Stream file
        const fileStream = require('fs').createReadStream(filePath);
        fileStream.pipe(res);

        logger.info(`Served download: ${filename}`);
    } catch (error) {
        logger.error(`Error serving download ${req.params.filename}:`, error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
