const express = require('express');
const fs = require('fs').promises;
const router = express.Router();
const logger = require('../utils/logger');
const pdfService = require('../services/pdfService');
const whatsappService = require('../services/whatsappService');
const moneyService = require('../services/moneyService');
const qrService = require('../services/qrService');

/**
 * POST /webhook
 * Receives webhook from Printbox when order rendering is complete
 */
router.post('/', async (req, res) => {
    try {
        logger.info('Received webhook request');

        const { order, projects } = req.body;

        // Extract order number - can be string or from order.number or order.reference
        let orderId = order;
        let orderNumber = projects[0].order.reference;

        // Validate webhook payload
        if (!orderNumber) {
            logger.warn('Webhook missing order field');
            return res.status(400).json({ error: 'Missing order field in webhook payload' });
        }

        if (!Array.isArray(projects) || projects.length === 0) {
            logger.warn('Webhook missing or empty projects array');
            return res.status(400).json({ error: 'Missing or empty projects array in webhook payload' });
        }

        logger.info(`Processing webhook for order: ${orderNumber}, projects: ${projects.length}`);

        const results = [];
        const errors = [];
        const shopifyOrderId = typeof orderId === 'object' && orderId != null
            ? (orderId.number ?? orderId.reference ?? String(orderId))
            : String(orderId);
        let qrImagePath = null;
        try {
            qrImagePath = await qrService.generateQRImage(shopifyOrderId, orderNumber);
        } catch (qrErr) {
            logger.warn(`QR image generation skipped for order ${orderNumber}:`, qrErr.message);
        }

        // Process each project separately with index for numbering
        for (let i = 0; i < projects.length; i++) {
            const project = projects[i];
            const projectIndex = i + 1; // 1-based index for -1, -2, etc.

            try {
                logger.info(`Processing project ${project.id} (${projectIndex}/${projects.length}) for order ${orderNumber}`);

                // Validate project has render data with files
                if (!project.render || !project.render.files || project.render.files.length === 0) {
                    logger.warn(`Project ${project.id} has no render files`);
                    errors.push({ projectId: project.id, error: 'No render files found' });
                    continue;
                }

                // Check if this project has family_id 296 (MAGAZINE)
                let isMagazine = false;
                if (project.order && Array.isArray(project.order.projects)) {
                    // Find matching project in order.projects array by project ID
                    const orderProject = project.order.projects.find(p => p.id === project.id);
                    if (orderProject && orderProject.family_id === 296) {
                        isMagazine = true;
                        logger.info(`Project ${project.id} identified as MAGAZINE (family_id: 296)`);
                    }
                }

                // Process PDFs: download, merge, save (with project index for filename suffix)
                const { pdfPath, pageCount } = await pdfService.processProjectPDFs(
                    project,
                    orderNumber,
                    projectIndex,
                    isMagazine
                );

                // Construct order ID with suffix for WhatsApp message
                // Always add index suffix for multiple projects (including -1 for first)
                let orderIdWithSuffix = projects.length > 1 ? `${orderNumber}-${projectIndex}` : orderNumber;
                if (isMagazine) {
                    orderIdWithSuffix = `${orderIdWithSuffix} MAGAZINE`;
                }

                // Order value calculation (based on pages PDF only, cover excluded)
                const safePageCount = typeof pageCount === 'number' ? pageCount : 0;
                let orderValue;
                if (isMagazine) {
                    orderValue = 20 + (safePageCount * 10);
                } else if (safePageCount === 24) {
                    orderValue = 450; // Normal book, 24 pages (excluding cover)
                } else {
                    orderValue = 350 + (safePageCount * 6);
                }

                // Append order value to CSV and get running total
                await moneyService.appendOrderValue(orderIdWithSuffix, orderValue);
                const total = await moneyService.getTotal();

                // Send order message: first project with QR image as attachment (same message as order details), rest as text only
                if (i === 0 && qrImagePath) {
                    await whatsappService.sendOrderWithQRAttachment(qrImagePath, pdfPath, orderIdWithSuffix, {
                        pageCount,
                        orderValue,
                        total
                    });
                    await fs.unlink(qrImagePath);
                    qrImagePath = null;
                    logger.info(`QR image sent as attachment and deleted for order ${orderNumber}`);
                } else {
                    await whatsappService.sendPDF(pdfPath, orderIdWithSuffix, {
                        pageCount,
                        orderValue,
                        total
                    });
                }

                results.push({
                    projectId: project.id,
                    orderId: orderNumber,
                    projectIndex: projectIndex,
                    isMagazine: isMagazine,
                    status: 'success'
                });

                logger.info(`Successfully processed project ${project.id} (${projectIndex}/${projects.length}) for order ${orderNumber}${isMagazine ? ' [MAGAZINE]' : ''}`);
            } catch (error) {
                logger.error(`Error processing project ${project.id}:`, error.message);
                errors.push({
                    projectId: project.id,
                    projectIndex: projectIndex,
                    error: error.message
                });
                // Continue processing other projects even if one fails
            }
        }

        // If QR was not sent with first project (e.g. first project failed), send or cleanup here
        if (qrImagePath) {
            try {
                await fs.unlink(qrImagePath);
            } catch (_) { /* ignore */ }
        }

        // Return response
        if (errors.length > 0 && results.length === 0) {
            // All projects failed
            return res.status(500).json({
                success: false,
                orderId: orderNumber,
                errors
            });
        } else if (errors.length > 0) {
            // Some projects succeeded, some failed
            return res.status(207).json({
                success: true,
                orderId: orderNumber,
                results,
                errors
            });
        } else {
            // All projects succeeded
            return res.status(200).json({
                success: true,
                orderId: orderNumber,
                results
            });
        }
    } catch (error) {
        logger.error('Unexpected error processing webhook:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

module.exports = router;
