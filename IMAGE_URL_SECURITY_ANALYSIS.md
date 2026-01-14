# Phân Tích Bảo Mật: URL Ảnh Có Query Parameters

## 🔍 URL Ví Dụ

```html
<img src="https://example.com/assets/image.php?id=12345&source=unknown&ref=news_test" alt="Hình ảnh">
```

## ⚠️ Rủi Ro Bảo Mật

### **1. URL Tracking & Privacy**
- **Query parameters** (`?id=12345&source=unknown&ref=news_test`) có thể dùng để:
  - Track người dùng (user tracking)
  - Ghi nhận IP, browser, referrer
  - Phân tích hành vi người dùng
  - Thu thập dữ liệu cá nhân

### **2. Dynamic Content (image.php)**
- `image.php` không phải file ảnh thật
- Có thể là script động, có thể:
  - Trả về ảnh khác nhau tùy theo parameters
  - Log requests
  - Inject malicious content
  - Redirect đến URL khác

### **3. Unknown Source**
- Domain `example.com` không được kiểm soát
- Không biết server có an toàn không
- Có thể bị compromised sau này

### **4. Không Có File Extension**
- Không có `.jpg`, `.png` → không chắc là ảnh thật
- Có thể là script, HTML, hoặc content khác

---

## 🔒 Giải Pháp: Cải Thiện Validation

### **Option 1: Whitelist Domains (Khuyến Nghị)**

Chỉ cho phép ảnh từ domains tin cậy:

```javascript
const TRUSTED_IMAGE_DOMAINS = [
  'res.cloudinary.com',      // Cloudinary (CDN)
  'cdn.example.com',          // CDN của bạn
  'images.example.com',       // Image server của bạn
  // Thêm các domains tin cậy khác
];

const isValidImageURL = (url) => {
  if (!url) return false;
  
  // Cho phép data URLs (base64)
  if (url.startsWith('data:image/')) {
    return /^data:image\/(jpeg|jpg|png|gif|webp);base64,/.test(url);
  }
  
  // Cho phép http/https URLs
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      // Check whitelist domains
      const isTrusted = TRUSTED_IMAGE_DOMAINS.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
      );
      
      if (!isTrusted) {
        return false; // Block untrusted domains
      }
      
      // Validate file extension (optional, nhưng nên có)
      const pathname = urlObj.pathname.toLowerCase();
      const hasImageExtension = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(pathname);
      
      // Cho phép nếu có extension hoặc từ Cloudinary (Cloudinary không cần extension)
      if (hostname.includes('cloudinary.com') || hasImageExtension) {
        return true;
      }
      
      return false;
    } catch {
      return false;
    }
  }
  
  return false;
};
```

### **Option 2: Block Query Parameters**

Block URLs có query parameters (an toàn nhất):

```javascript
const isValidImageURL = (url) => {
  if (!url) return false;
  
  // Cho phép data URLs
  if (url.startsWith('data:image/')) {
    return /^data:image\/(jpeg|jpg|png|gif|webp);base64,/.test(url);
  }
  
  // Cho phép http/https URLs
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const urlObj = new URL(url);
      
      // Block nếu có query parameters (trừ Cloudinary transformation params)
      if (urlObj.search && !urlObj.hostname.includes('cloudinary.com')) {
        return false; // Block URLs with query params
      }
      
      // Chỉ cho phép Cloudinary hoặc domains tin cậy
      const isCloudinary = urlObj.hostname.includes('cloudinary.com');
      const isTrusted = TRUSTED_IMAGE_DOMAINS.some(domain => 
        urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
      );
      
      return isCloudinary || isTrusted;
    } catch {
      return false;
    }
  }
  
  return false;
};
```

### **Option 3: Strict Validation (An Toàn Nhất)**

Chỉ cho phép Cloudinary URLs (khuyến nghị cho production):

```javascript
const isValidImageURL = (url) => {
  if (!url) return false;
  
  // Cho phép data URLs (base64) - từ upload
  if (url.startsWith('data:image/')) {
    return /^data:image\/(jpeg|jpg|png|gif|webp);base64,/.test(url);
  }
  
  // Chỉ cho phép Cloudinary URLs
  if (url.startsWith('https://res.cloudinary.com/')) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
  
  // Block tất cả URLs khác
  return false;
};
```

---

## 🎯 Khuyến Nghị Cho Dự Án

**Giải pháp phù hợp nhất: Option 1 (Whitelist Domains)**

**Lý do:**
- ✅ Linh hoạt: Cho phép nhiều nguồn tin cậy
- ✅ An toàn: Block unknown domains
- ✅ Dễ maintain: Thêm domains mới dễ dàng
- ✅ Phù hợp với nhu cầu: Có thể dùng Cloudinary + CDN khác

**Implementation:**
1. Whitelist Cloudinary (bắt buộc)
2. Whitelist CDN của bạn (nếu có)
3. Block tất cả domains khác
4. Validate file extension (optional)

---

## 📝 Code Cải Thiện

Tôi sẽ cập nhật `htmlSanitizer.js` với whitelist domains và validation tốt hơn.
