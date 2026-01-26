require('dotenv').config();
const logger = require('./logger');

const requiredEnvVars = [
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_RECIPIENT_NUMBER'
];

function validateConfig() {
    const missing = requiredEnvVars.filter(key => !process.env[key]);

    if (missing.length > 0) {
        logger.error(`Missing required environment variables: ${missing.join(', ')}`);
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    logger.info('Configuration validated successfully');
}

const config = {
    port: process.env.PORT || 3000,
    webhookPath: process.env.WEBHOOK_PATH || '/webhook',
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
    whatsapp: {
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
        recipientNumber: process.env.WHATSAPP_RECIPIENT_NUMBER
    },
    nodeEnv: process.env.NODE_ENV || 'development',
    tempDir: './temp',
    fileExpiryDays: 10
};

// Validate on module load
validateConfig();

module.exports = config;
