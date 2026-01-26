const axios = require('axios');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const tar = require('tar');
const logger = require('../utils/logger');
const config = require('../utils/config');

/**
 * Downloads a tar file from a URL
 * @param {string} url - The URL of the tar file to download
 * @returns {Promise<Buffer>} The tar file as a buffer
 */
async function downloadTar(url) {
    try {
        logger.info(`Downloading tar file from: ${url}`);
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 120000 // 2 minute timeout for large tar files
        });

        const buffer = Buffer.from(response.data);
        logger.info(`Successfully downloaded tar file, size: ${buffer.length} bytes`);
        return buffer;
    } catch (error) {
        logger.error(`Failed to download tar file from ${url}:`, error.message);
        throw new Error(`Tar file download failed: ${error.message}`);
    }
}

/**
 * Extracts a tar buffer to a directory
 * @param {Buffer} tarBuffer - Tar file buffer
 * @param {string} extractDir - Directory to extract to
 * @returns {Promise<string>} Path to extracted directory
 */
async function extractTar(tarBuffer, extractDir) {
    try {
        logger.info(`Extracting tar file to: ${extractDir}`);

        // Ensure extract directory exists
        await fs.mkdir(extractDir, { recursive: true });

        // Write tar buffer to temporary file
        const tarPath = path.join(extractDir, 'temp.tar');
        await fs.writeFile(tarPath, tarBuffer);

        // Extract tar file
        await tar.extract({
            file: tarPath,
            cwd: extractDir
        });

        // Remove temporary tar file
        await fs.unlink(tarPath);

        logger.info(`Successfully extracted tar file to: ${extractDir}`);
        return extractDir;
    } catch (error) {
        logger.error(`Failed to extract tar file:`, error.message);
        throw new Error(`Tar extraction failed: ${error.message}`);
    }
}

/**
 * Recursively deletes a directory and its contents
 * @param {string} dirPath - Directory path to delete
 */
async function deleteDirectory(dirPath) {
    try {
        // Use fs.promises.rm for Node.js 14.14.0+ compatibility
        // Fallback to recursive delete if needed
        try {
            await fs.rm(dirPath, { recursive: true, force: true });
        } catch (error) {
            // Fallback: manually delete directory contents
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            await Promise.all(entries.map(entry => {
                const fullPath = path.join(dirPath, entry.name);
                return entry.isDirectory()
                    ? deleteDirectory(fullPath).then(() => fs.rmdir(fullPath))
                    : fs.unlink(fullPath);
            }));
            await fs.rmdir(dirPath);
        }
        logger.info(`Deleted directory: ${dirPath}`);
    } catch (error) {
        logger.warn(`Failed to delete directory ${dirPath}:`, error.message);
        // Don't throw - cleanup failures shouldn't break the flow
    }
}

/**
 * Finds PDF files in an extracted directory
 * @param {string} extractDir - Directory where tar was extracted
 * @param {Array} files - Array of file objects from Printbox webhook (for filenames)
 * @returns {Object} Object with paths to cover and pages PDFs
 */
function findPDFsInDirectory(extractDir, files) {
    if (!Array.isArray(files) || files.length === 0) {
        throw new Error('No files found in render data');
    }

    let coverFilename = null;
    let pagesFilename = null;

    // Identify filenames from files array
    for (const file of files) {
        const filename = file.filename?.toLowerCase() || '';

        // Check for cover PDF
        if (filename.includes('_cover.pdf') || filename.includes('cover.pdf') || filename.endsWith('cover.pdf')) {
            coverFilename = file.filename; // Use original case
            logger.info(`Found cover PDF filename: ${coverFilename}`);
        }

        // Check for pages PDF
        if (filename.includes('_pages.pdf') || filename.includes('pages.pdf') || filename.endsWith('pages.pdf')) {
            pagesFilename = file.filename; // Use original case
            logger.info(`Found pages PDF filename: ${pagesFilename}`);
        }
    }

    if (!coverFilename && !pagesFilename) {
        throw new Error('Neither cover nor pages PDF found in files array');
    }

    // Search for PDFs in extracted directory (may be in subdirectory)
    const findPDFPath = (filename) => {
        // Try direct path first
        const directPath = path.join(extractDir, filename);
        if (fsSync.existsSync(directPath)) {
            return directPath;
        }

        // Search recursively in subdirectories
        const searchDir = (dir) => {
            try {
                const entries = fsSync.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        const found = searchDir(fullPath);
                        if (found) return found;
                    } else if (entry.name === filename) {
                        return fullPath;
                    }
                }
            } catch (error) {
                // Ignore errors and continue searching
            }
            return null;
        };

        return searchDir(extractDir);
    };

    const coverPath = coverFilename ? findPDFPath(coverFilename) : null;
    const pagesPath = pagesFilename ? findPDFPath(pagesFilename) : null;

    if (!coverPath && !pagesPath) {
        throw new Error('Could not find PDF files in extracted directory');
    }

    if (coverPath) logger.info(`Found cover PDF at: ${coverPath}`);
    if (pagesPath) logger.info(`Found pages PDF at: ${pagesPath}`);

    return { coverPath, pagesPath };
}


/**
 * Merges cover and pages PDFs into a single PDF
 * @param {Buffer} coverBuffer - Cover PDF buffer (optional)
 * @param {Buffer} pagesBuffer - Pages PDF buffer (optional)
 * @returns {Promise<Buffer>} Merged PDF buffer
 */
