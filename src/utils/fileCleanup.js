const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const config = require('./config');

/**
 * Cleans up expired files (older than fileExpiryDays)
 * Runs every 24 hours
 */
async function cleanupExpiredFiles() {
    try {
        logger.info('Starting file cleanup...');
        
        const tempDir = config.tempDir;
        const expiryTime = config.fileExpiryDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
        
        // Ensure temp directory exists
        try {
            await fs.mkdir(tempDir, { recursive: true });
        } catch (error) {
            // Directory already exists, continue
        }

        const files = await fs.readdir(tempDir);
        let deletedCount = 0;
        let errorCount = 0;

        for (const file of files) {
            // Only process PDF files
            if (!file.endsWith('.pdf')) {
                continue;
            }

            try {
                const filePath = path.join(tempDir, file);
                const stats = await fs.stat(filePath);
                const fileAge = Date.now() - stats.mtime.getTime();

                if (fileAge > expiryTime) {
                    await fs.unlink(filePath);
                    deletedCount++;
                    logger.info(`Deleted expired file: ${file} (${(fileAge / (24 * 60 * 60 * 1000)).toFixed(1)} days old)`);
                }
            } catch (error) {
                errorCount++;
                logger.warn(`Error processing file ${file}:`, error.message);
            }
        }

        logger.info(`File cleanup completed: ${deletedCount} deleted, ${errorCount} errors`);
    } catch (error) {
        logger.error('Error during file cleanup:', error.message);
    }
}

/**
 * Starts the file cleanup scheduler
 * Runs cleanup every 24 hours
 */
function startFileCleanup() {
    // Run cleanup immediately on startup
    cleanupExpiredFiles();

    // Schedule cleanup every 24 hours
    const intervalMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    setInterval(() => {
        cleanupExpiredFiles();
    }, intervalMs);

    logger.info(`File cleanup scheduler started (runs every 24 hours, files expire after ${config.fileExpiryDays} days)`);
}

module.exports = {
    cleanupExpiredFiles,
    startFileCleanup
};
