import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Generate WhatsApp messages for all prospects with their demo links
 * @param {Array} prospects - Array of prospect objects
 * @param {Object} groupedUrls - Grouped URL mappings with short URLs
 * @returns {Promise<Array>} Array of prospects with generated messages
 */
export async function generateWhatsAppMessages(prospects, groupedUrls) {
  console.log(chalk.blue('💬 Generating WhatsApp messages...'));
  
  // Load message templates
  const templatePath = join(__dirname, '..', 'config', 'message-templates.json');
  const templates = await fs.readJson(templatePath);
  
  const results = [];
  let successCount = 0;
  let errorCount = 0;
  
  for (const prospect of prospects) {
    try {
      const urlsForProspect = groupedUrls[prospect.id];
      if (!urlsForProspect || !urlsForProspect.urls || urlsForProspect.urls.length === 0) {
        throw new Error(`No URLs found for prospect ${prospect.id}`);
      }
      
      const message = generateMessageForProspect(prospect, urlsForProspect.urls, templates);
      
      results.push({
        ...prospect,
        whatsapp_message: message,
        demo_urls: urlsForProspect.urls.map(url => ({
          display_name: url.display_name,
          short_url: url.short_url
        }))
      });
      
      successCount++;
    } catch (error) {
      console.log(chalk.red(`❌ Error generating message for ${prospect.company}: ${error.message}`));
      
      // Add prospect with error message
      results.push({
        ...prospect,
        whatsapp_message: `ERROR: Could not generate message - ${error.message}`,
        demo_urls: []
      });
      
      errorCount++;
    }
  }
  
  console.log(chalk.green(`✅ Generated ${successCount} WhatsApp messages`));
  if (errorCount > 0) {
    console.log(chalk.yellow(`⚠️  ${errorCount} messages had errors`));
  }
  
  return results;
}

/**
 * Generate WhatsApp message for a single prospect
 * @param {Object} prospect - Prospect data
 * @param {Array} urls - Array of demo URLs with short URLs
 * @param {Object} templates - Message templates
 * @returns {string} Generated WhatsApp message
 */
function generateMessageForProspect(prospect, urls, templates) {
  const { company, city, business_type } = prospect;
  
  // Get base template
  const baseTemplate = templates.whatsapp;
  
  // Get business type specific customizations
  const customizations = templates.business_type_customization[business_type] || {};
  
  // Build message parts
  const greeting = replaceTemplateVariables(baseTemplate.greeting, { company });
  
  const intro = replaceTemplateVariables(
    customizations.intro || baseTemplate.intro, 
    { business_type, city }
  );
  
  const demoSectionHeader = customizations.demo_section_header || baseTemplate.demo_section_header;
  
  // Generate demo links section
  const demoLinks = urls.map(url => 
    replaceTemplateVariables(baseTemplate.demo_link_format, {
      display_name: url.display_name,
      short_url: url.short_url
    })
  ).join('\\n');
  
  // Combine all parts with \n literal characters (for CSV format)
  const messageParts = [greeting, intro, demoLinks].filter(part => part && part.trim() !== '');
  const message = messageParts.join('\\n\\n');
  
  return message;
}

/**
 * Replace template variables in a string
 * @param {string} template - Template string with {variable} placeholders
 * @param {Object} variables - Variables to replace
 * @returns {string} String with variables replaced
 */
function replaceTemplateVariables(template, variables) {
  let result = template;
  
  Object.entries(variables).forEach(([key, value]) => {
    const placeholder = `{${key}}`;
    result = result.replace(new RegExp(placeholder, 'g'), value);
  });
  
  return result;
}

/**
 * Generate preview messages for first few prospects
 * @param {Array} prospects - Array of prospects with messages
 * @param {number} count - Number of previews to generate
 * @returns {Array} Preview messages
 */
export function generateMessagePreviews(prospects, count = 3) {
  const previews = prospects.slice(0, count).map(prospect => {
    const messageLength = prospect.whatsapp_message.length;
    const urlCount = prospect.demo_urls?.length || 0;
    
    return {
      company: prospect.company,
      business_type: prospect.business_type,
      message_preview: prospect.whatsapp_message.substring(0, 200) + '...',
      message_length: messageLength,
      demo_urls_count: urlCount,
      estimated_sms_parts: Math.ceil(messageLength / 160) // Rough SMS part estimate
    };
  });
  
  return previews;
}

