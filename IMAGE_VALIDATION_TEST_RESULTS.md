# Kết Quả Test Validation Ảnh

## ✅ Validation Đang Hoạt Động Đúng

### **Test 1: URL Đáng Ngờ**
```
Input: https://example.com/assets/image.php?id=12345&source=unknown&ref=news_test
Result: ❌ BLOCKED (false)
```

### **Test 2: HTML Với Ảnh Đáng Ngờ**
```html
Input: <img src="https://example.com/assets/image.php?id=12345&source=unknown&ref=news_test" alt="Test">
       <p>Content here...</p>

Output: <p>Content here...</p>
        (Ảnh đã bị loại bỏ)
```

### **Test 3: Cloudinary URL (Hợp Lệ)**
```html
Input: <img src="https://res.cloudinary.com/xxx/image/upload/abc.jpg" alt="Test">
       <p>Content here</p>

Output: <img src="https://res.cloudinary.com/xxx/image/upload/abc.jpg" alt="Test" />
       <p>Content here</p>
       (Ảnh được giữ lại)
```

---

## 🔍 Tại Sao Vẫn "Tạo Được"?

Có thể bạn đang gặp một trong các trường hợp sau:

### **Trường Hợp 1: Ảnh Bị Loại Bỏ Nhưng Content Vẫn Đủ Dài**

```javascript
// Input từ bạn:
content = "<img src='https://example.com/...'><p>Nội dung đủ dài...</p>"

// Sau sanitize:
sanitizedContent = "<p>Nội dung đủ dài...</p>"  // Ảnh bị loại bỏ

// Validation:
if (sanitizedContent.length < 100) {
  return error;  // Nếu content vẫn đủ dài → pass
}

// Kết quả: Bài viết được tạo, nhưng không có ảnh
```

**Giải pháp:** Kiểm tra response xem có ảnh trong content không.

### **Trường Hợp 2: Đang Dùng URL Khác**

Có thể bạn đang test với:
- Cloudinary URL → ✅ Pass (đúng)
- Domain khác trong whitelist → ✅ Pass (nếu đã thêm)
- Base64 image → ✅ Pass (đúng)

### **Trường Hợp 3: Test Trực Tiếp Database**

Nếu bạn insert trực tiếp vào database, validation sẽ không chạy.

---

## 🧪 Cách Test Đúng

### **Test 1: Kiểm Tra Validation**

```bash
# Test với API
POST /news
Content-Type: multipart/form-data
Authorization: Bearer YOUR_TOKEN

content: <img src="https://example.com/assets/image.php?id=12345" alt="Test"><p>Nội dung đủ dài để pass validation...</p>
```

**Expected Result:**
- ✅ Bài viết được tạo
- ❌ Ảnh bị loại bỏ (không có trong content)
- ✅ Content chỉ còn: `<p>Nội dung đủ dài...</p>`

### **Test 2: Kiểm Tra Response**

Sau khi tạo, check response:
```json
{
  "status": "OK",
  "data": {
    "content": "<p>Nội dung đủ dài...</p>",  // ← Không có <img> tag
    // ...
  }
}
```

---

## 🔧 Debug

Nếu bạn muốn xem chi tiết quá trình sanitize, có thể thêm logging:

```javascript
// src/utils/htmlSanitizer.js
const sanitizeHTMLWithImageValidation = (html) => {
  if (!html) return '';
  
  let sanitized = sanitizeHTML(html);
  
  // Log trước khi validate
  console.log('Before validation:', sanitized);
  
  sanitized = sanitized.replace(/<img[^>]+>/gi, (imgTag) => {
    const srcMatch = imgTag.match(/src=["']([^"']+)["']/i);
    if (!srcMatch) {
      console.log('Removed img tag (no src):', imgTag);
      return '';
    }
    
    const src = srcMatch[1];
    const isValid = isValidImageURL(src);
    
    if (!isValid) {
      console.log('Removed invalid image URL:', src);
      return '';
    }
    
    console.log('Kept valid image URL:', src);
    return imgTag;
  });
  
  console.log('After validation:', sanitized);
  return sanitized;
};
```

---

## 📝 Checklist

Để đảm bảo validation hoạt động:

- [ ] Test với URL `example.com` → Phải bị block
- [ ] Test với Cloudinary URL → Phải pass
- [ ] Test với base64 image → Phải pass
- [ ] Check response sau khi tạo → Ảnh đáng ngờ phải bị loại bỏ
- [ ] Check database → Content không chứa ảnh đáng ngờ

---

## 💡 Lưu Ý

**Validation đang hoạt động đúng!**

Nếu bạn vẫn thấy "tạo được", có thể:
1. ✅ Ảnh bị loại bỏ nhưng content vẫn đủ dài → Bài viết được tạo (không có ảnh)
2. ✅ Đang dùng URL hợp lệ (Cloudinary, base64)
3. ⚠️ Cần check response để xác nhận ảnh có bị loại bỏ không
