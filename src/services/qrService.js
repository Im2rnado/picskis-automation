const QRCode = require('qrcode');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const config = require('../utils/config');

const SHOPIFY_ORDERS_BASE = 'https://u41iuv-xm.myshopify.com/admin/orders';

/**
 * Generates a QR code PDF for the Shopify order admin link and saves it to temp.
 * @param {string} orderId - Shopify order ID (from webhook req.body.order), used in the URL
 * @param {string} orderNumber - Order reference/number used for filename (e.g. projects[0].order.reference)
 * @returns {Promise<string>} Path to the created PDF file
 */
async function generateQRPDF(orderId, orderNumber) {
    const url = `${SHOPIFY_ORDERS_BASE}/${orderId}`;

    const dataUrl = await QRCode.toDataURL(url, { type: 'image/png', margin: 2, width: 256 });
    const pngBuffer = Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64');

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([200, 200]); // small square page
    const image = await pdfDoc.embedPng(pngBuffer);
    const { width, height } = image.scaleToFit(160, 160);
    page.drawImage(image, {
        x: (200 - width) / 2,
        y: (200 - height) / 2,
        width,
        height
    });

    const tempDir = path.resolve(config.tempDir);
    await fs.mkdir(tempDir, { recursive: true });
    const filename = `${orderNumber}-QR.pdf`;
    const pdfPath = path.join(tempDir, filename);
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(pdfPath, pdfBytes);

    logger.info(`Generated QR PDF for order ${orderNumber}: ${pdfPath}`);
    return pdfPath;
}

module.exports = {
    generateQRPDF
};
