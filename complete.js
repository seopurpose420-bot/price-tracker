const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

function extractProductData(productUrl) {
    let pos = '2';
    let pid = '';
    
    try {
        if (productUrl.toLowerCase().includes('amazon')) {
            let match = productUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
            if (match) {
                pid = match[1];
                pos = '63';
            }
        } else if (productUrl.toLowerCase().includes('flipkart')) {
            let match = productUrl.match(/[?&]pid=([A-Z0-9]+)/i);
            if (!match) {
                match = productUrl.match(/\/p\/(itm[A-Za-z0-9]+)/i);
            }
            if (match) {
                pid = match[1];
                pos = '2';
            }
        } else if (productUrl.toLowerCase().includes('myntra')) {
            let match = productUrl.match(/\/([0-9]{6,10})(?:\/buy|$|\?)/i);
            if (match) {
                pid = match[1];
                pos = '111';
            }
        } else if (productUrl.toLowerCase().includes('ajio')) {
            let match = productUrl.match(/\/p\/([A-Za-z0-9_-]+)/i);
            if (!match) {
                match = productUrl.match(/\/([A-Za-z0-9_-]{6,})(?:\/|\?|$)/i);
            }
            if (match) {
                pid = match[1];
                pos = '2191';
            }
        } else if (productUrl.toLowerCase().includes('nykaa')) {
            let match = productUrl.match(/\/p\/([0-9]+)/i);
            if (!match) {
                match = productUrl.match(/\/([0-9]{6,12})(?:\/|\?|$)/i);
            }
            if (match) {
                pid = match[1];
                pos = '6068';
            }
        }
        
        console.log(`✅ Extracted: Platform=${getPlatformName(productUrl)}, PID=${pid}, POS=${pos}`);
    } catch (error) {
        console.error('❌ Extraction Error:', error);
    }
    
    return { pos, pid };
}

function getPlatformName(url) {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('amazon')) return 'Amazon';
    if (urlLower.includes('flipkart')) return 'Flipkart';
    if (urlLower.includes('myntra')) return 'Myntra';
    if (urlLower.includes('ajio')) return 'Ajio';
    if (urlLower.includes('nykaa')) return 'Nykaa';
    return 'Unknown';
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading page');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else if (parsedUrl.pathname === '/api/compare') {
        const pid = parsedUrl.query.PID;
        const pos = parsedUrl.query.pos;
        
        if (!pid || !pos) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'PID and pos are required' }));
            return;
        }
        
        const compareUrl = `https://search-new.bitbns.com/buyhatke/comparePrice?PID=${pid}&pos=${pos}`;
        console.log(`📊 Compare API Call: ${compareUrl}`);
        
        https.get(compareUrl, (apiRes) => {
            let data = '';
            
            apiRes.on('data', (chunk) => {
                data += chunk;
            });
            
            apiRes.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(jsonData));
                } catch (parseError) {
                    console.error('❌ Compare Parse Error:', parseError);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid compare API response' }));
                }
            });
        }).on('error', (err) => {
            console.error('❌ Compare API Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch comparison data' }));
        });
    } else if (parsedUrl.pathname === '/api/product') {
        const productUrl = parsedUrl.query.url;
        
        if (!productUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Product URL is required' }));
            return;
        }
        
        console.log(`🔍 Processing URL: ${productUrl}`);
        
        const extractedData = extractProductData(productUrl);
        
        if (!extractedData.pid) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Could not extract product ID from URL',
                details: {
                    platform: getPlatformName(productUrl),
                    originalUrl: productUrl
                }
            }));
            return;
        }
        
        const apiUrl = `https://buyhatke.com/api/productData?pos=${extractedData.pos}&pid=${extractedData.pid}`;
        console.log(`📡 API Call: ${apiUrl}`);
        
        https.get(apiUrl, (apiRes) => {
            let data = '';
            
            apiRes.on('data', (chunk) => {
                data += chunk;
            });
            
            apiRes.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    if (jsonData.status === 1 && jsonData.data) {
                        console.log(`✅ Success: Got data for ${jsonData.data.name}`);
                        jsonData.originalUrl = productUrl;
                        jsonData.extractedPID = extractedData.pid;
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(jsonData));
                    } else {
                        console.log(`⚠️ No data found, generating demo data`);
                        const platformName = getPlatformName(productUrl);
                        const demoData = {
                            status: 1,
                            msg: "Demo Data",
                            data: {
                                name: `[DEMO] Sample ${platformName} Product - ID: ${extractedData.pid}`,
                                image: "https://via.placeholder.com/300x300?text=Demo+Product",
                                cur_price: Math.floor(Math.random() * 50000) + 5000,
                                avg: Math.floor(Math.random() * 60000) + 10000,
                                min: Math.floor(Math.random() * 30000) + 3000,
                                maxall: Math.floor(Math.random() * 80000) + 20000,
                                rating: (Math.random() * 2 + 3).toFixed(1),
                                ratingCount: Math.floor(Math.random() * 10000) + 100,
                                site_name: platformName,
                                site_logo: `https://via.placeholder.com/24x24?text=${platformName.charAt(0)}`,
                                brand: "Demo Brand",
                                category: "Demo Category",
                                inStock: Math.random() > 0.3,
                                pnt: Math.floor(Math.random() * 500) + 50,
                                originalUrl: productUrl
                            }
                        };
                        
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(demoData));
                    }
                } catch (parseError) {
                    console.error('❌ Parse Error:', parseError);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid API response' }));
                }
            });
        }).on('error', (err) => {
            console.error('❌ API Error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to fetch product data' }));
        });
    } else {
        res.writeHead(404);
        res.end('Page not found');
    }
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`🚀 Complete Price Tracker running on http://localhost:${PORT}`);
    console.log(`📊 Features: Product Data + Price Graphs`);
    console.log(`🛒 Supports: Amazon (pos=63), Flipkart (pos=2), Myntra (pos=111), Ajio (pos=2191), Nykaa (pos=6068)`);
    console.log(`🔗 Ready to process URLs from all 5 platforms!`);
});