async function mergePDFs(coverBuffer, pagesBuffer) {
    try {
        logger.info('Starting PDF merge process');
        const mergedPdf = await PDFDocument.create();

        // Add cover PDF if available
        if (coverBuffer) {
            logger.info('Adding cover PDF to merged document');
            const coverPdf = await PDFDocument.load(coverBuffer);
            const coverPages = await mergedPdf.copyPages(coverPdf, coverPdf.getPageIndices());
            coverPages.forEach((page) => mergedPdf.addPage(page));
        }

        // Add pages PDF if available
        if (pagesBuffer) {
            logger.info('Adding pages PDF to merged document');
            const pagesPdf = await PDFDocument.load(pagesBuffer);
            const pagesPages = await pagesPdf.getPageIndices();
            const copiedPages = await mergedPdf.copyPages(pagesPdf, pagesPages);
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }

        // If only one PDF is available, use it directly
        if (!coverBuffer && pagesBuffer) {
            logger.info('Only pages PDF available, using it directly');
            return pagesBuffer;
        }

        if (coverBuffer && !pagesBuffer) {
            logger.info('Only cover PDF available, using it directly');
            return coverBuffer;
        }

        const mergedBytes = await mergedPdf.save();
        logger.info(`PDF merge completed, merged size: ${mergedBytes.length} bytes`);
        return Buffer.from(mergedBytes);
    } catch (error) {
        logger.error('Failed to merge PDFs:', error.message);
        throw new Error(`PDF merge failed: ${error.message}`);
    }
}

/**
 * Saves a PDF buffer to disk
 * @param {Buffer} buffer - PDF buffer to save
 * @param {string} orderId - Order ID to use as filename
 * @param {number} projectIndex - Optional project index for multiple projects (1-based)
 * @returns {Promise<string>} Path to saved PDF file
 */
async function savePDF(buffer, orderId, projectIndex = null) {
    try {
        // Ensure temp directory exists
        const tempDir = config.tempDir;
        await fs.mkdir(tempDir, { recursive: true });

        // Add suffix for multiple projects: -1, -2, etc.
        const suffix = (projectIndex !== null && projectIndex !== 1) ? `-${projectIndex}` : '';
        const filename = `${orderId}${suffix}.pdf`;
        const filePath = path.join(tempDir, filename);

        await fs.writeFile(filePath, buffer);
        logger.info(`PDF saved to: ${filePath}`);

        return filePath;
    } catch (error) {
        logger.error(`Failed to save PDF for order ${orderId}:`, error.message);
        throw new Error(`Failed to save PDF: ${error.message}`);
    }
}

/**
 * Deletes a PDF file from disk
 * @param {string} filePath - Path to the file to delete
 */
async function deletePDF(filePath) {
    try {
        await fs.unlink(filePath);
        logger.info(`Deleted temporary PDF: ${filePath}`);
    } catch (error) {
        logger.warn(`Failed to delete PDF ${filePath}:`, error.message);
        // Don't throw - cleanup failures shouldn't break the flow
    }
}

/**
 * Processes a project: downloads tar, extracts it, reads PDFs, merges them, and saves the result
 * @param {Object} project - Project object from Printbox webhook
 * @param {string} orderId - Order ID
 * @param {number} projectIndex - Optional project index for multiple projects (1-based)
 * @returns {Promise<string>} Path to the merged PDF file
 */
async function processProjectPDFs(project, orderId, projectIndex = null) {
    const renderUrl = project.render?.url || null;
    const files = project.render?.files || [];

    if (!renderUrl) {
        throw new Error('No render URL found in project');
    }

    if (!Array.isArray(files) || files.length === 0) {
        throw new Error('No files found in render data');
    }

    // Create unique extract directory for this project
    const extractDir = path.join(config.tempDir, `extract_${project.id}_${Date.now()}`);
    let coverBuffer = null;
    let pagesBuffer = null;

    try {
        // Step 1: Download tar file
        const tarBuffer = await downloadTar(renderUrl);

        // Step 2: Extract tar file
        await extractTar(tarBuffer, extractDir);

        // Step 3: Find PDF files in extracted directory
        const { coverPath, pagesPath } = findPDFsInDirectory(extractDir, files);

        // Step 4: Read PDF files
        if (coverPath) {
            coverBuffer = await fs.readFile(coverPath);
            logger.info(`Read cover PDF, size: ${coverBuffer.length} bytes`);
        }

        if (pagesPath) {
            pagesBuffer = await fs.readFile(pagesPath);
            logger.info(`Read pages PDF, size: ${pagesBuffer.length} bytes`);
        }

        if (!coverBuffer && !pagesBuffer) {
            throw new Error('Could not read any PDF files from extracted directory');
        }

        // Step 5: Merge PDFs
        const mergedBuffer = await mergePDFs(coverBuffer, pagesBuffer);

        // Step 6: Save merged PDF with project index suffix
        const filePath = await savePDF(mergedBuffer, orderId, projectIndex);

        return filePath;
    } catch (error) {
        logger.error(`Error processing PDFs for project ${project.id}:`, error.message);
        throw error;
    } finally {
        // Step 7: Cleanup extracted directory
        await deleteDirectory(extractDir);
    }
}

module.exports = {
    downloadTar,
    extractTar,
    findPDFsInDirectory,
    mergePDFs,
    savePDF,
    deletePDF,
    deleteDirectory,
    processProjectPDFs
};
