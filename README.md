# CSV Campaign Processor

Transform CSV prospect lists into ready-to-deploy WhatsApp campaigns with personalized demo links. Process 1000+ prospects in under 30 minutes with automated URL shortening and message generation.

## 🎯 Features

- **Bulk Processing**: Handle 1000+ prospects efficiently
- **URL Personalization**: Generate custom demo links with company/city/phone
- **Business Type Routing**: Direct prospects to industry-specific demos
- **Automated URL Shortening**: Clean, professional short links
- **WhatsApp Message Generation**: Ready-to-send campaign messages
- **Error Recovery**: Graceful fallbacks and detailed error reporting
- **AI Voice Ready**: Output format prepared for voice automation

## 🚀 Quick Start

### Installation

```bash
# Clone or navigate to project directory
cd csv-campaign-processor

# Install dependencies
npm install

# Test with sample data
npm run dev
```

### Basic Usage

```bash
# Simple - CSV contains business_type column (recommended)
node src/main.js --input prospects.csv

# With fallback - use plumbing for any missing business_type
node src/main.js --input prospects.csv --business-type plumbing

# Specify output file
node src/main.js --input prospects.csv --output campaign.csv

# Dry run (validate only)
node src/main.js --input prospects.csv --dry-run

# Skip URL shortening (faster testing)
node src/main.js --input prospects.csv --skip-shortener
```

## 📋 Input Requirements

### CSV Format Options

#### Option 1: With business_type column (recommended)
```csv
company,city,phone,business_type
Smith Plumbing Services,Austin,(555) 123-4567,plumbing
Green Thumb Landscaping,Phoenix,(602) 555-9876,landscaping
Quick Fix Repairs,Denver,303-555-0123,general
```

#### Option 2: Without business_type (use -t flag)
```csv
company,city,phone
Smith Plumbing Services,Austin,(555) 123-4567
Elite Plumbing Co,Denver,303-555-0123
Pro Plumbers LLC,Phoenix,(602) 555-9876
```

#### Option 3: Mixed (some with, some without)
```csv
company,city,phone,business_type
Smith Plumbing,Austin,(555) 123-4567,plumbing
Quick Fix,Denver,303-555-0123,
Green Gardens,Phoenix,(602) 555-9876,landscaping
Fast Repairs,Miami,305-555-0123,
```

### Required Columns
- **company**: Business name (max 100 characters)
- **city**: Location (max 50 characters)  
- **phone**: Contact number (10+ digits)

### Optional Columns
- **business_type**: `plumbing`, `landscaping`, or `general` (uses fallback if missing)

## 📤 Output Format

### Campaign-Ready CSV
```csv
company,city,phone,business_type,whatsapp_message
Smith Plumbing,Austin,(555) 123-4567,plumbing,"Hi Smith Plumbing! 👋 I noticed you're a plumbing business in Austin..."
```

### Sample WhatsApp Message
```
Hi Smith Plumbing! 👋

I noticed you're a plumbing business in Austin. I wanted to share some modern website examples that could help you attract more emergency service calls and residential clients:

🔧 Professional Plumbing Sites:
• Emergency Services Demo: short.ly/a1b2c3
• Modern Design Example: short.ly/d4e5f6
• Customer Reviews Showcase: short.ly/g7h8i9
• Professional Portfolio: short.ly/j0k1l2

These sites show modern features like online booking, customer testimonials, and mobile-optimized design that can significantly increase your leads.

Would you like a quick 15-minute call to discuss how a professional website could help grow your business?

Best regards,
[Your Name]
```

## ⚙️ Configuration

### Business Types (`config/business-types.json`)
```json
{
  "plumbing": {
    "sites": [
      {
        "url": "https://plumbing-client-2.netlify.app",
        "display_name": "Emergency Services Demo"
      }
    ]
  }
}
```

### Message Templates (`config/message-templates.json`)
```json
{
  "whatsapp": {
    "greeting": "Hi {company}! 👋",
    "intro": "I noticed you're a {business_type} business in {city}..."
  }
}
```

## 🛠️ CLI Options

```bash
Options:
  -i, --input           Input CSV file path [required]
  -o, --output          Output CSV file path [default: "output/campaign-ready.csv"]
  -t, --business-type   Fallback business type for prospects missing business_type column
                        [choices: "plumbing", "landscaping", "general"] [default: "general"]
      --dry-run         Parse and validate only, do not process [boolean]
      --skip-shortener  Skip URL shortening (use original URLs) [boolean]
      --preview         Show preview of first N messages [number] [default: 3]
  -h, --help            Show help
      --version         Show version number
```

### Examples

```bash
# Simple processing (CSV has business_type column)
node src/main.js -i prospects.csv

# Mixed CSV with fallback for missing business_type
node src/main.js -i prospects.csv -t plumbing

# All plumbing prospects (CSV without business_type column)
node src/main.js -i plumbing-prospects.csv -t plumbing -o plumbing-campaign.csv

# Test with sample data
npm run dev

# Validate CSV format
node src/main.js -i prospects.csv --dry-run

# Quick processing without URL shortening
node src/main.js -i prospects.csv --skip-shortener --preview 5
```

