# Giải Thích: Cách BE Xử Lý HTML Content trong News Management

## 📋 Tổng Quan

Khi admin gửi HTML content lên server, BE sẽ xử lý qua các bước sau:

## 🔄 Flow Xử Lý HTML Content

### **Bước 1: Controller Nhận Request** 
📍 File: `src/controller/NewsController.js`

```javascript
const createNews = async (req, res) => {
  // Nhận HTML content từ req.body
  // Content được gửi từ frontend dưới dạng string HTML
  const response = await NewsService.createNews({
    ...req.body,  // ← HTML content nằm trong req.body.content
    author_id: req.user._id,
  });
}
```

**Ví dụ HTML content admin gửi lên:**
```html
<h1>Tiêu đề bài viết</h1>
<p>Đây là đoạn văn đầu tiên với <strong>chữ đậm</strong> và <em>chữ nghiêng</em>.</p>
<p>Đây là đoạn văn thứ hai.</p>
<img src="https://example.com/image.jpg" alt="Hình ảnh">
```

---

### **Bước 2: Service Xử Lý** 
📍 File: `src/services/NewsService.js`

#### **2.1. Validate Required Fields**
```javascript
// Kiểm tra content có tồn tại không
if (!content || !content.toString().trim()) {
  return { status: "ERR", message: "Nội dung là bắt buộc" };
}
```
- ✅ **Trim whitespace** ở đầu/cuối
- ✅ **Convert sang string** nếu không phải string

#### **2.2. Validate Content Length**
```javascript
// BR-NEWS-08: Validate content limits
const validateContentLimits = (payload) => {
  if (payload.content !== undefined) {
    const content = payload.content.toString().trim();
    if (content.length < 100) {
      return { valid: false, message: "Nội dung phải có ít nhất 100 ký tự" };
    }
  }
  return { valid: true };
};
```

**Giải thích:**
- ✅ **Đếm TẤT CẢ ký tự** (bao gồm cả HTML tags)
- ✅ **Ví dụ:** `<p>Hello</p>` = 13 ký tự (không phải 5)
- ✅ **Minimum:** 100 ký tự (bao gồm HTML tags)

**Ví dụ:**
```html
<!-- ✅ HỢP LỆ: 120 ký tự (bao gồm HTML tags) -->
<h1>Tiêu đề</h1><p>Nội dung bài viết phải có ít nhất 100 ký tự để đáp ứng yêu cầu validation của hệ thống.</p>

<!-- ❌ KHÔNG HỢP LỆ: Chỉ 50 ký tự -->
<p>Nội dung quá ngắn</p>
```

#### **2.3. Auto-Generate Excerpt (Nếu Không Có)**
```javascript
// Helper: Strip HTML tags
const stripHTML = (html) => {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").trim();  // ← Xóa tất cả HTML tags
};

// Auto-generate excerpt if not provided
let finalExcerpt = excerpt;
if (!excerpt || !excerpt.trim()) {
  const plainText = stripHTML(content);  // ← Xóa HTML, chỉ lấy text
  if (plainText.length > 200) {
    finalExcerpt = plainText.substring(0, 200) + "...";
  } else {
    finalExcerpt = plainText;
  }
}
```

**Giải thích:**
- ✅ **Strip HTML:** Xóa tất cả HTML tags (`<h1>`, `<p>`, `<strong>`, etc.)
- ✅ **Lấy text thuần:** Chỉ giữ lại nội dung text
- ✅ **Cắt 200 ký tự:** Nếu dài hơn 200 ký tự → cắt + thêm "..."
- ✅ **Lưu vào excerpt:** Lưu text thuần (không có HTML)

**Ví dụ:**
```javascript
// Input HTML:
content = "<h1>Tiêu đề</h1><p>Đây là nội dung bài viết rất dài...</p>"

// Sau khi stripHTML():
plainText = "Tiêu đềĐây là nội dung bài viết rất dài..."

// Nếu > 200 ký tự:
excerpt = "Tiêu đềĐây là nội dung bài viết rất dài... (200 ký tự đầu) ..."
```

#### **2.4. Lưu Content Vào Database**
```javascript
const news = new NewsModel({
  title: title.toString().trim(),
  content: content.toString().trim(),  // ← Lưu NGUYÊN HTML
  excerpt: finalExcerpt,               // ← Lưu TEXT THUẦN (đã strip HTML)
  // ...
});

await news.save();
```

**Quan trọng:**
- ✅ **Content:** Lưu **NGUYÊN HTML** vào database (không strip, không sanitize)
- ✅ **Excerpt:** Lưu **TEXT THUẦN** (đã strip HTML)

---

### **Bước 3: Model Validation**
📍 File: `src/models/NewsModel.js`

```javascript
content: {
  type: String,
  required: [true, "Nội dung là bắt buộc"],
  trim: true,                    // ← Tự động trim whitespace
  minlength: [100, "Nội dung phải có ít nhất 100 ký tự"],
},
```

**Giải thích:**
- ✅ **Mongoose tự động trim** whitespace
- ✅ **Validate minlength:** Tối thiểu 100 ký tự (bao gồm HTML tags)
- ✅ **Không có maxlength:** Không giới hạn độ dài tối đa

