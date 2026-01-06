/**
 * Build script to minify and obfuscate JavaScript in admin.html
 * This makes the code much harder to read in the browser
 * 
 * Usage: node build.js
 */

const fs = require('fs');
const path = require('path');

// Check if terser is installed
let terser;
try {
    terser = require('terser');
} catch (e) {
    console.log('Installing terser for minification...');
    require('child_process').execSync('npm install terser --save-dev', { stdio: 'inherit' });
    terser = require('terser');
}

async function build() {
    console.log('🔨 Building production version of admin.html...');
    
    const inputFile = path.join(__dirname, 'admin.html');
    const outputFile = path.join(__dirname, 'admin.min.html');
    
    // Read the HTML file
    let html = fs.readFileSync(inputFile, 'utf8');
    
    // Extract JavaScript from <script> tags (not src scripts)
    const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
    let match;
    
    while ((match = scriptRegex.exec(html)) !== null) {
        const originalScript = match[0];
        const jsCode = match[1];
        
        // Skip empty scripts or scripts that are just comments
        if (!jsCode.trim() || jsCode.trim().startsWith('//') && jsCode.trim().split('\n').length === 1) {
            continue;
        }
        
        try {
            // Minify the JavaScript
            const minified = await terser.minify(jsCode, {
                compress: {
                    drop_console: false,  // Keep console logs for debugging
                    dead_code: true,
                    conditionals: true,
                    booleans: true,
                    unused: true,
                    if_return: true,
                    join_vars: true
                },
                mangle: {
                    toplevel: false,  // Don't mangle top-level names (they might be accessed globally)
                    reserved: [
                        // Reserve globally accessed names
                        'App', 'Auth', 'Modal', 'Toast', 'Utils', 'State',
                        'ApiService', 'SyncManager', 'AuditService',
                        'InventoryService', 'ServiceTicketService', 'TransactionService',
                        'PartsService', 'PartsInventoryService', 'TradeInService',
                        'RepricingEngine', 'ForecastingEngine',
                        'DashboardUI', 'InventoryUI', 'TradeUI', 'ServiceUI',
                        'TrackingUI', 'FinanceUI', 'ForecastUI', 'AuditUI',
                        'BackupUI', 'PartsInventoryUI', 'TradeInRequestsUI',
                        'PublicTradeInUI', 'UsersUI', 'SettingsUI', 'BulkPartsUI',
                        'TradeEngine', 'DataLoader',
                        // Data constants
                        'PHONE_DEVICES', 'IPHONE_DEVICES', 'IPHONE_PART_TYPES',
                        'QUALITY_TYPES', 'COLOR_OPTIONS', 'CONSOLE_DEVICES',
                        'CONSOLE_PART_TYPES', 'CONSOLE_PART_CATEGORIES',
                        'PHONE_PART_CATEGORIES', 'SERVICE_STATUSES', 'TRADEIN_STATUSES',
                        'API_URL', 'USE_API', 'STORAGE_KEY'
                    ]
                },
                output: {
                    comments: false  // Remove all comments
                }
            });
            
            if (minified.code) {
                html = html.replace(originalScript, `<script>${minified.code}</script>`);
                console.log(`  ✅ Minified JavaScript block (${jsCode.length} -> ${minified.code.length} bytes)`);
            }
        } catch (err) {
            console.error(`  ⚠️ Error minifying JS block:`, err.message);
        }
    }
    
    // Also minify CSS if present
    const styleRegex = /<style>([\s\S]*?)<\/style>/gi;
    while ((match = styleRegex.exec(html)) !== null) {
        const originalStyle = match[0];
        const cssCode = match[1];
        
        // Simple CSS minification
        const minifiedCSS = cssCode
            .replace(/\/\*[\s\S]*?\*\//g, '')  // Remove comments
            .replace(/\s+/g, ' ')  // Collapse whitespace
            .replace(/\s*{\s*/g, '{')
            .replace(/\s*}\s*/g, '}')
            .replace(/\s*;\s*/g, ';')
            .replace(/\s*:\s*/g, ':')
            .replace(/\s*,\s*/g, ',')
            .trim();
        
        html = html.replace(originalStyle, `<style>${minifiedCSS}</style>`);
        console.log(`  ✅ Minified CSS block (${cssCode.length} -> ${minifiedCSS.length} bytes)`);
    }
    
    // Write the minified HTML
    fs.writeFileSync(outputFile, html);
    
    const originalSize = fs.statSync(inputFile).size;
    const minifiedSize = fs.statSync(outputFile).size;
    const savings = ((1 - minifiedSize / originalSize) * 100).toFixed(1);
    
    console.log('');
    console.log(`📦 Build complete!`);
    console.log(`   Original:  ${(originalSize / 1024).toFixed(1)} KB`);
    console.log(`   Minified:  ${(minifiedSize / 1024).toFixed(1)} KB`);
    console.log(`   Savings:   ${savings}%`);
    console.log('');
    console.log(`📁 Output: ${outputFile}`);
    console.log('');
    console.log('💡 To use the minified version in production:');
    console.log('   1. Deploy admin.min.html instead of admin.html');
    console.log('   2. Or rename admin.min.html to admin.html for deployment');
}

build().catch(console.error);
