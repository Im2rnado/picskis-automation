const express = require('express');
const logger = require('./utils/logger');
const config = require('./utils/config');
const webhookRouter = require('./routes/webhook');
const downloadRouter = require('./routes/download');
const errorHandler = require('./middleware/errorHandler');
const { startFileCleanup } = require('./utils/fileCleanup');

const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook route
app.use(config.webhookPath, webhookRouter);

// Download route
app.use('/download', downloadRouter);

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
    logger.info(`Server started on port ${config.port}`);
    logger.info(`Webhook endpoint: ${config.webhookPath}`);
    logger.info(`Download endpoint: /download/:filename`);
    logger.info(`Environment: ${config.nodeEnv}`);
    
    // Start file cleanup scheduler (runs every 24 hours)
    startFileCleanup();
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('SIGINT signal received: closing HTTP server');
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});

module.exports = app;
