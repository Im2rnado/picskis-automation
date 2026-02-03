# Printbox WhatsApp Automation Backend

A Node.js Express server that automates the workflow from Printbox webhook to WhatsApp delivery. When Printbox sends a webhook notification after order rendering, the server downloads the tar file containing cover and pages PDFs, extracts them, merges the PDFs, and sends the merged PDF to a configured WhatsApp number.

## Features

- Receives webhooks from Printbox when orders are rendered
- Downloads tar files from Printbox and extracts PDFs
- Identifies and merges cover and pages PDFs into a single document
- Sends merged PDFs via WhatsApp Business API with order metadata
- Processes multiple projects per order with numbered suffixes (-1, -2, etc.)
- Tracks per-order value and a running total in EGP
- Comprehensive error handling and logging
- Automatic cleanup of temporary files and extracted directories

## Prerequisites

- Node.js (v16 or higher)
- WhatsApp Business API credentials:
  - Access Token
  - Phone Number ID
  - Recipient phone number
- VPS/server with HTTPS (required for WhatsApp API)
- Sufficient disk space for temporary tar extraction (tar files can be large)

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
# On Windows PowerShell:
Copy-Item env.example .env

# On Linux/Mac:
cp env.example .env
```

4. Edit `.env` file with your credentials:
```
PORT=3000
WEBHOOK_PATH=/webhook
WHATSAPP_ACCESS_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_RECIPIENT_NUMBER=+1234567890
NODE_ENV=production
```

5. Create necessary directories:
```bash
mkdir -p temp logs
```

## WhatsApp Business API Setup

### Step 1: Meta Business Suite Setup

1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Navigate to your WhatsApp Business Account
3. Go to **Settings** > **WhatsApp** > **API Setup**

### Step 2: Get Your Credentials

1. **Access Token**:
   - In API Setup, click "Generate access token"
   - Copy the token (it expires - you may need to set up a permanent token)

2. **Phone Number ID**:
   - Found in API Setup page
   - Format: Usually a long number

3. **Recipient Number**:
   - The phone number where PDFs should be sent
   - Format: Include country code (e.g., +1234567890)

### Step 3: Configure Webhook (Optional)

If Printbox requires webhook verification:
- Set your webhook URL in Printbox settings
- The endpoint will be: `https://your-domain.com/webhook`

## Running the Server

### Development:
```bash
npm run dev
```

### Production:
```bash
npm start
```

For production, consider using a process manager like PM2:
```bash
npm install -g pm2
pm2 start src/server.js --name printbox-automation
pm2 save
pm2 startup
```

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 3000 |
| `WEBHOOK_PATH` | Webhook endpoint path | No | /webhook |
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp API access token | Yes | - |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp phone number ID | Yes | - |
| `WHATSAPP_RECIPIENT_NUMBER` | Destination phone number | Yes | - |
| `NODE_ENV` | Environment (development/production) | No | development |
| `LOG_LEVEL` | Logging level (error/warn/info/debug) | No | info |

## Printbox Webhook Configuration

1. Log into your Printbox admin panel
2. Navigate to webhook settings
3. Set webhook URL to: `https://your-domain.com/webhook`
4. Configure any required headers (e.g., authentication tokens)

## API Endpoints

### POST /webhook
Receives webhook from Printbox when order rendering completes.

**Request Body:**
```json
{
  "order": "6520698273950",
  "printing_order_id": "uuid",
  "projects": [
    {
      "id": "07c21083-eb73-4272-8e54-1f70045613ba",
      "render": {
        "url": "https://cdn1.getprintbox.com/pbx2-picskis/renders/project_id.tar?Expires=...&KeyName=...&Signature=...",
        "files": [
          {
            "filename": "07c21083-eb73-4272-8e54-1f70045613ba_cover.pdf",
            "url": null
          },
          {
            "filename": "07c21083-eb73-4272-8e54-1f70045613ba_pages.pdf",
            "url": null
          }
        ]
      }
    }
  ]
}
```

**Note:** The `order` field can be either a string (order number) or an object with a `number` property. PDF files are extracted from the tar file at `render.url`.

**Response:**
```json
{
  "success": true,
  "orderId": "6520698273950",
  "results": [
    {
      "projectId": "07c21083-eb73-4272-8e54-1f70045613ba",
      "orderId": "6520698273950",
      "projectIndex": 1,
      "status": "success"
    }
  ]
}
```

**Note:** For multiple projects in the same order, each project gets a numbered suffix (-1, -2, etc.) in the filename and WhatsApp message caption.

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### GET /reset-money
Resets the accumulated money total (used for WhatsApp reporting).

**Response:**
```json
{
  "success": true,
  "message": "Money total reset"
}
```

## How It Works

1. **Webhook Reception**: Printbox sends POST request to `/webhook` endpoint with order and projects data
2. **Order Processing**: Extracts order number (handles both string and object formats)
3. **Tar Download**: For each project, downloads the tar file from `render.url`
4. **Tar Extraction**: Extracts tar file to a temporary directory
5. **PDF Identification**: Searches extracted directory for cover and pages PDFs by filename pattern
6. **PDF Reading**: Reads PDF files from extracted directory
7. **PDF Merging**: Merges cover PDF first, then pages PDF into a single document
8. **File Naming**: Saves merged PDF as `{orderId}.pdf` or `{orderId}-{index}.pdf` for multiple projects
9. **WhatsApp Delivery**: Uploads PDF to WhatsApp Media API and sends as document with caption
10. **Money Tracking**: Appends order values to `data/money.csv` and maintains a running total
11. **Cleanup**: Deletes temporary PDF files and extracted directories

## Money Tracking

- Each successfully processed project appends a line to `data/money.csv`:
  - Format: `timestamp_iso,order_id,order_value`
- The backend computes a **running total** of all order values and includes it in WhatsApp messages:
  - `Order Value: <value> EGP - Total Money: <total> EGP`
- Normal books:
  - If pages (block only, excluding cover) = 24 → `Order Value = 450`
  - Otherwise → `Order Value = 350 + (pages * 6)`
- MAGAZINE:
  - `Order Value = 20 + (pages * 10)`
- The `/reset-money` endpoint truncates the CSV so the total restarts from the next order.

## Error Handling

- If a project fails, other projects in the same order continue processing
- Errors are logged with full context
- HTTP status codes:
  - `200`: All projects processed successfully
  - `207`: Partial success (some projects failed)
  - `400`: Invalid webhook payload
  - `500`: Server error

## Logging

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only

In development, logs also appear in console.

## Troubleshooting

### PDFs not found
- Check that Printbox webhook includes `render.url` (tar file URL)
- Verify `render.files` array contains entries with `_cover.pdf` and `_pages.pdf` filenames
- Ensure tar file extraction completed successfully
- Check that PDFs exist in the extracted directory structure

### Tar extraction failures
- Verify `render.url` is accessible and returns a valid tar file
- Check network connectivity for tar file download
- Ensure sufficient disk space for tar extraction
- Verify tar file is not corrupted

### WhatsApp API errors
- Verify access token is valid and not expired
- Check phone number ID is correct
- Ensure recipient number includes country code
- Verify server has HTTPS enabled (required by WhatsApp API)

### PDF merge failures
- Check PDF files are valid and not corrupted after extraction
- Verify sufficient disk space in temp directory
- Check that both cover and pages PDFs were found and read successfully

## Security Considerations

- Keep `.env` file secure and never commit it
- Use HTTPS in production (required for WhatsApp API)
- Consider adding webhook authentication if Printbox supports it
- Regularly rotate WhatsApp access tokens

## License

ISC
