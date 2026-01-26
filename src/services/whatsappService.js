const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
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
 * Sends a PDF document via WhatsApp Business API
 * @param {string} pdfPath - Path to the PDF file to send
 * @param {string} orderId - Order ID for logging and caption
 * @returns {Promise<Object>} Response from WhatsApp API
 */
async function sendPDF(pdfPath, orderId) {
    try {
        logger.info(`Sending PDF to WhatsApp for order: ${orderId}`);

        // Step 1: Upload media
        const mediaId = await uploadMedia(pdfPath);

        // Step 2: Send message with media
        const messagePayload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: config.whatsapp.recipientNumber,
            type: 'document',
            document: {
                id: mediaId,
                caption: `Order ${orderId}`,
                filename: `${orderId}.pdf`
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

        logger.info(`PDF sent successfully to WhatsApp for order ${orderId}`);
        return response.data;
    } catch (error) {
        logger.error(`Failed to send PDF to WhatsApp for order ${orderId}:`, error.response?.data || error.message);
        throw new Error(`WhatsApp send failed: ${error.response?.data?.error?.message || error.message}`);
    }
}

module.exports = {
    uploadMedia,
    sendPDF
};
