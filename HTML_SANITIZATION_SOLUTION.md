# Giải Pháp Sanitize HTML Content (Kèm Hình Ảnh)

## 📋 Vấn Đề Hiện Tại

Hiện tại BE **KHÔNG có sanitize HTML**, dẫn đến các rủi ro:

1. **XSS (Cross-Site Scripting) Attack:**
```html
<!-- Admin có thể gửi malicious code -->
<script>alert('XSS')</script>
<img src="x" onerror="alert('XSS')">
<iframe src="javascript:alert('XSS')"></iframe>
```

2. **Malicious Image URLs:**
```html
<!-- URL có thể chứa malicious code -->
<img src="javascript:alert('XSS')">
<img src="http://malicious-site.com/image.jpg">
```

3. **Unsafe HTML Tags:**
```html
<!-- Các tag nguy hiểm -->
<script>...</script>
<iframe>...</iframe>
<object>...</object>
<embed>...</embed>
```

---

## 🛡️ Giải Pháp 1: DOMPurify (Khuyến Nghị)

### **Tổng Quan**

**DOMPurify** là thư viện sanitize HTML phổ biến, an toàn, và hiệu quả.

### **Cài Đặt**

```bash
npm install isomorphic-dompurify
# hoặc
npm install dompurify
npm install jsdom  # Cần cho Node.js environment
```

### **Cấu Hình Cơ Bản**

```javascript
// src/utils/htmlSanitizer.js
const DOMPurify = require('isomorphic-dompurify');
const { JSDOM } = require('jsdom');

// Setup DOMPurify cho Node.js
const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Cấu hình cho phép các tag và attribute cần thiết
const sanitizeHTML = (html) => {
  return purify.sanitize(html, {
    // Cho phép các HTML tags
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'strong', 'em', 'u', 's', 'b', 'i',
      'ul', 'ol', 'li',
      'a', 'img',
      'blockquote', 'pre', 'code',
      'div', 'span',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    
    // Cho phép các attribute
    ALLOWED_ATTR: [
      'href', 'target', 'rel',        // cho <a>
      'src', 'alt', 'title', 'width', 'height',  // cho <img>
      'class', 'id',                  // cho styling
      'colspan', 'rowspan',           // cho table
    ],
    
    // Không cho phép data attributes (có thể chứa malicious code)
    ALLOW_DATA_ATTR: false,
    
    // Tự động thêm rel="noopener noreferrer" cho link external
    ADD_ATTR: ['target'],
    ADD_URI_SAFE_ATTR: ['href', 'src'],
    
    // Chỉ cho phép safe URLs
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
};

module.exports = { sanitizeHTML };
```

### **Xử Lý Hình Ảnh Đặc Biệt**

```javascript
// src/utils/htmlSanitizer.js (mở rộng)

const sanitizeHTMLWithImageValidation = (html) => {
  // Bước 1: Sanitize HTML cơ bản
  let sanitized = purify.sanitize(html, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'p', 'strong', 'em', 'img', 'a', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['src', 'alt', 'title', 'href', 'target'],
    ALLOW_DATA_ATTR: false,
  });
  
  // Bước 2: Validate và clean image URLs
  sanitized = sanitized.replace(/<img[^>]+>/gi, (imgTag) => {
    // Extract src attribute
    const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
    if (!srcMatch) {
      return ''; // Remove img tag without src
    }
    
    const src = srcMatch[1];
    
    // Validate image URL
    if (!isValidImageURL(src)) {
      return ''; // Remove invalid image
    }
    
    // Clean img tag - chỉ giữ src, alt, title
    const altMatch = imgTag.match(/alt=["']([^"']*)["']/i);
    const titleMatch = imgTag.match(/title=["']([^"']*)["']/i);
    
    const alt = altMatch ? altMatch[1] : '';
    const title = titleMatch ? titleMatch[1] : '';
    
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" title="${escapeHtml(title)}">`;
  });
  
  return sanitized;
};

// Validate image URL
const isValidImageURL = (url) => {
  // Allow data URLs (base64 images)
  if (url.startsWith('data:image/')) {
    // Validate base64 format
    const base64Match = url.match(/^data:image\/(jpeg|jpg|png|gif|webp);base64,/i);
    return !!base64Match;
  }
  
  // Allow http/https URLs
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // Optionally: Check if URL is from trusted domain
    const trustedDomains = [
      'res.cloudinary.com',
      'cdn.example.com',
      // Add your trusted domains
    ];
    
    try {
      const urlObj = new URL(url);
      // Check if domain is trusted (optional)
      // return trustedDomains.some(domain => urlObj.hostname.includes(domain));
      return true; // Allow all http/https URLs
    } catch (e) {
      return false; // Invalid URL
    }
  }
  
  // Block javascript:, file:, etc.
  return false;
};

// Escape HTML để tránh XSS
const escapeHtml = (text) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
};