---

### **Bước 4: Pre-Save Hook (Tự Động Chạy Khi Save)**
📍 File: `src/models/NewsModel.js`

```javascript
newsSchema.pre("save", function (next) {
  // Strip HTML tags helper
  const stripHTML = (html) => {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, "").trim();
  };

  // Auto-generate excerpt if not provided and content exists
  if (!this.excerpt && this.content) {
    const plainText = stripHTML(this.content);
    if (plainText.length > 200) {
      this.excerpt = plainText.substring(0, 200) + "...";
    } else {
      this.excerpt = plainText;
    }
  }

  next();
});
```

**Giải thích:**
- ✅ **Chạy tự động** trước khi save vào database
- ✅ **Backup:** Nếu excerpt chưa được set ở Service, Model sẽ tự động generate
- ✅ **Đảm bảo:** Excerpt luôn được tạo (nếu chưa có)

---

## 🔍 Chi Tiết Xử Lý HTML

### **1. Strip HTML Function**
```javascript
const stripHTML = (html) => {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").trim();
};
```

**Regex giải thích:**
- `<[^>]*>`: Match bất kỳ HTML tag nào
  - `<`: Bắt đầu tag
  - `[^>]*`: Bất kỳ ký tự nào KHÔNG phải `>`
  - `>`: Kết thúc tag
- `g`: Global flag (thay thế tất cả, không chỉ cái đầu tiên)

**Ví dụ:**
```javascript
stripHTML("<h1>Hello</h1><p>World</p>")
// → "HelloWorld"

stripHTML("<p>Text with <strong>bold</strong> and <em>italic</em></p>")
// → "Text with bold and italic"
```

### **2. Content Lưu Nguyên HTML**
```javascript
// Input từ admin:
content = "<h1>Tiêu đề</h1><p>Nội dung</p>"

// Lưu vào database:
news.content = "<h1>Tiêu đề</h1><p>Nội dung</p>"  // ← NGUYÊN HTML
```

**Lý do:**
- ✅ **Frontend render:** Cần HTML để hiển thị đúng format
- ✅ **Rich text editor:** Admin dùng editor (như TinyMCE, CKEditor) → output HTML
- ✅ **Flexibility:** Cho phép format phong phú (bold, italic, images, links, etc.)

### **3. Excerpt Lưu Text Thuần**
```javascript
// Input từ admin:
content = "<h1>Tiêu đề</h1><p>Nội dung</p>"

// Lưu vào database:
news.excerpt = "Tiêu đềNội dung"  // ← TEXT THUẦN (đã strip HTML)
```

**Lý do:**
- ✅ **SEO:** Search engines đọc text thuần tốt hơn
- ✅ **Preview:** Hiển thị excerpt không cần render HTML
- ✅ **Meta description:** Dùng cho meta tags

---

## ⚠️ Lưu Ý Quan Trọng

### **1. KHÔNG CÓ HTML Sanitization**
❌ **Hiện tại:** BE **KHÔNG sanitize** HTML content
- ✅ Lưu nguyên HTML từ admin
- ⚠️ **Rủi ro:** Nếu admin gửi malicious HTML → có thể gây XSS

**Ví dụ rủi ro:**
```html
<!-- Admin có thể gửi: -->
<script>alert('XSS')</script>
<img src="x" onerror="alert('XSS')">
```

**Giải pháp (nếu cần):**
- Sử dụng thư viện như `DOMPurify` hoặc `sanitize-html` để sanitize HTML trước khi lưu

### **2. Validation Chỉ Kiểm Tra Độ Dài**
- ✅ **Có:** Kiểm tra minlength (100 ký tự)
- ❌ **Không có:** Kiểm tra format HTML, validate tags, sanitize malicious code

### **3. Content Được Trim**
- ✅ **Whitespace:** Tự động xóa khoảng trắng đầu/cuối
- ✅ **Nhiều lần:** Trim ở cả Service và Model level

---

## 📊 Tóm Tắt Flow

```
Admin gửi HTML
    ↓
Controller nhận (req.body.content)
    ↓
Service.validateContentLimits()
    ├─ Trim whitespace
    ├─ Check minlength (100 ký tự, bao gồm HTML tags)
    └─ Pass validation
    ↓
Service.createNews()
    ├─ Trim content
    ├─ Auto-generate excerpt (strip HTML nếu chưa có)
    └─ Tạo NewsModel object
    ↓
Model.pre("save") hook
    ├─ Backup: Generate excerpt nếu chưa có
    └─ Save vào database
    ↓
Database
    ├─ content: "<h1>...</h1><p>...</p>" (NGUYÊN HTML)
    └─ excerpt: "Text thuần..." (TEXT THUẦN)
```

---

## 🎯 Kết Luận

1. **Content:** Lưu **NGUYÊN HTML** vào database (không strip, không sanitize)
2. **Excerpt:** Tự động generate từ content bằng cách **strip HTML tags**
3. **Validation:** Chỉ kiểm tra độ dài (min 100 ký tự, bao gồm HTML tags)
4. **Không có sanitization:** Cần cẩn thận với XSS nếu cho phép admin nhập HTML tự do
