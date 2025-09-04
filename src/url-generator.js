import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate personalized demo URLs for all prospects
 * @param {Array} prospects - Array of prospect objects
 * @returns {Promise<Array>} Array of URL mappings for bulk upload
 */
export async function generateDemoUrls(prospects) {
  console.log(chalk.blue('🔗 Generating personalized demo URLs...'));
  
  // Load business type configuration
  const configPath = join(__dirname, '..', 'config', 'business-types.json');
  const businessConfig = await fs.readJson(configPath);
  
  const urlMappings = [];
  let totalUrls = 0;
  
  for (const prospect of prospects) {
    try {
      const prospectUrls = generateUrlsForProspect(prospect, businessConfig);
      urlMappings.push(...prospectUrls);
      totalUrls += prospectUrls.length;
    } catch (error) {
      console.log(chalk.red(`❌ Error generating URLs for ${prospect.company}: ${error.message}`));
    }
  }
  
  console.log(chalk.green(`✅ Generated ${totalUrls} personalized URLs for ${prospects.length} prospects`));
  
  // Show breakdown by business type
  const breakdown = urlMappings.reduce((acc, mapping) => {
    const businessType = mapping.metadata.business_type;
    acc[businessType] = (acc[businessType] || 0) + 1;
    return acc;
  }, {});
  
  console.log(chalk.blue('📊 URL generation breakdown:'));
  Object.entries(breakdown).forEach(([type, count]) => {
    console.log(chalk.blue(`   ${type}: ${count} URLs`));
  });
  
  return urlMappings;
}

/**
 * Generate URLs for a single prospect
 * @param {Object} prospect - Prospect data
 * @param {Object} businessConfig - Business type configuration
 * @returns {Array} Array of URL mappings
 */
function generateUrlsForProspect(prospect, businessConfig) {
  const { id, company, city, phone, business_type } = prospect;
  
  // Get sites for this business type
  const businessTypeConfig = businessConfig[business_type];
  if (!businessTypeConfig) {
    throw new Error(`No configuration found for business type: ${business_type}`);
  }
  
  const sites = businessTypeConfig.sites;
  if (!sites || sites.length === 0) {
    throw new Error(`No demo sites configured for business type: ${business_type}`);
  }
  
  const urlMappings = [];
  
  sites.forEach((site, index) => {
    const personalizedUrl = createPersonalizedUrl(site.url, company, city, phone);
    
    urlMappings.push({
      original_url: personalizedUrl,
      metadata: {
        prospect_id: id,
        business_type: business_type,
        site_index: index,
        site_display_name: site.display_name,
        company: company
      }
    });
  });
  
  return urlMappings;
}

/**
 * Create personalized URL with query parameters
 * @param {string} baseUrl - Base demo site URL
 * @param {string} company - Company name
 * @param {string} city - City name
 * @param {string} phone - Phone number
 * @returns {string} Personalized URL
 */
function createPersonalizedUrl(baseUrl, company, city, phone) {
  try {
    const url = new URL(baseUrl);
    
    // Add personalization parameters
    url.searchParams.set('company', company);
    url.searchParams.set('city', city);
    url.searchParams.set('phone', phone);
    
    return url.toString();
  } catch (error) {
    throw new Error(`Invalid base URL: ${baseUrl}`);
  }
}

/**
 * Group URL mappings by prospect for easier processing
 * @param {Array} urlMappings - Array of URL mappings
 * @returns {Object} Grouped mappings by prospect_id
 */
export function groupUrlsByProspect(urlMappings) {
  const grouped = {};
  
  urlMappings.forEach(mapping => {
    const prospectId = mapping.metadata.prospect_id;
    if (!grouped[prospectId]) {
      grouped[prospectId] = {
        prospect_id: prospectId,
        company: mapping.metadata.company,
        business_type: mapping.metadata.business_type,
        urls: []
      };
    }
    
    grouped[prospectId].urls.push({
      original_url: mapping.original_url,
      display_name: mapping.metadata.site_display_name,
      site_index: mapping.metadata.site_index,
      short_url: null // Will be filled after shortening
    });
  });
  
  return grouped;
}

/**
 * Update URL mappings with shortened URLs
 * @param {Object} groupedMappings - Grouped URL mappings
 * @param {Array} shortenedResults - Results from bulk URL shortener
 * @returns {Object} Updated mappings with short URLs
 */
export function updateWithShortUrls(groupedMappings, shortenedResults) {
  console.log(chalk.blue('🔄 Updating URL mappings with shortened URLs...'));
  
  // Create lookup map from original URL to short URL
  const urlLookup = {};
  shortenedResults.forEach(result => {
    if (result.success && result.data) {
      urlLookup[result.original_url] = result.data.shortUrl;
    }
  });
  
  let updatedCount = 0;
  let failedCount = 0;
  
  // Update grouped mappings
  Object.values(groupedMappings).forEach(prospect => {
    prospect.urls.forEach(url => {
      if (urlLookup[url.original_url]) {
        url.short_url = urlLookup[url.original_url];
        updatedCount++;
      } else {
        console.log(chalk.yellow(`⚠️  No short URL found for: ${url.original_url}`));
        url.short_url = url.original_url; // Fallback to original URL
        failedCount++;
      }
    });
  });
  
  console.log(chalk.green(`✅ Updated ${updatedCount} URLs with short versions`));
  if (failedCount > 0) {
    console.log(chalk.yellow(`⚠️  ${failedCount} URLs failed to shorten (using original URLs)`));
  }
  
  return groupedMappings;
}

/**
 * Validate URL generation results
 * @param {Array} urlMappings - Generated URL mappings
 * @returns {Object} Validation results
 */
export function validateUrlGeneration(urlMappings) {
  const validation = {
    total_urls: urlMappings.length,
    valid_urls: 0,
    invalid_urls: 0,
    prospects_with_urls: new Set(),
    business_types: new Set(),
    errors: []
  };
  
  urlMappings.forEach((mapping, index) => {
    try {
      // Validate URL format
      new URL(mapping.original_url);
      validation.valid_urls++;
      
      // Track prospects and business types
      validation.prospects_with_urls.add(mapping.metadata.prospect_id);
      validation.business_types.add(mapping.metadata.business_type);
      
    } catch (error) {
      validation.invalid_urls++;
      validation.errors.push(`URL ${index + 1}: ${error.message}`);
    }
  });
  
  // Convert sets to counts
  validation.prospects_with_urls = validation.prospects_with_urls.size;
  validation.business_types = Array.from(validation.business_types);
  
  return validation;
}