## 📊 Performance

### Processing Times
- **100 prospects**: ~30 seconds
- **500 prospects**: ~2-3 minutes  
- **1000 prospects**: ~5-10 minutes
- **5000 prospects**: ~20-30 minutes

### Resource Usage
- **Memory**: ~50MB for 1000 prospects
- **Network**: ~1MB per 100 URLs shortened
- **Storage**: ~1KB per generated message

## 🧪 Testing

```bash
# Run test suite
npm test

# Test specific functionality
node test/test.js

# Debug mode
DEBUG=1 npm test
```

### Test Coverage
- ✅ CSV parsing and validation
- ✅ URL generation and personalization
- ✅ Business type routing
- ✅ URL shortening integration
- ✅ WhatsApp message generation
- ✅ Error handling and recovery
- ✅ Performance benchmarks

## 🔧 Troubleshooting

### Common Issues

#### CSV Parsing Errors
```bash
Error: Missing required fields: business_type
```
**Solution**: Ensure CSV has all required columns: `company,city,phone,business_type`

#### URL Shortener Connection Failed
```bash
⚠️  Shortener connection failed, using original URLs...
```
**Solution**: Check URL shortener service is running, or use `--skip-shortener` flag

#### Invalid Business Type
```bash
Error: Invalid business type: "contractor". Must be one of: plumbing, landscaping, general
```
**Solution**: Use valid business types or add new types to `config/business-types.json`

### Debug Mode

```bash
# Enable detailed error messages
DEBUG=1 node src/main.js -i prospects.csv

# Show stack traces
DEBUG=1 npm test
```

## 📁 Project Structure

```
csv-campaign-processor/
├── src/
│   ├── main.js              # CLI orchestrator
│   ├── csv-parser.js        # CSV parsing and validation
│   ├── url-generator.js     # Demo URL generation
│   ├── bulk-uploader.js     # URL shortener integration
│   └── message-generator.js # WhatsApp message creation
├── config/
│   ├── business-types.json  # Demo sites configuration
│   └── message-templates.json # Message templates
├── test/
│   ├── test.js             # Test suite
│   └── sample-data/        # Test CSV files
├── input/                  # Place CSV files here
└── output/                 # Generated campaigns
```

## 🔄 Integration

### URL Shortener API

The system requires a `/api/bulk-upload` endpoint:

```javascript
POST /api/bulk-upload
{
  "urls": [
    {
      "original_url": "https://demo.com?company=Smith&city=Austin",
      "metadata": {"prospect_id": "001", "business_type": "plumbing"}
    }
  ]
}
```

### WhatsApp Business API

Export CSV can be imported directly into:
- WhatsApp Business API
- Twilio WhatsApp
- SendGrid
- Custom CRM systems

### AI Voice Platforms

Output format is ready for voice automation systems:
- Company name and contact info
- Personalized scripts in messages
- Demo URLs for verbal sharing

## 🚀 Scaling

### For Larger Volumes (10,000+ prospects)

1. **Chunk Processing**: Split large CSVs into smaller batches
2. **Serverless Migration**: Move to AWS Lambda for unlimited processing
3. **Database Storage**: Store results in database vs files
4. **Queue System**: Process asynchronously with job queues

### Performance Optimization

```bash
# Process in chunks for very large files
split -l 1000 large-prospects.csv chunk_
for chunk in chunk_*; do
  node src/main.js -i "$chunk" -o "output/campaign-${chunk}.csv"
done
```

## 📈 Monitoring

### Success Metrics
- **Processing Speed**: Prospects per minute
- **URL Success Rate**: % of URLs successfully shortened
- **Message Quality**: Average message length and link count
- **Error Rate**: % of prospects with processing errors

### Logging
All operations are logged with color-coded output:
- 🔵 Info: Processing steps and progress
- 🟢 Success: Completed operations
- 🟡 Warning: Non-fatal issues
- 🔴 Error: Fatal errors requiring attention

## 🔮 Future Enhancements

### Planned Features
- **CRM Integration**: Direct import from Salesforce, HubSpot
- **A/B Testing**: Multiple message templates per prospect
- **Analytics Dashboard**: Campaign performance tracking
- **Scheduled Processing**: Automated recurring campaigns
- **Multi-language Support**: Templates in different languages

### AI Voice Integration
- **Call Scripts**: Generate voice-optimized scripts
- **Call Scheduling**: Best time to call analysis
- **Success Prediction**: ML-based lead scoring

---

## 📞 Support

For issues or questions:
1. Check troubleshooting section above
2. Run test suite: `npm test`
3. Enable debug mode: `DEBUG=1 node src/main.js`
4. Review logs for specific error messages

## 🏗️ Contributing

1. Follow existing code style
2. Add tests for new features
3. Update documentation
4. Test with sample data

---

**Ready to transform your prospect lists into campaigns? Let's get started! 🚀**