#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs-extra';
import { join } from 'path';
import chalk from 'chalk';
import { createWriteStream } from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

// Import our modules
import { parseProspectsCSV, getProspectsSummary } from './csv-parser.js';
import { generateDemoUrls, groupUrlsByProspect, updateWithShortUrls, validateUrlGeneration } from './url-generator.js';
import { bulkUploadToShortener, createFallbackResults, validateBulkUploadResults, testShortenerConnection, estimateProcessingTime } from './bulk-uploader.js';
import { generateWhatsAppMessages, validateMessages, getMessageStatistics, generateMessagePreviews } from './message-generator.js';

// ASCII Art Logo
const LOGO = `
╔═══════════════════════════════════════════╗
║     CSV Campaign Processor v1.0           ║
║     Transform prospects into campaigns    ║
╚═══════════════════════════════════════════╝
`;

async function main() {
  console.log(chalk.cyan(LOGO));
  
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [options]')
    .option('input', {
      alias: 'i',
      type: 'string',
      describe: 'Input CSV file path',
      demandOption: true
    })
    .option('output', {
      alias: 'o',
      type: 'string',
      describe: 'Output CSV file path',
      default: 'output/campaign-ready.csv'
    })
    .option('business-type', {
      alias: 't',
      type: 'string',
      describe: 'Fallback business type for prospects missing business_type column',
      choices: ['plumbing', 'landscaping', 'general'],
      default: 'general'
    })
    .option('dry-run', {
      type: 'boolean',
      describe: 'Parse and validate only, do not generate URLs or messages',
      default: false
    })
    .option('skip-shortener', {
      type: 'boolean',
      describe: 'Skip URL shortening (use original URLs)',
      default: false
    })
    .option('preview', {
      type: 'number',
      describe: 'Show preview of first N generated messages',
      default: 3
    })
    .example('$0 -i prospects.csv', 'Process prospects using business_type from CSV')
    .example('$0 -i prospects.csv -t plumbing', 'Use plumbing as fallback for missing business_type')
    .example('$0 -i prospects.csv --dry-run', 'Validate CSV format without processing')
    .help()
    .alias('help', 'h')
    .version('1.0.0')
    .argv;

  const startTime = Date.now();

  try {
    // Step 1: Parse and validate CSV
    console.log(chalk.bold.blue('\n🚀 Step 1: Parsing CSV file...'));
    const prospects = await parseProspectsCSV(argv.input, argv.businessType);
    
    // Show how many used fallback business type
    const fallbackCount = prospects.filter(p => p.used_fallback_type).length;
    if (fallbackCount > 0) {
      console.log(chalk.blue(`   📋 ${fallbackCount} prospects used fallback business type: ${argv.businessType}`));
    }
    
    // Show prospects summary
    const summary = getProspectsSummary(prospects);
    console.log(chalk.blue('\n📊 Prospects Summary:'));
    console.log(chalk.blue(`   Total prospects: ${summary.total}`));
    Object.entries(summary.by_business_type).forEach(([type, count]) => {
      console.log(chalk.blue(`   ${type}: ${count} prospects`));
    });
    
    // If dry run, stop here
    if (argv.dryRun) {
      console.log(chalk.green('\n✅ Dry run completed successfully!'));
      console.log(chalk.gray('   Use --no-dry-run to process the full pipeline'));
      return;
    }
    
    // Step 2: Generate demo URLs
    console.log(chalk.bold.blue('\n🚀 Step 2: Generating demo URLs...'));
    const urlMappings = await generateDemoUrls(prospects);
    
    // Validate URL generation
    const urlValidation = validateUrlGeneration(urlMappings);
    console.log(chalk.blue(`   Generated ${urlValidation.valid_urls} valid URLs for ${urlValidation.prospects_with_urls} prospects`));
    
    if (urlValidation.invalid_urls > 0) {
      console.log(chalk.yellow(`   ⚠️  ${urlValidation.invalid_urls} invalid URLs found`));
    }
    
    // Group URLs by prospect
    const groupedUrls = groupUrlsByProspect(urlMappings);
    
    // Step 3: Shorten URLs (unless skipped)
    let shortenedResults;
    if (argv.skipShortener) {
      console.log(chalk.yellow('\n⏭️  Skipping URL shortener (using original URLs)...'));
      shortenedResults = createFallbackResults(urlMappings);
    } else {
      console.log(chalk.bold.blue('\n🚀 Step 3: Shortening URLs...'));
      
      // Test connection first
      const connectionOk = await testShortenerConnection();
      if (!connectionOk) {
        console.log(chalk.yellow('⚠️  Shortener connection failed, using original URLs...'));
        shortenedResults = createFallbackResults(urlMappings);
      } else {
        // Estimate processing time
        const timeEstimate = estimateProcessingTime(urlMappings.length);
        console.log(chalk.gray(`   Estimated processing time: ${timeEstimate.realistic}s (optimistic: ${timeEstimate.optimistic}s)`));
        
        try {
          shortenedResults = await bulkUploadToShortener(urlMappings);
        } catch (error) {
          console.log(chalk.yellow(`⚠️  Bulk upload failed (${error.message}), using original URLs...`));
          shortenedResults = createFallbackResults(urlMappings);
        }
      }
    }
    
    // Validate shortening results
    const shortenValidation = validateBulkUploadResults(shortenedResults, urlMappings);
    console.log(chalk.blue(`   Processed ${shortenValidation.successful} URLs successfully`));
    if (shortenValidation.failed > 0) {
      console.log(chalk.yellow(`   ⚠️  ${shortenValidation.failed} URLs failed to shorten`));
    }
    
    // Update grouped URLs with short URLs
    const updatedGroupedUrls = updateWithShortUrls(groupedUrls, shortenedResults);
    
    // Step 4: Generate WhatsApp messages
    console.log(chalk.bold.blue('\n🚀 Step 4: Generating WhatsApp messages...'));
    const prospectsWithMessages = await generateWhatsAppMessages(prospects, updatedGroupedUrls);
    
    // Validate messages
    const messageValidation = validateMessages(prospectsWithMessages);
    console.log(chalk.blue(`   Generated ${messageValidation.valid_messages} valid messages`));
    console.log(chalk.blue(`   Average message length: ${messageValidation.average_length} characters`));
    
    if (messageValidation.messages_with_errors > 0) {
      console.log(chalk.yellow(`   ⚠️  ${messageValidation.messages_with_errors} messages had errors`));
    }
    
    // Show message statistics
    const messageStats = getMessageStatistics(prospectsWithMessages);
    console.log(chalk.blue('\n📊 Message Statistics:'));
    console.log(chalk.blue(`   Total characters: ${messageStats.total_characters.toLocaleString()}`));
    console.log(chalk.blue(`   Total demo links: ${messageStats.total_demo_links}`));
    console.log(chalk.blue(`   Longest message: ${messageStats.longest_message.length} chars (${messageStats.longest_message.company})`));
    
    // Step 5: Export to CSV
    console.log(chalk.bold.blue('\n🚀 Step 5: Exporting campaign CSV...'));
    await exportToCsv(prospectsWithMessages, argv.output);
    
    // Show preview if requested
    if (argv.preview > 0) {
      console.log(chalk.bold.blue(`\n👀 Preview of first ${argv.preview} messages:`));
      const previews = generateMessagePreviews(prospectsWithMessages, argv.preview);
      
      previews.forEach((preview, index) => {
        console.log(chalk.green(`\n${index + 1}. ${preview.company} (${preview.business_type})`));
        console.log(chalk.gray(`   Message length: ${preview.message_length} chars, URLs: ${preview.demo_urls_count}`));
        console.log(chalk.white(`   "${preview.message_preview}"`));
      });
    }
    
    // Final summary
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(chalk.bold.green('\n🎉 Processing completed successfully!'));
    console.log(chalk.green(`   Processed ${prospects.length} prospects in ${totalTime}s`));
    console.log(chalk.green(`   Generated ${messageStats.total_demo_links} demo links`));
    console.log(chalk.green(`   Created ${messageValidation.valid_messages} WhatsApp messages`));
    console.log(chalk.green(`   Output saved to: ${argv.output}`));
    
    // Show next steps
    console.log(chalk.bold.blue('\\n📋 Next Steps:'));
    console.log(chalk.blue('   1. Review the generated CSV file'));
    console.log(chalk.blue('   2. Test a few demo links to ensure they work'));
    console.log(chalk.blue('   3. Import to your WhatsApp Business API or CRM'));
    console.log(chalk.blue('   4. Start your outreach campaign!'));
    
  } catch (error) {
    console.error(chalk.red('\\n❌ Processing failed:'));
    console.error(chalk.red(`   ${error.message}`));
    
    if (error.stack && process.env.DEBUG) {
      console.error(chalk.gray('\\nStack trace:'));
      console.error(chalk.gray(error.stack));
    }
    
    process.exit(1);
  }
}

