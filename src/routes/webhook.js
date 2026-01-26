const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const pdfService = require('../services/pdfService');
const whatsappService = require('../services/whatsappService');

/**
 * POST /webhook
 * Receives webhook from Printbox when order rendering is complete
 */
router.post('/', async (req, res) => {
    try {
        logger.info('Received webhook request');

        const { projects } = req.body;
        const { order } = projects[0];

        // Extract order number - can be string or from order.number
        let orderNumber = order;
        if (typeof order === 'object' && order?.reference) {
            orderNumber = order.reference;
        }

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

                // Process PDFs: download, merge, save (with project index for filename suffix)
                const pdfPath = await pdfService.processProjectPDFs(project, orderNumber, projectIndex);

                // Construct order ID with suffix for WhatsApp message
                const orderIdWithSuffix = projects.length > 1 ? `${orderNumber}-${projectIndex}` : orderNumber;

                // Send PDF via WhatsApp
                await whatsappService.sendPDF(pdfPath, orderIdWithSuffix);

                // Cleanup temporary PDF file
                await pdfService.deletePDF(pdfPath);

                results.push({
                    projectId: project.id,
                    orderId: orderNumber,
                    projectIndex: projectIndex,
                    status: 'success'
                });

                logger.info(`Successfully processed project ${project.id} (${projectIndex}/${projects.length}) for order ${orderNumber}`);
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
