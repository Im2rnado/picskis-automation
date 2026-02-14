const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const config = require('../utils/config');

/**
 * POST /cleanup
 * Deletes all temporary files, logs, and extracted directories
 */
router.post('/', async (req, res) => {
    try {
        logger.info('Manual cleanup requested');
        
        const results = {
            tempFiles: { deleted: 0, errors: 0 },
            logFiles: { deleted: 0, errors: 0 },
            extractedDirs: { deleted: 0, errors: 0 }
        };

        // Cleanup temp directory (PDFs and extracted directories)
        try {
            const tempDir = config.tempDir;
            const tempFiles = await fs.readdir(tempDir);
            
            for (const file of tempFiles) {
                try {
                    const filePath = path.join(tempDir, file);
                    const stats = await fs.stat(filePath);
                    
                    if (stats.isDirectory()) {
                        // Delete extracted directories
                        await fs.rm(filePath, { recursive: true, force: true });
                        results.extractedDirs.deleted++;
                        logger.info(`Deleted extracted directory: ${file}`);
                    } else {
                        // Delete PDF files
                        await fs.unlink(filePath);
                        results.tempFiles.deleted++;
                        logger.info(`Deleted temp file: ${file}`);
                    }
                } catch (error) {
                    // Try to determine if it was a directory or file
                    try {
                        const filePath = path.join(tempDir, file);
                        const stats = await fs.stat(filePath);
                        if (stats.isDirectory()) {
                            results.extractedDirs.errors++;
                        } else {
                            results.tempFiles.errors++;
                        }
                    } catch {
                        // If we can't stat it, assume it's a temp file
                        results.tempFiles.errors++;
                    }
                    logger.warn(`Error deleting ${file}:`, error.message);
                }
            }
        } catch (error) {
            logger.warn('Error accessing temp directory:', error.message);
        }

        // Cleanup logs directory
        try {
            const logsDir = path.join(__dirname, '../../logs');
            const logFiles = await fs.readdir(logsDir);
            
            for (const file of logFiles) {
                try {
                    const filePath = path.join(logsDir, file);
                    await fs.unlink(filePath);
                    results.logFiles.deleted++;
                    logger.info(`Deleted log file: ${file}`);
                } catch (error) {
                    results.logFiles.errors++;
                    logger.warn(`Error deleting log file ${file}:`, error.message);
                }
            }
        } catch (error) {
            logger.warn('Error accessing logs directory:', error.message);
        }

        const totalDeleted = results.tempFiles.deleted + results.logFiles.deleted + results.extractedDirs.deleted;
        const totalErrors = results.tempFiles.errors + results.logFiles.errors + results.extractedDirs.errors;

        logger.info(`Cleanup completed: ${totalDeleted} files/directories deleted, ${totalErrors} errors`);

        res.json({
            success: true,
            message: `Cleanup completed: ${totalDeleted} items deleted`,
            results: {
                tempFiles: `${results.tempFiles.deleted} deleted, ${results.tempFiles.errors} errors`,
                logFiles: `${results.logFiles.deleted} deleted, ${results.logFiles.errors} errors`,
                extractedDirs: `${results.extractedDirs.deleted} deleted, ${results.extractedDirs.errors} errors`,
                total: {
                    deleted: totalDeleted,
                    errors: totalErrors
                }
            }
        });
    } catch (error) {
        logger.error('Error during manual cleanup:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error during cleanup',
            message: error.message
        });
    }
});

module.exports = router;