module.exports = { 
  sanitizeHTML, 
  sanitizeHTMLWithImageValidation 
};
```

### **Sử Dụng Trong Service**

```javascript
// src/services/NewsService.js
const { sanitizeHTMLWithImageValidation } = require('../utils/htmlSanitizer');

const createNews = async (payload = {}) => {
  try {
    // ... validation ...
    
    // Sanitize HTML content
    let sanitizedContent = payload.content;
    if (payload.content) {
      sanitizedContent = sanitizeHTMLWithImageValidation(payload.content);
    }
    
    const news = new NewsModel({
      title: title.toString().trim(),
      content: sanitizedContent,  // ← HTML đã được sanitize
      // ...
    });
    
    await news.save();
    // ...
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

const updateNews = async (id, payload = {}, userId = null, isAdmin = false) => {
  try {
    // ... validation ...
    
    // Sanitize HTML content nếu có update
    if (payload.content !== undefined) {
      payload.content = sanitizeHTMLWithImageValidation(payload.content);
    }
    
    // ... update logic ...
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};
```

---

## 🛡️ Giải Pháp 2: sanitize-html

### **Tổng Quan**

**sanitize-html** là thư viện chuyên dụng cho Node.js, không cần browser environment.

### **Cài Đặt**

```bash
npm install sanitize-html
```

### **Cấu Hình**

```javascript
// src/utils/htmlSanitizer.js
const sanitize = require('sanitize-html');

const sanitizeHTML = (html) => {
  return sanitize(html, {
    // Cho phép các HTML tags
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br', 'strong', 'em', 'u', 's', 'b', 'i',
      'ul', 'ol', 'li',
      'a', 'img',
      'blockquote', 'pre', 'code',
      'div', 'span',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    
    // Cho phép các attribute
    allowedAttributes: {
      'a': ['href', 'target', 'rel'],
      'img': ['src', 'alt', 'title', 'width', 'height'],
      '*': ['class', 'id'],
      'th': ['colspan', 'rowspan'],
      'td': ['colspan', 'rowspan'],
    },
    
    // Không cho phép data attributes
    allowDataAttributes: false,
    
    // Tự động thêm rel="noopener" cho link external
    transformTags: {
      'a': (tagName, attribs) => {
        if (attribs.href && attribs.href.startsWith('http')) {
          attribs.target = attribs.target || '_blank';
          attribs.rel = 'noopener noreferrer';
        }
        return { tagName, attribs };
      },
    },
    
    // Validate URLs
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: {
      'img': ['http', 'https', 'data'],  // Cho phép data URLs cho ảnh
    },
    
    // Validate image URLs đặc biệt
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    
    // Text content
    allowedIframeHostnames: [],  // Không cho phép iframe
  });
};

// Validate image URLs riêng
const sanitizeHTMLWithImageCheck = (html) => {
  // Sanitize cơ bản
  let sanitized = sanitizeHTML(html);
  
  // Validate và clean image URLs
  sanitized = sanitized.replace(/<img[^>]+>/gi, (imgTag) => {
    const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
    if (!srcMatch) return '';
    
    const src = srcMatch[1];
    
    // Validate URL
    if (!isValidImageURL(src)) {
      return ''; // Remove invalid image
    }
    
    return imgTag;
  });
  
  return sanitized;
};

const isValidImageURL = (url) => {
  // Allow data URLs (base64)
  if (url.startsWith('data:image/')) {
    return /^data:image\/(jpeg|jpg|png|gif|webp);base64,/.test(url);
  }
  
  // Allow http/https
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  return false;
};

module.exports = { 
  sanitizeHTML, 
  sanitizeHTMLWithImageCheck 
};
```

---

## 🛡️ Giải Pháp 3: Kết Hợp Sanitize + Upload Ảnh

### **Ý Tưởng**

1. **Sanitize HTML** để loại bỏ malicious code
2. **Extract ảnh base64** từ HTML
3. **Upload ảnh lên Cloudinary**
4. **Thay thế base64 bằng Cloudinary URL**
5. **Lưu HTML đã được xử lý**

### **Code Mẫu**

```javascript
// src/utils/htmlSanitizer.js
const DOMPurify = require('isomorphic-dompurify');
const { JSDOM } = require('jsdom');
const cloudinary = require('../config/cloudinaryConfig');

const window = new JSDOM('').window;
const purify = DOMPurify(window);

// Upload base64 image to Cloudinary
const uploadBase64Image = async (base64Data) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      base64Data,
      { 
        folder: "news/content",
        resource_type: "image",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });
};

// Extract và upload ảnh từ HTML
const processHTMLContent = async (html) => {
  // Bước 1: Sanitize HTML cơ bản
  let sanitized = purify.sanitize(html, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'p', 'strong', 'em', 'img', 'a', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['src', 'alt', 'title', 'href', 'target'],
    ALLOW_DATA_ATTR: false,
  });
  
  // Bước 2: Extract base64 images
  const base64Images = [];
  const base64Regex = /<img[^>]+src=["'](data:image\/[^"']+)["'][^>]*>/gi;
  let match;
  
  while ((match = base64Regex.exec(sanitized)) !== null) {
    base64Images.push({
      fullTag: match[0],
      base64Data: match[1],
    });
  }
  
  // Bước 3: Upload base64 images to Cloudinary
  for (const img of base64Images) {
    try {
      const result = await uploadBase64Image(img.base64Data);
      
      // Replace base64 URL with Cloudinary URL
      sanitized = sanitized.replace(
        img.fullTag,
        img.fullTag.replace(img.base64Data, result.secure_url)
      );
    } catch (error) {
      console.warn('Failed to upload base64 image:', error);
      // Remove image tag if upload fails
      sanitized = sanitized.replace(img.fullTag, '');
    }
  }
  
  // Bước 4: Validate remaining image URLs
  sanitized = sanitized.replace(/<img[^>]+>/gi, (imgTag) => {
    const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
    if (!srcMatch) return '';
    
    const src = srcMatch[1];
    
    // Only allow http/https URLs (base64 đã được upload)
    if (!src.startsWith('http://') && !src.startsWith('https://')) {
      return ''; // Remove invalid image
    }
    
    return imgTag;
  });
  
  return sanitized;
};

