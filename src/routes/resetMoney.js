const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const moneyService = require('../services/moneyService');

/**
 * GET /reset-money
 * Resets the accumulated money total by truncating the CSV file.
 */
router.get('/', async (req, res) => {
    try {
        await moneyService.resetTotal();
        logger.info('Money total reset via /reset-money endpoint');

        res.json({
            success: true,
            message: 'Money total reset'
        });
    } catch (error) {
        logger.error('Error resetting money total:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error during money reset',
            message: error.message
        });
    }
});

module.exports = router;

