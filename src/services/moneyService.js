const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const config = require('../utils/config');

function getMoneyFilePath() {
    // Default to ./data/money.csv if not configured
    const filePath = config.moneyFilePath || path.join(process.cwd(), 'data', 'money.csv');
    return filePath;
}

async function ensureMoneyDirExists() {
    const moneyFilePath = getMoneyFilePath();
    const dir = path.dirname(moneyFilePath);
    await fs.mkdir(dir, { recursive: true });
}

/**
 * Appends a single order value to the CSV file.
 * Format: timestamp_iso,order_id,order_value
 */
async function appendOrderValue(orderId, orderValue) {
    try {
        if (typeof orderValue !== 'number' || Number.isNaN(orderValue)) {
            logger.warn(`appendOrderValue called with invalid orderValue: ${orderValue}`);
            return;
        }

        await ensureMoneyDirExists();
        const moneyFilePath = getMoneyFilePath();

        // 1. Check if the file exists and read its content
        try {
            const content = await fs.readFile(moneyFilePath, 'utf8');
            const lines = content.split('\n');

            // 2. Check if the orderId already exists in column 2
            const idExists = lines.some(line => {
                const parts = line.split(',');
                return parts[1] === String(orderId);
            });

            if (idExists) {
                logger.info(`OrderId ${orderId} already exists in CSV. Skipping append.`);
                return; // Exit without adding
            }
        } catch (readError) {
            // If file doesn't exist, we just proceed to create/append
            if (readError.code !== 'ENOENT') throw readError;
        }

        // 3. If ID doesn't exist, append the new line
        const timestamp = new Date().toISOString();
        const line = `${timestamp},${orderId},${orderValue}\n`;

        await fs.appendFile(moneyFilePath, line, 'utf8');
        logger.info(`Appended order value to money CSV: ${orderId} -> ${orderValue}`);
    } catch (error) {
        logger.error('Failed to append order value to money CSV:', error.message);
    }
}

/**
 * Reads the CSV file and returns the total of all order values.
 */
async function getTotal() {
    try {
        const moneyFilePath = getMoneyFilePath();

        // If file doesn't exist yet, treat as 0
        try {
            await fs.access(moneyFilePath);
        } catch {
            return 0;
        }

        const content = await fs.readFile(moneyFilePath, 'utf8');
        if (!content.trim()) {
            return 0;
        }

        const lines = content.split('\n').filter(Boolean);
        let total = 0;

        for (const line of lines) {
            const parts = line.split(',');
            if (parts.length < 3) continue;
            const value = parseFloat(parts[2]);
            if (!Number.isNaN(value)) {
                total += value;
            } else {
                logger.warn(`Skipping invalid money CSV line (non-numeric value): ${line}`);
            }
        }

        return total;
    } catch (error) {
        logger.error('Failed to read money CSV for total:', error.message);
        return 0;
    }
}

/**
 * Resets the total by truncating the CSV file.
 */
async function resetTotal() {
    try {
        await ensureMoneyDirExists();
        const moneyFilePath = getMoneyFilePath();
        await fs.writeFile(moneyFilePath, '', 'utf8');
        logger.info('Money CSV has been reset (file truncated).');
    } catch (error) {
        logger.error('Failed to reset money CSV:', error.message);
    }
}

module.exports = {
    appendOrderValue,
    getTotal,
    resetTotal
};

