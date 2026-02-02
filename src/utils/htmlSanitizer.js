const sanitize = require('sanitize-html');

/**
 * Sanitize HTML content - loại bỏ malicious code, giữ lại format cần thiết
 * @param {string} html - HTML content cần sanitize
 * @returns {string} - HTML đã được sanitize
 */
/**
 * Sanitize HTML content từ CKEditor hoặc các rich text editor khác
 * Loại bỏ malicious code, giữ lại format cần thiết cho content editor
 */
const sanitizeHTML = (html) => {
  if (!html) return '';
  
  return sanitize(html, {
    // Cho phép các HTML tags cần thiết cho CKEditor
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'hr',
      'strong', 'em', 'u', 's', 'b', 'i', 'sub', 'sup',
      'ul', 'ol', 'li',
      'a', 'img',
      'blockquote', 'pre', 'code',
      'div', 'span',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    ],
    
    // Cho phép các attributes cho CKEditor
    allowedAttributes: {
      'a': ['href', 'target', 'rel', 'title'],
      'img': ['src', 'alt', 'title', 'width', 'height', 'style'], // Cho phép style cho ảnh (alignment)
      '*': ['class', 'id'],
      'th': ['colspan', 'rowspan', 'scope'],
      'td': ['colspan', 'rowspan'],
      'table': ['border', 'cellpadding', 'cellspacing', 'width'],
      'p': ['style'], // Cho phép style cho paragraph (text-align, etc.)
      'div': ['style'], // Cho phép style cho div (text-align, etc.)
      'span': ['style'], // Cho phép style cho span (color, font-size, etc.)
    },
    
    // Không cho phép data attributes (có thể chứa malicious code)
    allowDataAttributes: false,
    
    // Sanitize style attribute - chỉ cho phép các style an toàn
    allowedStyles: {
      '*': {
        // Text formatting
        'color': [/^#[0-9a-fA-F]{3,6}$/, /^rgb\(/, /^rgba\(/, /^hsl\(/, /^hsla\(/, /^transparent$/, /^inherit$/, /^initial$/, /^unset$/],
        'text-align': [/^left$/, /^right$/, /^center$/, /^justify$/],
        'font-size': [/^[\d.]+(px|em|rem|%)$/],
        'font-weight': [/^normal$/, /^bold$/, /^bolder$/, /^lighter$/, /^\d+$/],
        'font-style': [/^normal$/, /^italic$/, /^oblique$/],
        'text-decoration': [/^none$/, /^underline$/, /^line-through$/, /^overline$/],
        // Layout
        'margin': [/^[\d.]+(px|em|rem|%)$/],
        'margin-top': [/^[\d.]+(px|em|rem|%)$/],
        'margin-bottom': [/^[\d.]+(px|em|rem|%)$/],
        'margin-left': [/^[\d.]+(px|em|rem|%)$/],
        'margin-right': [/^[\d.]+(px|em|rem|%)$/],
        'padding': [/^[\d.]+(px|em|rem|%)$/],
        'width': [/^[\d.]+(px|em|rem|%)$/, /^auto$/, /^100%$/],
        'height': [/^[\d.]+(px|em|rem|%)$/, /^auto$/],
        // Image alignment (cho CKEditor)
        'float': [/^left$/, /^right$/, /^none$/],
        'display': [/^block$/, /^inline$/, /^inline-block$/, /^none$/],
      },
      'img': {
        'max-width': [/^[\d.]+(px|em|rem|%)$/, /^100%$/],
        'height': [/^auto$/, /^[\d.]+(px|em|rem|%)$/],
      },
    },
    
    // Tự động thêm rel="noopener" cho link external
    transformTags: {
      'a': (tagName, attribs) => {
        if (attribs.href && (attribs.href.startsWith('http://') || attribs.href.startsWith('https://'))) {
          attribs.target = attribs.target || '_blank';
          attribs.rel = 'noopener noreferrer';
        }
        return { tagName, attribs };
      },
    },
    
    // Chỉ cho phép safe URL schemes
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: {
      'img': ['http', 'https', 'data'],  // Cho phép data URLs cho ảnh (base64)
    },
    
    // Không cho phép iframe
    allowedIframeHostnames: [],
  });
};

// Whitelist domains cho phép load ảnh (chỉ domains tin cậy)
const TRUSTED_IMAGE_DOMAINS = [
  'res.cloudinary.com',      // Cloudinary CDN (bắt buộc)
  'upload.wikimedia.org',    // Wikipedia/Wikimedia Commons (nguồn ảnh công khai, tin cậy)
  'commons.wikimedia.org',   // Wikimedia Commons alternative
  // Thêm các domains tin cậy khác nếu cần:
  // 'cdn.example.com',
  // 'images.example.com',
];

