const QRCode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const config = require('../utils/config');

const SHOPIFY_ORDERS_BASE = 'https://u41iuv-xm.myshopify.com/admin/orders';

/**
 * Generates a QR code JPEG for the Shopify order admin link and saves it to temp.
 * @param {string} orderId - Shopify order ID (from webhook req.body.order), used in the URL
 * @param {string} orderNumber - Order reference/number used for filename (e.g. projects[0].order.reference)
 * @returns {Promise<string>} Path to the created JPEG file
 */
async function generateQRImage(orderId, orderNumber) {
    const url = `${SHOPIFY_ORDERS_BASE}/${orderId}`;

    const imageBuffer = await QRCode.toBuffer(url, {
        type: 'image/jpeg',
        margin: 2,
        width: 512
    });

    const tempDir = path.resolve(config.tempDir);
    await fs.mkdir(tempDir, { recursive: true });
    const filename = `${orderNumber}-QR.jpg`;
    const imagePath = path.join(tempDir, filename);
    await fs.writeFile(imagePath, imageBuffer);

    logger.info(`Generated QR image for order ${orderNumber}: ${imagePath}`);
    return imagePath;
}

module.exports = {
    generateQRImage
};
