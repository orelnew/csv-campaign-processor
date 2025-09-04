import axios from 'axios';
import chalk from 'chalk';

// Configuration
const SHORTENER_CONFIG = {
  BASE_URL: process.env.SHORTENER_URL || 'https://websites-links.netlify.app',
  BULK_ENDPOINT: '/api/bulk-upload',
  TIMEOUT: 60000, // 1 minute timeout for bulk operations
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000 // 2 seconds
};

/**
 * Upload URLs to shortener in bulk
 * @param {Array} urlMappings - Array of URL mappings to shorten
 * @returns {Promise<Array>} Results from bulk shortening
 */
export async function bulkUploadToShortener(urlMappings) {
  if (!urlMappings || urlMappings.length === 0) {
    throw new Error('No URL mappings provided for bulk upload');
  }

  console.log(chalk.blue(`🚀 Starting bulk upload of ${urlMappings.length} URLs to shortener...`));
  console.log(chalk.gray(`   Shortener URL: ${SHORTENER_CONFIG.BASE_URL}`));

  // Prepare bulk request payload
  const bulkRequest = {
    urls: urlMappings.map(mapping => ({
      original_url: mapping.original_url,
      metadata: {
        prospect_id: mapping.metadata.prospect_id,
        business_type: mapping.metadata.business_type,
        company: mapping.metadata.company
      }
    }))
  };

  let lastError;
  
  // Retry mechanism
  for (let attempt = 1; attempt <= SHORTENER_CONFIG.MAX_RETRIES; attempt++) {
    try {
      console.log(chalk.blue(`📡 Attempt ${attempt}/${SHORTENER_CONFIG.MAX_RETRIES}: Sending bulk request...`));
      
      const response = await axios.post(
        `${SHORTENER_CONFIG.BASE_URL}${SHORTENER_CONFIG.BULK_ENDPOINT}`,
        bulkRequest,
        {
          timeout: SHORTENER_CONFIG.TIMEOUT,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'CSV-Campaign-Processor/1.0',
            'Origin': 'http://localhost:5173' // Required for CORS
          }
        }
      );

      if (response.data && response.data.success) {
        const results = response.data.results || [];
        console.log(chalk.green(`✅ Bulk upload successful! Processed ${results.length} URLs`));
        
        // Show success/failure breakdown
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;
        
        console.log(chalk.green(`   ✅ Successful: ${successCount} URLs`));
        if (failureCount > 0) {
          console.log(chalk.yellow(`   ⚠️  Failed: ${failureCount} URLs`));
          
          // Show first few failures for debugging
          const failures = results.filter(r => !r.success).slice(0, 3);
          failures.forEach((failure, index) => {
            console.log(chalk.yellow(`      ${index + 1}. ${failure.error || 'Unknown error'}`));
          });
        }

        return results;
      } else {
        throw new Error(`Bulk upload failed: ${response.data?.error || 'Unknown error'}`);
      }

    } catch (error) {
      lastError = error;
      
      if (attempt < SHORTENER_CONFIG.MAX_RETRIES) {
        const isRetryableError = isRetryable(error);
        if (isRetryableError) {
          console.log(chalk.yellow(`⚠️  Request failed (${error.message}), retrying in ${SHORTENER_CONFIG.RETRY_DELAY}ms...`));
          await sleep(SHORTENER_CONFIG.RETRY_DELAY);
          continue;
        } else {
          console.log(chalk.red(`❌ Non-retryable error: ${error.message}`));
          break;
        }
      }
    }
  }

  // All attempts failed
  console.log(chalk.red(`❌ Bulk upload failed after ${SHORTENER_CONFIG.MAX_RETRIES} attempts`));
  throw new Error(`Bulk upload failed: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Determine if an error is retryable
 * @param {Error} error - Error object
 * @returns {boolean} Whether the error is retryable
 */
function isRetryable(error) {
  // Network errors are retryable
  if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return true;
  }
  
  // Timeout errors are retryable
  if (error.message?.includes('timeout')) {
    return true;
  }
  
  // HTTP 5xx errors are retryable
  if (error.response?.status >= 500) {
    return true;
  }
  
  // HTTP 429 (rate limit) is retryable
  if (error.response?.status === 429) {
    return true;
  }
  
  return false;
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create fallback short URLs when bulk upload fails
 * @param {Array} urlMappings - Original URL mappings
 * @returns {Array} Fallback results using original URLs
 */
export function createFallbackResults(urlMappings) {
  console.log(chalk.yellow('⚠️  Creating fallback results using original URLs...'));
  
  return urlMappings.map(mapping => ({
    success: true, // Mark as success since we're using original URL
    original_url: mapping.original_url,
    data: {
      shortUrl: mapping.original_url, // Fallback to original URL
      shortCode: 'original',
      originalUrl: mapping.original_url,
      expiresAt: Date.now() + (14 * 24 * 60 * 60 * 1000) // 14 days from now
    },
    metadata: mapping.metadata,
    fallback: true
  }));
}

/**
 * Validate bulk upload results
 * @param {Array} results - Results from bulk upload
 * @param {Array} originalMappings - Original URL mappings
 * @returns {Object} Validation summary
 */
export function validateBulkUploadResults(results, originalMappings) {
  const validation = {
    total_requested: originalMappings.length,
    total_returned: results.length,
    successful: 0,
    failed: 0,
    missing: 0,
    errors: []
  };

  if (results.length !== originalMappings.length) {
    validation.missing = originalMappings.length - results.length;
    validation.errors.push(`Expected ${originalMappings.length} results, got ${results.length}`);
  }

  results.forEach((result, index) => {
    if (result.success) {
      validation.successful++;
      
      // Validate that shortened URL is different from original (unless it's a fallback)
      if (!result.fallback && result.data?.shortUrl === result.original_url) {
        validation.errors.push(`Result ${index + 1}: Short URL is same as original URL`);
      }
    } else {
      validation.failed++;
      validation.errors.push(`Result ${index + 1}: ${result.error || 'Unknown error'}`);
    }
  });

  return validation;
}

/**
 * Test connection to URL shortener API
 * @returns {Promise<boolean>} Whether connection is successful
 */
export async function testShortenerConnection() {
  try {
    console.log(chalk.blue('🔍 Testing connection to URL shortener...'));
    
    // Test with a small bulk request to the actual endpoint since there's no dedicated health endpoint
    const testPayload = {
      urls: [{
        original_url: 'https://example.com',
        metadata: { test: true }
      }]
    };
    
    const response = await axios.post(
      `${SHORTENER_CONFIG.BASE_URL}${SHORTENER_CONFIG.BULK_ENDPOINT}`,
      testPayload,
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'CSV-Campaign-Processor/1.0',
          'Origin': 'http://localhost:5173' // Required for CORS
        },
        validateStatus: (status) => status < 500 // Accept anything except server errors
      }
    );
    
    console.log(chalk.green(`✅ Connection successful (Status: ${response.status})`));
    return true;
  } catch (error) {
    console.log(chalk.red(`❌ Connection failed: ${error.message}`));
    return false;
  }
}

/**
 * Estimate processing time for bulk upload
 * @param {number} urlCount - Number of URLs to process
 * @returns {Object} Time estimates
 */
export function estimateProcessingTime(urlCount) {
  // Based on typical performance: ~100 URLs per second for bulk processing
  const baseProcessingTime = Math.ceil(urlCount / 100); // seconds
  const networkOverhead = 5; // seconds
  const retryBuffer = baseProcessingTime * 0.3; // 30% buffer for retries
  
  const estimated = baseProcessingTime + networkOverhead + retryBuffer;
  
  return {
    optimistic: baseProcessingTime + networkOverhead,
    realistic: Math.ceil(estimated),
    pessimistic: Math.ceil(estimated * 2),
    breakdown: {
      processing: baseProcessingTime,
      network: networkOverhead,
      retry_buffer: Math.ceil(retryBuffer)
    }
  };
}