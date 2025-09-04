#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';

// Import modules to test
import { parseProspectsCSV } from '../src/csv-parser.js';
import { generateDemoUrls, groupUrlsByProspect, validateUrlGeneration } from '../src/url-generator.js';
import { createFallbackResults, validateBulkUploadResults } from '../src/bulk-uploader.js';
import { generateWhatsAppMessages, validateMessages } from '../src/message-generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test data
const sampleCsvPath = join(__dirname, 'sample-data', 'sample-prospects.csv');

async function runTests() {
  console.log(chalk.bold.blue('\n🧪 CSV Campaign Processor - Test Suite\n'));
  
  let passedTests = 0;
  let totalTests = 0;
  
  try {
    // Test 1: CSV Parsing
    console.log(chalk.blue('📖 Test 1: CSV Parsing'));
    totalTests++;
    
    const prospects = await parseProspectsCSV(sampleCsvPath);
    
    if (prospects.length === 5) {
      console.log(chalk.green('   ✅ Parsed correct number of prospects (5)'));
      passedTests++;
    } else {
      console.log(chalk.red(`   ❌ Expected 5 prospects, got ${prospects.length}`));
    }
    
    // Test 2: URL Generation
    console.log(chalk.blue('\n🔗 Test 2: URL Generation'));
    totalTests++;
    
    const urlMappings = await generateDemoUrls(prospects);
    const expectedUrls = prospects.length * 4; // 4 URLs per prospect (based on config)
    
    if (urlMappings.length >= expectedUrls - 5 && urlMappings.length <= expectedUrls + 5) {
      console.log(chalk.green(`   ✅ Generated expected number of URLs (~${expectedUrls})`));
      passedTests++;
    } else {
      console.log(chalk.red(`   ❌ Expected ~${expectedUrls} URLs, got ${urlMappings.length}`));
    }
    
    // Test 3: URL Validation
    console.log(chalk.blue('\n🔍 Test 3: URL Validation'));
    totalTests++;
    
    const validation = validateUrlGeneration(urlMappings);
    
    if (validation.valid_urls === urlMappings.length && validation.invalid_urls === 0) {
      console.log(chalk.green('   ✅ All generated URLs are valid'));
      passedTests++;
    } else {
      console.log(chalk.red(`   ❌ Found ${validation.invalid_urls} invalid URLs`));
    }
    
    // Test 4: URL Grouping
    console.log(chalk.blue('\n📊 Test 4: URL Grouping'));
    totalTests++;
    
    const groupedUrls = groupUrlsByProspect(urlMappings);
    
    if (Object.keys(groupedUrls).length === prospects.length) {
      console.log(chalk.green('   ✅ URLs grouped correctly by prospect'));
      passedTests++;
    } else {
      console.log(chalk.red(`   ❌ Expected ${prospects.length} prospect groups, got ${Object.keys(groupedUrls).length}`));
    }
    
    // Test 5: Fallback URL Results
    console.log(chalk.blue('\n🔄 Test 5: Fallback URL Results'));
    totalTests++;
    
    const fallbackResults = createFallbackResults(urlMappings);
    
    if (fallbackResults.length === urlMappings.length && fallbackResults.every(r => r.success)) {
      console.log(chalk.green('   ✅ Fallback results created successfully'));
      passedTests++;
    } else {
      console.log(chalk.red('   ❌ Fallback results creation failed'));
    }
    
    // Test 6: Bulk Upload Validation
    console.log(chalk.blue('\n✅ Test 6: Bulk Upload Validation'));
    totalTests++;
    
    const bulkValidation = validateBulkUploadResults(fallbackResults, urlMappings);
    
    if (bulkValidation.successful === urlMappings.length && bulkValidation.failed === 0) {
      console.log(chalk.green('   ✅ Bulk upload validation passed'));
      passedTests++;
    } else {
      console.log(chalk.red(`   ❌ Validation failed: ${bulkValidation.failed} failures`));
    }
    
    // Test 7: WhatsApp Message Generation
    console.log(chalk.blue('\n💬 Test 7: WhatsApp Message Generation'));
    totalTests++;
    
    // Update grouped URLs with fallback results (simulate shortened URLs)
    Object.values(groupedUrls).forEach(prospect => {
      prospect.urls.forEach((url, index) => {
        const matchingResult = fallbackResults.find(r => r.original_url === url.original_url);
        if (matchingResult) {
          url.short_url = matchingResult.data.shortUrl;
        }
      });
    });
    
    const prospectsWithMessages = await generateWhatsAppMessages(prospects, groupedUrls);
    
    if (prospectsWithMessages.length === prospects.length) {
      console.log(chalk.green('   ✅ Messages generated for all prospects'));
      passedTests++;
    } else {
      console.log(chalk.red(`   ❌ Expected messages for ${prospects.length} prospects, got ${prospectsWithMessages.length}`));
    }
    
    // Test 8: Message Validation
    console.log(chalk.blue('\n🔍 Test 8: Message Validation'));
    totalTests++;
    
    const messageValidation = validateMessages(prospectsWithMessages);
    
    if (messageValidation.valid_messages === prospects.length && messageValidation.messages_with_errors === 0) {
      console.log(chalk.green('   ✅ All messages are valid'));
      passedTests++;
    } else {
      console.log(chalk.red(`   ❌ Found ${messageValidation.messages_with_errors} invalid messages`));
      
      // Show first few errors
      messageValidation.errors.slice(0, 3).forEach(error => {
        console.log(chalk.red(`      ${error}`));
      });
    }
    
    // Test 9: Message Content Validation
    console.log(chalk.blue('\n📝 Test 9: Message Content Validation'));
    totalTests++;
    
    let contentValidationPassed = true;
    const sampleMessage = prospectsWithMessages[0];
    
    if (!sampleMessage.whatsapp_message.includes(sampleMessage.company)) {
      console.log(chalk.red('   ❌ Message doesn\\'t include company name'));
      contentValidationPassed = false;
    }
    
    if (!sampleMessage.whatsapp_message.includes(sampleMessage.city)) {
      console.log(chalk.red('   ❌ Message doesn\\'t include city name'));
      contentValidationPassed = false;
    }
    
    if (!sampleMessage.whatsapp_message.includes('short.ly') && !sampleMessage.whatsapp_message.includes('https://')) {
      console.log(chalk.red('   ❌ Message doesn\\'t include any URLs'));
      contentValidationPassed = false;
    }
    
    if (contentValidationPassed) {
      console.log(chalk.green('   ✅ Message content validation passed'));
      passedTests++;
    }
    
    // Test 10: Performance Test
    console.log(chalk.blue('\n⚡ Test 10: Performance Test'));
    totalTests++;
    
    const startTime = Date.now();
    
    // Re-run the entire pipeline to test performance
    const testProspects = await parseProspectsCSV(sampleCsvPath);
    const testUrls = await generateDemoUrls(testProspects);
    const testGrouped = groupUrlsByProspect(testUrls);
    const testFallback = createFallbackResults(testUrls);
    
    // Update with short URLs
    Object.values(testGrouped).forEach(prospect => {
      prospect.urls.forEach(url => {
        const matchingResult = testFallback.find(r => r.original_url === url.original_url);
        if (matchingResult) {
          url.short_url = matchingResult.data.shortUrl;
        }
      });
    });
    
    const testMessages = await generateWhatsAppMessages(testProspects, testGrouped);
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    // Performance should be under 5 seconds for 5 prospects
    if (processingTime < 5000) {
      console.log(chalk.green(`   ✅ Processing completed in ${processingTime}ms (under 5s threshold)`));
      passedTests++;
    } else {
      console.log(chalk.red(`   ❌ Processing took ${processingTime}ms (over 5s threshold)`));
    }
    
    // Show sample message
    console.log(chalk.blue('\\n📱 Sample Generated Message:'));
    console.log(chalk.white('─'.repeat(50)));
    console.log(chalk.white(prospectsWithMessages[0].whatsapp_message.substring(0, 300) + '...'));
    console.log(chalk.white('─'.repeat(50)));
    
  } catch (error) {
    console.error(chalk.red(`\\n💥 Test execution failed: ${error.message}`));
    
    if (process.env.DEBUG) {
      console.error(chalk.gray(error.stack));
    }
  }
  
  // Final results
  console.log(chalk.bold.blue('\\n📊 Test Results:'));
  console.log(chalk.blue(`   Tests passed: ${passedTests}/${totalTests}`));
  
  if (passedTests === totalTests) {
    console.log(chalk.bold.green('\\n🎉 All tests passed! The system is ready for production use.'));
    process.exit(0);
  } else {
    console.log(chalk.bold.red(`\\n❌ ${totalTests - passedTests} tests failed. Please review and fix issues.`));
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error(chalk.red('Test suite execution failed:'));
  console.error(chalk.red(error.message));
  process.exit(1);
});