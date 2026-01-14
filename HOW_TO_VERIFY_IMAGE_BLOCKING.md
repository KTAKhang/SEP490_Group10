# Cách Kiểm Tra: Ảnh Đáng Ngờ Có Bị Block Không?

## 🔍 Test Case: URL Đáng Ngờ

```html
<img src="https://example.com/assets/image.php?id=12345&source=unknown&ref=news_test" alt="Test">
```

## ✅ Cách Kiểm Tra Đúng

### **Bước 1: Tạo Bài Viết Với URL Đáng Ngờ**

```bash
POST http://localhost:3000/news
Authorization: Bearer YOUR_TOKEN
Content-Type: multipart/form-data

title: "Test bài viết"
content: "<img src=\"https://example.com/assets/image.php?id=12345&source=unknown&ref=news_test\" alt=\"Test\"><p>Nội dung đủ dài để pass validation. Đây là đoạn văn để đảm bảo content có ít nhất 100 ký tự sau khi sanitize.</p>"
thumbnail: [file image]
status: "DRAFT"
```

### **Bước 2: Kiểm Tra Response**

**Response sẽ trả về:**
```json
{
  "status": "OK",
  "message": "Tạo bài viết thành công",
  "data": {
    "content": "<p>Nội dung đủ dài để pass validation...</p>",
    // ← KHÔNG CÓ <img> tag trong content
    // ← Ảnh đã bị loại bỏ
  }
}
```

**Nếu thấy `<img>` trong response → Có vấn đề!**

### **Bước 3: Kiểm Tra Console Logs**

Khi tạo bài viết, bạn sẽ thấy warning trong console:
```
[HTML Sanitizer] Blocked invalid/untrusted image URL: https://example.com/assets/image.php?id=12345&source=unknown&ref=news_test
```

**Nếu không thấy warning → Có vấn đề!**

### **Bước 4: Kiểm Tra Database**

Query database:
```javascript
const news = await NewsModel.findById(newsId);
console.log('Content:', news.content);
// Nếu có <img> với example.com → Có vấn đề!
```

---

## 🧪 Test Script

Tạo file `test-image-blocking.js`:

```javascript
const { sanitizeHTMLWithImageValidation } = require('./src/utils/htmlSanitizer.js');

const testHTML = `<article>
    <h1>Test</h1>
    <img src="https://example.com/assets/image.php?id=12345&source=unknown&ref=news_test" alt="Test">
    <p>Nội dung đủ dài để pass validation...</p>
</article>`;

console.log('=== INPUT ===');
console.log(testHTML);
console.log('\n=== OUTPUT ===');
const result = sanitizeHTMLWithImageValidation(testHTML);
console.log(result);
console.log('\n=== CHECK ===');
console.log('Contains <img>:', result.includes('<img'));
console.log('Contains example.com:', result.includes('example.com'));
console.log('Image blocked?', !result.includes('<img') && !result.includes('example.com'));
```

Chạy:
```bash
node test-image-blocking.js
```

**Expected Output:**
- `Contains <img>: false`
- `Contains example.com: false`
- `Image blocked?: true`

---

## ⚠️ Nếu Vẫn Thấy Ảnh Trong Response

### **Nguyên Nhân Có Thể:**

1. **Đang test với URL khác:**
   - Cloudinary URL → ✅ Pass (đúng)
   - Base64 image → ✅ Pass (đúng)
   - Domain khác trong whitelist → ✅ Pass (nếu đã thêm)

2. **Content vẫn đủ dài sau khi loại bỏ ảnh:**
   - Ảnh bị loại bỏ
   - Nhưng content vẫn đủ 100 ký tự
   - → Bài viết được tạo (không có ảnh)

3. **Chưa kiểm tra response:**
   - Cần check field `content` trong response
   - Không nên chỉ nhìn vào status "OK"

---

## 🔧 Debug Steps

1. **Check Console:**
   - Xem có warning `[HTML Sanitizer] Blocked...` không
   - Nếu có → Validation đang hoạt động

2. **Check Response:**
   - Xem field `content` trong response
   - Nếu không có `<img>` → Ảnh đã bị loại bỏ

3. **Check Database:**
   - Query trực tiếp từ database
   - Xem content có chứa ảnh đáng ngờ không

4. **Test Trực Tiếp:**
   - Chạy `node test-image-blocking.js`
   - Xem output có chứa ảnh không

---

## 📝 Checklist

- [ ] Console có warning `Blocked invalid/untrusted image URL`?
- [ ] Response `content` không có `<img>` tag với example.com?
- [ ] Database không lưu ảnh đáng ngờ?
- [ ] Test script cho kết quả `Image blocked?: true`?

Nếu tất cả đều ✅ → Validation hoạt động đúng!
