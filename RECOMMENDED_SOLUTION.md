# Khuyến Nghị: Giải Pháp Sanitize HTML Phù Hợp Nhất

## 📊 Phân Tích Dự Án Hiện Tại

### **Đặc Điểm Dự Án:**
- ✅ Node.js/Express backend
- ✅ Đã có Cloudinary cho image upload
- ✅ Đã có Sharp cho image optimization
- ✅ Code style đơn giản, rõ ràng
- ✅ Validation cơ bản (trim, length check)
- ❌ Chưa có sanitization library
- ❌ Chưa có folder utils

### **Pattern Code Hiện Tại:**
- Helper functions trong service files
- Validation đơn giản (trim, length)
- Không có sanitization phức tạp
- Dependencies tối thiểu

---

## 🎯 Khuyến Nghị: **sanitize-html** (Giải Pháp 2)

### **Lý Do Chọn:**

#### ✅ **1. Phù Hợp Với Node.js Environment**
- **sanitize-html** được thiết kế riêng cho Node.js
- Không cần browser environment (không cần jsdom)
- Nhẹ hơn, nhanh hơn

#### ✅ **2. Đơn Giản, Dễ Integrate**
- API đơn giản, dễ hiểu
- Phù hợp với code style hiện tại (helper functions)
- Không cần setup phức tạp

#### ✅ **3. Đủ Mạnh Cho Nhu Cầu**
- Sanitize HTML tốt
- Validate URLs
- Configurable (cho phép tags/attributes cần thiết)
- Hỗ trợ image URLs (http, https, data)

#### ✅ **4. Dependencies Tối Thiểu**
```bash
npm install sanitize-html
# Chỉ 1 package, không cần thêm dependencies
```

#### ✅ **5. Phù Hợp Với Timeline**
- Implement nhanh (1-2 giờ)
- Test dễ dàng
- Maintain đơn giản

---

## ❌ Tại Sao KHÔNG Chọn Các Giải Pháp Khác?

### **DOMPurify (Giải Pháp 1):**
- ❌ Cần `jsdom` (thêm dependency, phức tạp hơn)
- ❌ Được thiết kế cho browser, phải adapt cho Node.js
- ❌ Overkill cho nhu cầu hiện tại

### **Kết Hợp + Upload (Giải Pháp 3):**
- ❌ Quá phức tạp cho giai đoạn hiện tại
- ❌ Tốn nhiều thời gian implement
- ❌ Có thể làm sau nếu thực sự cần
- ✅ Có thể nâng cấp sau khi đã có sanitize cơ bản

---

## 📝 Implementation Plan

### **Bước 1: Cài Đặt**
```bash
npm install sanitize-html
```

### **Bước 2: Tạo Helper Function**

Tạo file `src/utils/htmlSanitizer.js`:

```javascript
const sanitize = require('sanitize-html');

/**
 * Sanitize HTML content - loại bỏ malicious code, giữ lại format cần thiết
 * @param {string} html - HTML content cần sanitize
 * @returns {string} - HTML đã được sanitize
 */
const sanitizeHTML = (html) => {
  if (!html) return '';
  
  return sanitize(html, {
    // Cho phép các HTML tags cần thiết
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'br',
      'strong', 'em', 'u', 's', 'b', 'i',
      'ul', 'ol', 'li',
      'a', 'img',
      'blockquote', 'pre', 'code',
      'div', 'span',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    
    // Cho phép các attributes
    allowedAttributes: {
      'a': ['href', 'target', 'rel'],
      'img': ['src', 'alt', 'title', 'width', 'height'],
      '*': ['class', 'id'],
      'th': ['colspan', 'rowspan'],
      'td': ['colspan', 'rowspan'],
    },
    
    // Không cho phép data attributes (có thể chứa malicious code)
    allowDataAttributes: false,
    
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

/**
 * Validate image URL - kiểm tra URL ảnh có hợp lệ không
 * @param {string} url - URL cần validate
 * @returns {boolean} - true nếu hợp lệ
 */
const isValidImageURL = (url) => {
  if (!url) return false;
  
  // Cho phép data URLs (base64 images)
  if (url.startsWith('data:image/')) {
    // Validate base64 format
    return /^data:image\/(jpeg|jpg|png|gif|webp);base64,/.test(url);
  }
  
  // Cho phép http/https URLs
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  // Block javascript:, file:, etc.
  return false;
};

/**
 * Sanitize HTML với validation ảnh đặc biệt
 * @param {string} html - HTML content
 * @returns {string} - HTML đã được sanitize và validate
 */
const sanitizeHTMLWithImageValidation = (html) => {
  if (!html) return '';
  
  // Bước 1: Sanitize HTML cơ bản
  let sanitized = sanitizeHTML(html);
  
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
    
    // Return cleaned img tag
    return imgTag;
  });
  
  return sanitized;
};

module.exports = {
  sanitizeHTML,
  isValidImageURL,
  sanitizeHTMLWithImageValidation,
};
```

