const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../utils/config');

const WHATSAPP_API_BASE_URL = 'https://graph.facebook.com/v22.0';

/**
 * Uploads a PDF file to WhatsApp Media API
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} Media ID returned by WhatsApp API
 */
async function uploadMedia(filePath) {
    try {
        logger.info(`Uploading media to WhatsApp: ${filePath}`);

        const formData = new FormData();
        formData.append('messaging_product', 'whatsapp');
        formData.append('type', 'document');
        formData.append('file', fs.createReadStream(filePath));

        const response = await axios.post(
            `${WHATSAPP_API_BASE_URL}/${config.whatsapp.phoneNumberId}/media`,
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${config.whatsapp.accessToken}`
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            }
        );

        const mediaId = response.data.id;
        logger.info(`Media uploaded successfully, media ID: ${mediaId}`);
        return mediaId;
    } catch (error) {
        logger.error('Failed to upload media to WhatsApp:', error.response?.data || error.message);
        throw new Error(`WhatsApp media upload failed: ${error.response?.data?.error?.message || error.message}`);
    }
}

/**
 * Sends a download link via WhatsApp Business API
 * @param {string} pdfPath - Path to the PDF file (used to get filename)
 * @param {string} orderId - Order ID for logging and caption
 * @param {{pageCount?: number|null, orderValue?: number|null, total?: number|null}=} details - Extra order details to include in message
 * @returns {Promise<Object>} Response from WhatsApp API
 */
async function sendPDF(pdfPath, orderId, details = {}) {
    try {
        logger.info(`Sending PDF download link to WhatsApp for order: ${orderId}`);

        const filename = path.basename(pdfPath);
        const downloadUrl = `${config.baseUrl}/download/${encodeURIComponent(filename)}`;

        const pageCountText =
            typeof details.pageCount === 'number' ? `${details.pageCount}` : 'N/A';
        const orderValueText =
            typeof details.orderValue === 'number' ? `${details.orderValue}` : 'N/A';
        const totalText =
            typeof details.total === 'number'
                ? `${details.total}`
                : orderValueText !== 'N/A'
                    ? orderValueText
                    : 'N/A';

        // Send text message with download link
        const messagePayload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: config.whatsapp.recipientNumber,
            type: 'text',
            text: {
                body: `Order ${orderId}\nPage Count: ${pageCountText}\nOrder Value: ${orderValueText} EGP\nTotal Money: ${totalText} EGP\n\nDownload PDF:\n${downloadUrl}`
            }
        };

        const response = await axios.post(
            `${WHATSAPP_API_BASE_URL}/${config.whatsapp.phoneNumberId}/messages`,
            messagePayload,
            {
                headers: {
                    'Authorization': `Bearer ${config.whatsapp.accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logger.info(`Download link sent successfully to WhatsApp for order ${orderId}`);
        return response.data;
    } catch (error) {
        logger.error(`Failed to send download link to WhatsApp for order ${orderId}:`, error.response?.data || error.message);
        throw new Error(`WhatsApp send failed: ${error.response?.data?.error?.message || error.message}`);
    }
}

module.exports = {
    uploadMedia,
    sendPDF
};