/**
 * Validate image URL - kiểm tra URL ảnh có hợp lệ và an toàn không
 * @param {string} url - URL cần validate
 * @returns {boolean} - true nếu hợp lệ và an toàn
 */
const isValidImageURL = (url) => {
  if (!url) return false;
  
  // Cho phép data URLs (base64 images) - từ upload
  if (url.startsWith('data:image/')) {
    // Validate base64 format
    return /^data:image\/(jpeg|jpg|png|gif|webp);base64,/.test(url);
  }
  
  // Cho phép http/https URLs
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // Check whitelist domains - chỉ cho phép domains tin cậy
      const isTrusted = TRUSTED_IMAGE_DOMAINS.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
      );
      
      if (!isTrusted) {
        return false; // Block untrusted domains
      }
      
      // Validate file extension (nên có extension để đảm bảo là ảnh)
      const pathname = urlObj.pathname.toLowerCase();
      
      // Cloudinary URLs không cần extension (có transformation params)
      if (hostname.includes('cloudinary.com')) {
        return true; // Cloudinary URLs luôn được tin cậy
      }
      
      // Các domains khác phải có image extension
      const hasImageExtension = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(pathname);
      if (!hasImageExtension) {
        // Block URLs không có extension (như image.php)
        return false;
      }
      
      return true;
    } catch {
      return false; // Invalid URL format
    }
  }
  
  // Block javascript:, file:, etc.
  return false;
};

/**
 * Decode HTML entities trong URL
 * @param {string} url - URL có thể chứa HTML entities
 * @returns {string} - URL đã được decode
 */
const decodeHTMLEntities = (url) => {
  if (!url) return url;
  // Decode các HTML entities phổ biến
  return url
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
};

/**
 * Phân tích lý do URL ảnh đáng ngờ
 * @param {string} url - URL cần phân tích
 * @returns {object} - { reason: string, domain: string, details: string }
 */
const analyzeSuspiciousImageURL = (url) => {
  if (!url) {
    return { reason: 'URL rỗng', domain: '', details: 'URL không hợp lệ' };
  }
  
  // Data URL
  if (url.startsWith('data:image/')) {
    const isValid = /^data:image\/(jpeg|jpg|png|gif|webp);base64,/.test(url);
    if (!isValid) {
      return { 
        reason: 'Base64 không hợp lệ', 
        domain: 'data URL', 
        details: 'Format base64 không đúng hoặc không phải định dạng ảnh hợp lệ' 
      };
    }
  }
  
  // HTTP/HTTPS URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname.toLowerCase();
      
      // Check domain
      const isTrusted = TRUSTED_IMAGE_DOMAINS.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
      );
      
      if (!isTrusted) {
        // Check extension
        const hasImageExtension = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(pathname);
        
        if (!hasImageExtension) {
          // Không có extension hoặc extension không phải ảnh
          const fileExtension = pathname.split('.').pop()?.split('?')[0] || 'không có';
          return {
            reason: 'Domain không tin cậy và không có extension ảnh hợp lệ',
            domain: hostname,
            details: `Domain "${hostname}" không nằm trong danh sách tin cậy và file "${pathname}" không có extension ảnh hợp lệ (.jpg, .png, .gif, .webp). Extension hiện tại: "${fileExtension}"`
          };
        } else {
          // Có extension nhưng domain không tin cậy
          return {
            reason: 'Domain không tin cậy',
            domain: hostname,
            details: `Domain "${hostname}" không nằm trong danh sách tin cậy. Chỉ cho phép ảnh từ: ${TRUSTED_IMAGE_DOMAINS.join(', ')}`
          };
        }
      }
    } catch (e) {
      return {
        reason: 'URL không hợp lệ',
        domain: '',
        details: `URL không đúng định dạng: ${e.message}`
      };
    }
  }
  
  // Blocked schemes (javascript:, file:, etc.)
  return {
    reason: 'Scheme không được phép',
    domain: '',
    details: `URL sử dụng scheme không được phép. Chỉ cho phép http://, https:// hoặc data:image/`
  };
};

/**
 * Validate và detect các mối nguy hiểm bảo mật trong HTML
 * @param {string} html - HTML content
 * @returns {object} - { valid: boolean, message: string, threats: array }
 */