/**
 * Export prospects with messages to CSV
 * @param {Array} prospects - Prospects with generated messages
 * @param {string} outputPath - Output CSV file path
 */
async function exportToCsv(prospects, outputPath) {
  // Ensure output directory exists
  await fs.ensureDir(join(outputPath, '..'));
  
  // Define CSV headers
  const csvWriter = createObjectCsvWriter({
    path: outputPath,
    header: [
      { id: 'company', title: 'company' },
      { id: 'city', title: 'city' },
      { id: 'phone', title: 'phone' },
      { id: 'business_type', title: 'business_type' },
      { id: 'whatsapp_message', title: 'whatsapp_message' }
    ]
  });
  
  // Prepare data for CSV
  const csvData = prospects.map(prospect => ({
    company: prospect.company,
    city: prospect.city,
    phone: prospect.phone,
    business_type: prospect.business_type,
    whatsapp_message: prospect.whatsapp_message
  }));
  
  // Write CSV file
  await csvWriter.writeRecords(csvData);
  
  console.log(chalk.green(`   ✅ Exported ${csvData.length} records to ${outputPath}`));
  
  // Also save detailed JSON for debugging
  const jsonOutputPath = outputPath.replace('.csv', '-detailed.json');
  await fs.writeJson(jsonOutputPath, prospects, { spaces: 2 });
  console.log(chalk.gray(`   📄 Detailed data saved to ${jsonOutputPath}`));
}

/**
 * Handle process signals for graceful shutdown
 */
function setupSignalHandlers() {
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\\n⚠️  Received SIGINT, shutting down gracefully...'));
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log(chalk.yellow('\\n⚠️  Received SIGTERM, shutting down gracefully...'));
    process.exit(0);
  });
}

// Setup signal handlers and run main function
setupSignalHandlers();

// Run main function and handle any unhandled errors
main().catch(error => {
  console.error(chalk.red('\\n💥 Unhandled error:'));
  console.error(chalk.red(error.message));
  process.exit(1);
});