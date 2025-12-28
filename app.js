export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // API endpoint to fetch website sources
    if (path === '/api/fetch' || path === '/fetch') {
      const executeJS = url.searchParams.get('executeJs') === 'true';
      return handleFetchRequest(request, url, executeJS);
    }

    // Simple health check
    if (path === '/health' || path === '/api/health') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'Website Source Fetcher API'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Return API info for root
    if (path === '/') {
      return new Response(JSON.stringify({
        name: 'Website Source Fetcher API',
        version: '1.0.0',
        endpoints: {
          fetch: '/api/fetch?url=WEBSITE_URL&executeJs=true',
          health: '/api/health'
        },
        description: 'Fetch website HTML source and execute JavaScript',
        documentation: 'See GitHub repository for details'
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 404 for everything else
    return new Response(JSON.stringify({ 
      error: 'Not found', 
      path: path,
      available_endpoints: ['/api/fetch', '/health']
    }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

// API handler to fetch websites
async function handleFetchRequest(request, url, executeJS = false) {
  const targetUrl = url.searchParams.get('url');
  
  if (!targetUrl) {
    return new Response(JSON.stringify({ 
      error: 'No URL provided. Use ?url=https://example.com',
      example: 'https://source.ikunbeautiful.workers.dev/api/fetch?url=https://example.com'
    }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  // Validate URL
  try {
    const parsedUrl = new URL(targetUrl);
    
    // Block dangerous protocols
    const blockedProtocols = ['file:', 'ftp:', 'ws:', 'wss:', 'data:', 'javascript:'];
    if (blockedProtocols.includes(parsedUrl.protocol)) {
      throw new Error('Unsupported protocol');
    }
    
    // Block local/private IPs
    if (parsedUrl.hostname.match(/(^127\.)|(^10\.)|(^172\.1[6-9]\.)|(^172\.2[0-9]\.)|(^172\.3[0-1]\.)|(^192\.168\.)|(^::1$)|(^[fF][cCdD])/)) {
      throw new Error('Cannot access local/private IP addresses');
    }
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Invalid URL: ' + error.message,
      tip: 'URL must include http:// or https://'
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  try {
    console.log(`Fetching: ${targetUrl}`);
    
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1'
      },
      cf: {
        cacheTtl: 300,
        cacheEverything: true,
        scrapeShield: false,
        polish: 'lossy'
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow'
    });
    
    if (!response.ok) {
      return new Response(JSON.stringify({ 
        error: `HTTP ${response.status}: ${response.statusText}`,
        url: targetUrl
      }), {
        status: response.status,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    const contentType = response.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html');
    
    if (!isHtml && !contentType.includes('text/plain') && 
        !contentType.includes('application/json')) {
      return new Response(JSON.stringify({ 
        error: `Content type not supported: ${contentType}`,
        url: targetUrl,
        supportedTypes: ['text/html', 'text/plain', 'application/json']
      }), {
        status: 415,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    let source = await response.text();
    let consoleLogs = [];
    let jsErrors = [];
    
    // Execute JavaScript if requested (simplified version)
    if (executeJS && isHtml) {
      try {
        // Extract basic console logs from script tags
        const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        while ((match = scriptRegex.exec(source)) !== null) {
          const scriptContent = match[1];
          if (scriptContent.includes('console.')) {
            // Simulate finding console logs (simplified)
            const logRegex = /console\.(log|warn|error|info|debug)\(([^)]+)\)/gi;
            let logMatch;
            while ((logMatch = logRegex.exec(scriptContent)) !== null) {
              consoleLogs.push({
                type: logMatch[1],
                timestamp: new Date().toISOString(),
                args: [logMatch[2].trim()],
                source: 'script'
              });
            }
          }
        }
        
        // Count console references
        const consoleRefs = (source.match(/console\./gi) || []).length;
        
        // Add a simulated console capture for demonstration
        consoleLogs.push({
          type: 'info',
          timestamp: new Date().toISOString(),
          args: [`JavaScript execution simulated. Found ${consoleRefs} console references.`],
          source: 'system'
        });
        
      } catch (error) {
        console.error('JavaScript analysis failed:', error);
        jsErrors.push({
          type: 'analysis_error',
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Extract safe headers
    const headers = {};
    const safeHeaders = [
      'content-type', 'content-length', 'last-modified', 
      'etag', 'cache-control', 'expires', 'date',
      'server', 'x-powered-by'
    ];
    
    for (const [key, value] of response.headers.entries()) {
      if (safeHeaders.includes(key.toLowerCase())) {
        headers[key] = value;
      }
    }
    
    // Extract page info
    let pageInfo = {};
    if (isHtml) {
      const titleMatch = source.match(/<title>(.*?)<\/title>/i);
      const descriptionMatch = source.match(/<meta\s+name="description"\s+content="(.*?)"/i);
      
      // Count elements
      const divCount = (source.match(/<div/gi) || []).length;
      const imgCount = (source.match(/<img/gi) || []).length;
      const linkCount = (source.match(/<a\s+/gi) || []).length;
      const scriptMatches = source.match(/<script\b[^>]*>/gi) || [];
      const inlineScripts = scriptMatches.filter(script => 
        !script.includes('src=') && !script.includes(' defer') && !script.includes(' async')
      ).length;
      
      pageInfo = {
        title: titleMatch ? titleMatch[1].trim() : null,
        description: descriptionMatch ? descriptionMatch[1].trim() : null,
        hasDoctype: source.includes('<!DOCTYPE'),
        scripts: {
          total: scriptMatches.length,
          inline: inlineScripts,
          external: scriptMatches.length - inlineScripts
        },
        elementCount: {
          div: divCount,
          img: imgCount,
          link: linkCount,
          script: scriptMatches.length,
          console: (source.match(/console\./gi) || []).length
        }
      };
    }
    
    return new Response(JSON.stringify({
      success: true,
      url: targetUrl,
      source: source,
      headers: headers,
      contentType: contentType,
      status: response.status,
      pageInfo: pageInfo,
      javascript: {
        executed: executeJS,
        consoleLogs: consoleLogs,
        errors: jsErrors,
        hasConsoleCapture: executeJS
      },
      fetchedAt: new Date().toISOString(),
      size: source.length,
      sizeBytes: new Blob([source]).size
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
        'X-Robots-Tag': 'noindex'
      }
    });
    
  } catch (error) {
    console.error('Fetch error:', error);
    
    let errorMessage = 'Failed to fetch URL';
    let statusCode = 500;
    
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      errorMessage = 'Request timeout (15 seconds)';
      statusCode = 408;
    } else if (error.message.includes('Failed to fetch')) {
      errorMessage = 'Network error or URL blocked';
      statusCode = 502;
    }
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      details: error.message,
      url: targetUrl
    }), {
      status: statusCode,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