const validateHTMLSecurity = (html) => {
  if (!html) return { valid: true, message: '', threats: [] };
  
  const threats = []; // { type: string, content: string, reason: string }
  
  // Normalize HTML - chuyển multi-line tags thành single line
  let normalized = html.replace(/<([^>]+)>/gi, (match, content) => {
    const cleanContent = content.replace(/\s+/g, ' ').trim();
    return `<${cleanContent}>`;
  });
  
  // 1. Detect script tags (bất kỳ type nào)
  const scriptMatches = normalized.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const scriptTag of scriptMatches) {
    const typeMatch = scriptTag.match(/type\s*=\s*["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1] : 'default';
    threats.push({
      type: 'script_tag',
      content: scriptTag.substring(0, 100) + (scriptTag.length > 100 ? '...' : ''),
      reason: `Phát hiện thẻ <script> (type: ${type}). Thẻ script không được phép trong nội dung.`,
    });
  }
  
  // 2. Detect iframe tags
  const iframeMatches = normalized.match(/<iframe[^>]*>/gi) || [];
  for (const iframeTag of iframeMatches) {
    const srcMatch = iframeTag.match(/src\s*=\s*["']([^"']+)["']/i);
    const src = srcMatch ? decodeHTMLEntities(srcMatch[1]) : 'không có';
    threats.push({
      type: 'iframe_tag',
      content: iframeTag,
      reason: `Phát hiện thẻ <iframe> (src: ${src}). Thẻ iframe không được phép trong nội dung.`,
    });
  }
  
  // 3. Detect object, embed tags
  const objectMatches = normalized.match(/<(object|embed)[^>]*>/gi) || [];
  for (const tag of objectMatches) {
    const tagName = tag.match(/<(\w+)/i)?.[1] || 'unknown';
    threats.push({
      type: `${tagName}_tag`,
      content: tag,
      reason: `Phát hiện thẻ <${tagName}>. Thẻ này không được phép trong nội dung.`,
    });
  }
  
  // 4. Detect form, input, button tags (có thể dùng để phishing)
  const formMatches = normalized.match(/<(form|input|button|select|textarea)[^>]*>/gi) || [];
  for (const tag of formMatches) {
    const tagName = tag.match(/<(\w+)/i)?.[1] || 'unknown';
    threats.push({
      type: `${tagName}_tag`,
      content: tag,
      reason: `Phát hiện thẻ <${tagName}>. Thẻ form không được phép trong nội dung.`,
    });
  }
  
  // 5. Detect event handlers (onclick, onerror, onload, etc.)
  const eventHandlerPattern = /\s(on\w+)\s*=\s*["']([^"']+)["']/gi;
  let eventMatch;
  while ((eventMatch = eventHandlerPattern.exec(normalized)) !== null) {
    const eventName = eventMatch[1];
    const eventValue = eventMatch[2];
    threats.push({
      type: 'event_handler',
      content: `${eventName}="${eventValue.substring(0, 50)}${eventValue.length > 50 ? '...' : ''}"`,
      reason: `Phát hiện event handler "${eventName}". Event handlers không được phép trong nội dung.`,
    });
  }
  
  // 6. Detect javascript: URLs trong href/src
  const jsUrlPattern = /(href|src)\s*=\s*["'](javascript:[^"']+)["']/gi;
  let jsUrlMatch;
  while ((jsUrlMatch = jsUrlPattern.exec(normalized)) !== null) {
    const attr = jsUrlMatch[1];
    const url = decodeHTMLEntities(jsUrlMatch[2]);
    threats.push({
      type: 'javascript_url',
      content: `${attr}="${url.substring(0, 80)}${url.length > 80 ? '...' : ''}"`,
      reason: `Phát hiện URL javascript: trong thuộc tính ${attr}. URL javascript: không được phép.`,
    });
  }
  
  // 7. Detect data attributes nguy hiểm (có thể chứa malicious code)
  const dataAttrPattern = /\sdata-\w+[^=]*\s*=\s*["']([^"']*javascript[^"']*)["']/gi;
  let dataMatch;
  while ((dataMatch = dataAttrPattern.exec(normalized)) !== null) {
    const attrName = dataMatch[0].match(/data-(\w+)/i)?.[1] || 'unknown';
    threats.push({
      type: 'data_attribute',
      content: dataMatch[0].substring(0, 100),
      reason: `Phát hiện data attribute "${attrName}" chứa javascript. Data attributes chứa code không được phép.`,
    });
  }
  
  // 8. Detect style attributes có expression() hoặc javascript:
  const stylePattern = /style\s*=\s*["']([^"']*expression\s*\([^"']*|javascript:[^"']*)["']/gi;
  let styleMatch;
  while ((styleMatch = stylePattern.exec(normalized)) !== null) {
    const styleValue = styleMatch[1];
    threats.push({
      type: 'dangerous_style',
      content: `style="${styleValue.substring(0, 80)}${styleValue.length > 80 ? '...' : ''}"`,
      reason: `Phát hiện style attribute chứa expression() hoặc javascript:. Style nguy hiểm không được phép.`,
    });
  }
  
  if (threats.length > 0) {
    // Tạo message ngắn gọn
    const threatTypes = [...new Set(threats.map(t => t.type))];
    const message = `Phát hiện ${threats.length} mối nguy hiểm bảo mật trong nội dung: ${threatTypes.join(', ')}. Vui lòng loại bỏ các thẻ script, iframe, event handlers và các nội dung không đáng tin cậy.`;
    
    return {
      valid: false,
      message: message,
      threats: threats,
    };
  }
  
  return { valid: true, message: '', threats: [] };
};

/**
 * Validate và detect ảnh đáng ngờ trong HTML
 * @param {string} html - HTML content
 * @returns {object} - { valid: boolean, message: string, suspiciousUrls: array }
 */
const validateHTMLImages = (html) => {
  if (!html) return { valid: true, message: '', suspiciousUrls: [] };
  
  const suspiciousImages = []; // { url, reason, domain, details }
  
  // Normalize HTML - chuyển multi-line img tags thành single line
  let normalized = html.replace(/<img\s+([\s\S]*?)>/gi, (match, attributes) => {
    const cleanAttrs = attributes.replace(/\s+/g, ' ').trim();
    return `<img ${cleanAttrs}>`;
  });
  
  // Extract tất cả img tags và validate
  const imgMatches = normalized.match(/<img[^>]+>/gi) || [];
  
  for (const imgTag of imgMatches) {
    // Extract src attribute
    const srcMatch = imgTag.match(/src\s*=\s*["']([^"']+)["']/i) || 
                     imgTag.match(/src\s*=\s*([^\s>]+)/i);
    
    if (!srcMatch) {
      continue; // Skip img tag without src
    }
    
    // Decode HTML entities trong URL
    let src = decodeHTMLEntities(srcMatch[1]);
    
    // Validate image URL
    if (!isValidImageURL(src)) {
      const analysis = analyzeSuspiciousImageURL(src);
      suspiciousImages.push({
        url: src,
        reason: analysis.reason,
        domain: analysis.domain,
        details: analysis.details,
      });
    }
  }
  
  if (suspiciousImages.length > 0) {
    // Tạo message ngắn gọn
    const urlsList = suspiciousImages.map((img) => img.url).join(', ');
    const message = `Phát hiện ${suspiciousImages.length} nguồn không tin cậy: ${urlsList}`;
    
    return {
      valid: false,
      message: message,
      suspiciousUrls: suspiciousImages.map(img => img.url),
      suspiciousImages: suspiciousImages,
    };
  }
  
  return { valid: true, message: '', suspiciousUrls: [] };
};

/**
 * Sanitize HTML với validation ảnh đặc biệt
 * @param {string} html - HTML content
 * @returns {string} - HTML đã được sanitize và validate
 */
const sanitizeHTMLWithImageValidation = (html) => {
  if (!html) return '';
  
  // Bước 1: Normalize HTML - chuyển multi-line img tags thành single line
  let normalized = html.replace(/<img\s+([\s\S]*?)>/gi, (match, attributes) => {
    const cleanAttrs = attributes.replace(/\s+/g, ' ').trim();
    return `<img ${cleanAttrs}>`;
  });
  
  // Bước 2: Validate và clean image URLs TRƯỚC KHI sanitize
  let processed = normalized.replace(/<img[^>]+>/gi, (imgTag) => {
    const srcMatch = imgTag.match(/src\s*=\s*["']([^"']+)["']/i) || 
                     imgTag.match(/src\s*=\s*([^\s>]+)/i);
    
    if (!srcMatch) {
      return ''; // Remove img tag without src
    }
    
    let src = decodeHTMLEntities(srcMatch[1]);
    
    // Validate image URL
    if (!isValidImageURL(src)) {
      return ''; // Remove invalid image
    }
    
    return imgTag;
  });
  
  // Bước 3: Sanitize HTML cơ bản
  let sanitized = sanitizeHTML(processed);
  
  // Bước 4: Validate lại sau khi sanitize
  sanitized = sanitized.replace(/<img[^>]+>/gi, (imgTag) => {
    const srcMatch = imgTag.match(/src\s*=\s*["']([^"']+)["']/i) || 
                     imgTag.match(/src\s*=\s*([^\s>]+)/i);
    
    if (!srcMatch) {
      return '';
    }
    
    let src = decodeHTMLEntities(srcMatch[1]);
    
    if (!isValidImageURL(src)) {
      return '';
    }
    
    return imgTag;
  });
  
  return sanitized;
};

module.exports = {
  sanitizeHTML,
  isValidImageURL,
  sanitizeHTMLWithImageValidation,
  validateHTMLImages,
  validateHTMLSecurity,
};