### **Bước 3: Integrate Vào NewsService**

Update `src/services/NewsService.js`:

```javascript
// Thêm import ở đầu file
const { sanitizeHTMLWithImageValidation } = require('../utils/htmlSanitizer');

// Update createNews function
const createNews = async (payload = {}) => {
  try {
    const { title, content, excerpt, thumbnail_url, thumbnailPublicId, author_id, status } = payload;

    // ... existing validation ...

    // Sanitize HTML content
    let sanitizedContent = content;
    if (content) {
      sanitizedContent = sanitizeHTMLWithImageValidation(content.toString().trim());
      
      // Validate lại sau khi sanitize (có thể bị rút ngắn)
      if (sanitizedContent.length < 100) {
        return { status: "ERR", message: "Nội dung phải có ít nhất 100 ký tự sau khi sanitize" };
      }
    }

    // ... existing code ...

    const news = new NewsModel({
      title: title.toString().trim(),
      content: sanitizedContent,  // ← Dùng content đã sanitize
      excerpt: finalExcerpt,
      // ... rest of fields ...
    });

    await news.save();
    // ... rest of code ...
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};

// Update updateNews function
const updateNews = async (id, payload = {}, userId = null, isAdmin = false) => {
  try {
    // ... existing validation ...

    // Sanitize HTML content nếu có update
    if (payload.content !== undefined) {
      payload.content = sanitizeHTMLWithImageValidation(payload.content.toString().trim());
      
      // Validate lại sau khi sanitize
      if (payload.content.length < 100) {
        return { status: "ERR", message: "Nội dung phải có ít nhất 100 ký tự sau khi sanitize" };
      }
    }

    // ... rest of update logic ...
  } catch (error) {
    return { status: "ERR", message: error.message };
  }
};
```

### **Bước 4: Tạo Folder Utils**

Tạo folder `src/utils/` nếu chưa có:
```bash
mkdir src/utils
```

---

## ✅ Lợi Ích Của Giải Pháp Này

1. **Bảo Mật:**
   - ✅ Loại bỏ XSS attacks
   - ✅ Validate image URLs
   - ✅ Block malicious code

2. **Đơn Giản:**
   - ✅ Dễ implement
   - ✅ Dễ maintain
   - ✅ Dễ test

3. **Hiệu Quả:**
   - ✅ Nhẹ, nhanh
   - ✅ Không tốn nhiều resources
   - ✅ Phù hợp với code style hiện tại

4. **Linh Hoạt:**
   - ✅ Có thể config allowed tags/attributes
   - ✅ Có thể mở rộng sau (upload ảnh tự động)
   - ✅ Dễ customize

---

## 🚀 Roadmap Tương Lai (Optional)

Sau khi đã có sanitize cơ bản, có thể nâng cấp:

1. **Upload Ảnh Tự Động:**
   - Extract base64 images
   - Upload lên Cloudinary
   - Thay thế URL

2. **Image Optimization:**
   - Resize ảnh trong content
   - Compress ảnh
   - Convert format

3. **Advanced Validation:**
   - Whitelist domains cho ảnh
   - Check image size
   - Validate image format

---

## 📊 So Sánh Nhanh

| Tiêu Chí | sanitize-html | DOMPurify | Kết Hợp + Upload |
|----------|---------------|-----------|------------------|
| **Độ Phức Tạp** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Thời Gian Implement** | 1-2 giờ | 2-3 giờ | 1-2 ngày |
| **Dependencies** | 1 package | 2 packages | 2+ packages |
| **Phù Hợp Node.js** | ✅ Tốt nhất | ⚠️ Cần adapt | ✅ Tốt |
| **Bảo Mật** | ✅ Tốt | ✅ Tốt | ✅ Tốt nhất |
| **Khuyến Nghị** | ✅ **Nên dùng** | ⚠️ Có thể | ⭐ Làm sau |

---

## 🎯 Kết Luận

**Giải pháp phù hợp nhất: `sanitize-html`**

**Lý do:**
- ✅ Phù hợp với dự án hiện tại
- ✅ Đơn giản, dễ implement
- ✅ Đủ mạnh cho nhu cầu
- ✅ Dễ maintain và mở rộng

**Next Steps:**
1. Cài đặt `sanitize-html`
2. Tạo `src/utils/htmlSanitizer.js`
3. Integrate vào `NewsService.js`
4. Test kỹ lưỡng

**Timeline:** 1-2 giờ để implement và test
