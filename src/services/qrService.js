const QRCode = require('qrcode');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const config = require('../utils/config');

const SHOPIFY_ORDERS_BASE = 'https://u41iuv-xm.myshopify.com/admin/orders';
const QR_SIZE = 512;
const LABEL_HEIGHT = 56;
const SCALE = 2; // Render at 2x for sharp text, then downscale

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Generates a QR code JPEG for the Shopify order admin link and saves it to temp.
 * @param {string} orderId - Shopify order ID (from webhook req.body.order), used in the URL
 * @param {string} orderNumber - Order reference/number used for filename (e.g. projects[0].order.reference)
 * @returns {Promise<string>} Path to the created JPEG file
 */
async function generateQRImage(orderId, orderNumber) {
    const url = `${SHOPIFY_ORDERS_BASE}/${orderId}`;
    const orderLabel = String(orderNumber).replace(/^#/, '');

    const qrSize = QR_SIZE * SCALE;
    const labelHeight = LABEL_HEIGHT * SCALE;

    const qrRaw = await QRCode.toBuffer(url, {
        type: 'image/png',
        margin: 2,
        width: qrSize,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    });
    const qrBuffer = await sharp(qrRaw).resize(qrSize, qrSize).toBuffer();
    const textSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${qrSize}" height="${labelHeight}" viewBox="0 0 ${qrSize} ${labelHeight}">
            <rect width="100%" height="100%" fill="#FFFFFF" />
            <text x="50%" y="28%" text-anchor="middle" dominant-baseline="middle"
                  font-family="Arial, Helvetica, sans-serif" font-size="${38 * SCALE}" font-weight="bold" fill="#333333">${escapeXml(orderLabel)}</text>
        </svg>`
    );
    const textBuffer = await sharp(textSvg).resize(qrSize, labelHeight).toBuffer();
    const composed = await sharp(qrBuffer)
        .extend({ bottom: labelHeight, background: '#FFFFFF' })
        .composite([{ input: textBuffer, left: 0, top: qrSize }])
        .toBuffer();
    const imageBuffer = await sharp(composed)
        .resize(QR_SIZE, QR_SIZE + LABEL_HEIGHT, { kernel: 'lanczos3' })
        .jpeg({ quality: 95 })
        .toBuffer();

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