module.exports = { processHTMLContent };
```

### **Sử Dụng**

```javascript
// src/services/NewsService.js
const { processHTMLContent } = require('../utils/htmlSanitizer');

const createNews = async (payload = {}) => {
  try {
    // ... validation ...
    
    // Process HTML: sanitize + upload images
    let processedContent = payload.content;
    if (payload.content) {
      processedContent = await processHTMLContent(payload.content);
    }
    
    const news = new NewsModel({
      title: title.toString().trim(),
      content: processedContent,  // ← HTML đã được sanitize và upload ảnh
      // ...
    });
    
    await news.save();
    // ...
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};
```

---

## 📊 So Sánh Các Giải Pháp

| Giải Pháp | Ưu Điểm | Nhược Điểm | Độ Phức Tạp | Khuyến Nghị |
|-----------|---------|------------|-------------|-------------|
| **DOMPurify** | Phổ biến, an toàn, có browser version | Cần jsdom cho Node.js | ⭐⭐⭐ | ✅ Khuyến nghị |
| **sanitize-html** | Chuyên cho Node.js, không cần browser | Ít phổ biến hơn | ⭐⭐ | ✅ Tốt |
| **Kết hợp + Upload** | Tối ưu nhất, tự động upload ảnh | Phức tạp, tốn thời gian | ⭐⭐⭐⭐⭐ | ⭐ Nâng cao |

---

## 🎯 Khuyến Nghị Implementation

### **Bước 1: Cài Đặt (Chọn 1 trong 2)**

**Option A: DOMPurify**
```bash
npm install isomorphic-dompurify jsdom
```

**Option B: sanitize-html**
```bash
npm install sanitize-html
```

### **Bước 2: Tạo File Sanitizer**

Tạo file `src/utils/htmlSanitizer.js` với code từ giải pháp đã chọn.

### **Bước 3: Integrate Vào Service**

Update `src/services/NewsService.js`:
- Import sanitizer
- Sanitize content trong `createNews()`
- Sanitize content trong `updateNews()`

### **Bước 4: Test**

Test các trường hợp:
- ✅ HTML bình thường
- ✅ HTML có ảnh base64
- ✅ HTML có ảnh URL
- ✅ HTML có malicious code (phải bị loại bỏ)
- ✅ HTML có script tags (phải bị loại bỏ)

---

## ⚠️ Lưu Ý Quan Trọng

1. **Performance:**
   - Sanitize HTML có thể tốn thời gian với content dài
   - Nên cache kết quả nếu có thể

2. **Base64 Images:**
   - Base64 rất dài → làm chậm sanitize
   - Nên upload base64 lên Cloudinary trước khi sanitize

3. **Allowed Tags:**
   - Chỉ cho phép các tag thực sự cần thiết
   - Không cho phép `<script>`, `<iframe>`, `<object>`, etc.

4. **URL Validation:**
   - Validate tất cả URLs (href, src)
   - Chỉ cho phép http, https, data (cho ảnh)
   - Block javascript:, file:, etc.

5. **Testing:**
   - Test với nhiều loại malicious code
   - Test với nhiều loại ảnh (base64, URL, invalid URL)

---

## 📝 Tóm Tắt

**Vấn đề:** Không có sanitize HTML → rủi ro XSS

**Giải pháp:**
1. ✅ **DOMPurify** hoặc **sanitize-html** để sanitize HTML
2. ✅ **Validate image URLs** đặc biệt
3. ⭐ **Kết hợp upload ảnh** để tối ưu (optional)

**Next Steps:**
1. Cài đặt thư viện
2. Tạo file sanitizer
3. Integrate vào Service
4. Test kỹ lưỡng
