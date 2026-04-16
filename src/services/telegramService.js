const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../utils/config');

function getTelegramBaseUrl() {
    if (!config.telegram.botToken) {
        throw new Error('Telegram bot configuration is missing (TELEGRAM_BOT_TOKEN)');
    }
    return `https://api.telegram.org/bot${config.telegram.botToken}`;
}

/**
 * Builds the order details message body (Order, Page Count, Value, Total, Download link).
 */
function buildOrderMessageBody(mainPdfPath, orderId, details = {}) {
    const filename = path.basename(mainPdfPath);
    const downloadUrl = `${config.baseUrl}/download/${encodeURIComponent(filename)}`;
    const pageCountText = typeof details.pageCount === 'number' ? `${details.pageCount}` : 'N/A';
    const orderValueText = typeof details.orderValue === 'number' ? `${details.orderValue}` : 'N/A';
    const totalText =
        typeof details.total === 'number'
            ? `${details.total}`
            : orderValueText !== 'N/A'
                ? orderValueText
                : 'N/A';
    return `Order ${orderId}\nPage Count: ${pageCountText}\nOrder Value: ${orderValueText} EGP\nTotal Money: ${totalText} EGP\n\nDownload PDF:\n${downloadUrl}`;
}

/**
 * Sends a text message with a download link via Telegram
 */
async function sendPDF(pdfPath, orderId, details = {}) {
    try {
        if (!config.telegram.chatId) throw new Error('TELEGRAM_CHAT_ID is missing');
        
        logger.info(`Sending text notification to Telegram for order: ${orderId}`);
        const caption = buildOrderMessageBody(pdfPath, orderId, details);

        const response = await axios.post(`${getTelegramBaseUrl()}/sendMessage`, {
            chat_id: config.telegram.chatId,
            text: caption
        });

        logger.info(`Message sent successfully to Telegram for order ${orderId}`);
        return response.data;
    } catch (error) {
        logger.error(`Failed to send message to Telegram for order ${orderId}: ${error.response?.data?.description || error.message}`);
        throw new Error(`Telegram send failed: ${error.response?.data?.description || error.message}`);
    }
}

/**
 * Sends the order message with the QR JPEG as photo attachment.
 */
async function sendOrderWithQRAttachment(qrImagePath, mainPdfPath, orderId, details = {}) {
    try {
        if (!config.telegram.chatId) throw new Error('TELEGRAM_CHAT_ID is missing');

        logger.info(`Sending QR notification to Telegram for order: ${orderId}`);
        const caption = buildOrderMessageBody(mainPdfPath, orderId, details);

        const formData = new FormData();
        formData.append('chat_id', config.telegram.chatId);
        formData.append('document', fs.createReadStream(qrImagePath));
        formData.append('caption', caption);

        const response = await axios.post(`${getTelegramBaseUrl()}/sendDocument`, formData, {
            headers: formData.getHeaders()
        });

        logger.info(`QR image sent successfully to Telegram for order ${orderId}`);
        return response.data;
    } catch (error) {
        logger.error(`Failed to send QR image to Telegram for order ${orderId}: ${error.response?.data?.description || error.message}`);
        throw new Error(`Telegram photo send failed: ${error.response?.data?.description || error.message}`);
    }
}

module.exports = {
    sendPDF,
    sendOrderWithQRAttachment,
    buildOrderMessageBody
};
