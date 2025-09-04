import fs from 'fs-extra';
import csv from 'csv-parser';
import { createReadStream } from 'fs';
import chalk from 'chalk';

/**
 * Parse prospects CSV file and validate data format
 * @param {string} filePath - Path to CSV file
 * @returns {Promise<Array>} Array of prospect objects
 */
export async function parseProspectsCSV(filePath) {
  const prospects = [];
  let rowCount = 0;
  const errors = [];
  
  // Check if file exists
  if (!await fs.pathExists(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  console.log(chalk.blue(`📖 Parsing CSV file: ${filePath}`));

  return new Promise((resolve, reject) => {
    createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        rowCount++;
        
        try {
          const prospect = validateAndCleanProspect(row, rowCount);
          prospects.push(prospect);
        } catch (error) {
          errors.push(`Row ${rowCount}: ${error.message}`);
        }
      })
      .on('end', () => {
        if (errors.length > 0) {
          console.log(chalk.yellow(`⚠️  Found ${errors.length} validation errors:`));
          errors.slice(0, 10).forEach(error => console.log(chalk.yellow(`   ${error}`)));
          if (errors.length > 10) {
            console.log(chalk.yellow(`   ... and ${errors.length - 10} more errors`));
          }
        }

        if (prospects.length === 0) {
          reject(new Error('No valid prospects found in CSV file'));
          return;
        }

        console.log(chalk.green(`✅ Successfully parsed ${prospects.length} prospects from ${rowCount} rows`));
        
        // Show business type breakdown
        const businessTypes = prospects.reduce((acc, p) => {
          acc[p.business_type] = (acc[p.business_type] || 0) + 1;
          return acc;
        }, {});
        
        console.log(chalk.blue('📊 Business type breakdown:'));
        Object.entries(businessTypes).forEach(([type, count]) => {
          console.log(chalk.blue(`   ${type}: ${count} prospects`));
        });

        resolve(prospects);
      })
      .on('error', (error) => {
        reject(new Error(`CSV parsing error: ${error.message}`));
      });
  });
}

/**
 * Validate and clean individual prospect data
 * @param {Object} row - Raw CSV row data
 * @param {number} rowNumber - Row number for error reporting
 * @returns {Object} Clean prospect object
 */
function validateAndCleanProspect(row, rowNumber) {
  // Required fields
  const requiredFields = ['company', 'city', 'phone', 'business_type'];
  const missing = requiredFields.filter(field => !row[field] || row[field].trim() === '');
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  // Clean and validate data
  const company = cleanCompanyName(row.company);
  const city = cleanCityName(row.city);
  const phone = cleanPhoneNumber(row.phone);
  const business_type = validateBusinessType(row.business_type);

  // Generate unique ID for tracking
  const id = `prospect_${rowNumber.toString().padStart(4, '0')}`;

  return {
    id,
    company,
    city,
    phone,
    business_type,
    original_row: rowNumber
  };
}

/**
 * Clean company name
 */
function cleanCompanyName(company) {
  if (!company || company.trim().length === 0) {
    throw new Error('Company name cannot be empty');
  }
  
  // Remove extra whitespace and ensure proper capitalization
  const cleaned = company.trim().replace(/\s+/g, ' ');
  
  if (cleaned.length > 100) {
    throw new Error('Company name too long (max 100 characters)');
  }
  
  return cleaned;
}

/**
 * Clean city name
 */
function cleanCityName(city) {
  if (!city || city.trim().length === 0) {
    throw new Error('City name cannot be empty');
  }
  
  const cleaned = city.trim().replace(/\s+/g, ' ');
  
  if (cleaned.length > 50) {
    throw new Error('City name too long (max 50 characters)');
  }
  
  return cleaned;
}

/**
 * Clean and validate phone number
 */
function cleanPhoneNumber(phone) {
  if (!phone || phone.trim().length === 0) {
    throw new Error('Phone number cannot be empty');
  }
  
  // Remove all non-digit characters except parentheses and hyphens
  const cleaned = phone.trim();
  
  // Basic validation - should contain at least 10 digits
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 10) {
    throw new Error('Phone number must contain at least 10 digits');
  }
  
  return cleaned;
}

/**
 * Validate business type
 */
function validateBusinessType(businessType) {
  if (!businessType || businessType.trim().length === 0) {
    throw new Error('Business type cannot be empty');
  }
  
  const cleaned = businessType.trim().toLowerCase();
  const validTypes = ['plumbing', 'landscaping', 'general'];
  
  if (!validTypes.includes(cleaned)) {
    // Auto-correct common variations
    const corrections = {
      'plumber': 'plumbing',
      'plumbers': 'plumbing',
      'landscape': 'landscaping',
      'landscaper': 'landscaping',
      'landscapers': 'landscaping',
      'garden': 'landscaping',
      'gardening': 'landscaping',
      'other': 'general',
      'misc': 'general',
      'service': 'general'
    };
    
    if (corrections[cleaned]) {
      console.log(chalk.yellow(`   Auto-corrected business type: "${businessType}" → "${corrections[cleaned]}"`));
      return corrections[cleaned];
    }
    
    throw new Error(`Invalid business type: "${businessType}". Must be one of: ${validTypes.join(', ')}`);
  }
  
  return cleaned;
}

/**
 * Get summary statistics for parsed prospects
 */
export function getProspectsSummary(prospects) {
  const summary = {
    total: prospects.length,
    by_business_type: {},
    by_city: {},
    sample_companies: prospects.slice(0, 5).map(p => p.company)
  };
  
  prospects.forEach(prospect => {
    // Business type breakdown
    summary.by_business_type[prospect.business_type] = 
      (summary.by_business_type[prospect.business_type] || 0) + 1;
    
    // City breakdown
    summary.by_city[prospect.city] = 
      (summary.by_city[prospect.city] || 0) + 1;
  });
  
  return summary;
}