/**
 * Validate generated messages
 * @param {Array} prospects - Array of prospects with messages
 * @returns {Object} Validation results
 */
export function validateMessages(prospects) {
  const validation = {
    total_messages: prospects.length,
    valid_messages: 0,
    messages_with_errors: 0,
    average_length: 0,
    length_distribution: {
      short: 0,    // < 500 chars
      medium: 0,   // 500-1000 chars
      long: 0,     // 1000-2000 chars
      very_long: 0 // > 2000 chars
    },
    url_count_distribution: {},
    errors: []
  };
  
  let totalLength = 0;
  
  prospects.forEach((prospect, index) => {
    const message = prospect.whatsapp_message;
    const messageLength = message.length;
    totalLength += messageLength;
    
    // Check for error messages
    if (message.startsWith('ERROR:')) {
      validation.messages_with_errors++;
      validation.errors.push(`${prospect.company}: ${message}`);
    } else {
      validation.valid_messages++;
    }
    
    // Length distribution
    if (messageLength < 500) {
      validation.length_distribution.short++;
    } else if (messageLength < 1000) {
      validation.length_distribution.medium++;
    } else if (messageLength < 2000) {
      validation.length_distribution.long++;
    } else {
      validation.length_distribution.very_long++;
    }
    
    // URL count distribution
    const urlCount = prospect.demo_urls?.length || 0;
    validation.url_count_distribution[urlCount] = 
      (validation.url_count_distribution[urlCount] || 0) + 1;
    
    // Validate message content
    if (!message.includes(prospect.company)) {
      validation.errors.push(`${prospect.company}: Message doesn't include company name`);
    }
    
    if (!message.includes(prospect.city)) {
      validation.errors.push(`${prospect.company}: Message doesn't include city name`);
    }
    
    if (prospect.demo_urls && prospect.demo_urls.length > 0) {
      const hasLinks = prospect.demo_urls.some(url => message.includes(url.short_url));
      if (!hasLinks) {
        validation.errors.push(`${prospect.company}: Message doesn't include any demo links`);
      }
    }
  });
  
  validation.average_length = Math.round(totalLength / prospects.length);
  
  return validation;
}

/**
 * Create message statistics summary
 * @param {Array} prospects - Array of prospects with messages
 * @returns {Object} Statistics summary
 */
export function getMessageStatistics(prospects) {
  const stats = {
    total_prospects: prospects.length,
    total_characters: 0,
    total_demo_links: 0,
    business_type_breakdown: {},
    longest_message: { length: 0, company: '' },
    shortest_message: { length: Infinity, company: '' }
  };
  
  prospects.forEach(prospect => {
    const messageLength = prospect.whatsapp_message.length;
    const urlCount = prospect.demo_urls?.length || 0;
    
    stats.total_characters += messageLength;
    stats.total_demo_links += urlCount;
    
    // Business type breakdown
    const businessType = prospect.business_type;
    if (!stats.business_type_breakdown[businessType]) {
      stats.business_type_breakdown[businessType] = {
        count: 0,
        total_characters: 0,
        total_links: 0
      };
    }
    
    stats.business_type_breakdown[businessType].count++;
    stats.business_type_breakdown[businessType].total_characters += messageLength;
    stats.business_type_breakdown[businessType].total_links += urlCount;
    
    // Track longest/shortest messages
    if (messageLength > stats.longest_message.length) {
      stats.longest_message = { length: messageLength, company: prospect.company };
    }
    
    if (messageLength < stats.shortest_message.length) {
      stats.shortest_message = { length: messageLength, company: prospect.company };
    }
  });
  
  // Calculate averages for business types
  Object.values(stats.business_type_breakdown).forEach(breakdown => {
    breakdown.avg_characters = Math.round(breakdown.total_characters / breakdown.count);
    breakdown.avg_links = Math.round(breakdown.total_links / breakdown.count * 100) / 100;
  });
  
  stats.average_characters = Math.round(stats.total_characters / prospects.length);
  stats.average_demo_links = Math.round(stats.total_demo_links / prospects.length * 100) / 100;
  
  return stats;
}