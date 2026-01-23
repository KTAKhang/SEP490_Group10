# ✅ Backend đã sẵn sàng cho CKEditor

## 🎯 Tóm tắt

Backend đã được **tối ưu hoàn toàn** để hoạt động với CKEditor. Bạn không cần viết HTML thủ công nữa, chỉ cần tích hợp CKEditor vào frontend.

---

## ✅ Những gì đã được cấu hình

### 1. **HTML Sanitizer** - Hỗ trợ đầy đủ CKEditor

✅ **Tags được phép:**
- Headings: `h1`, `h2`, `h3`, `h4`, `h5`, `h6`
- Paragraphs: `p`, `br`, `hr`
- Text formatting: `strong`, `em`, `u`, `s`, `b`, `i`, `sub`, `sup`
- Lists: `ul`, `ol`, `li`
- Links & Images: `a`, `img`
- Code: `blockquote`, `pre`, `code`
- Containers: `div`, `span`
- Tables: `table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td`

✅ **Attributes được phép:**
- Links: `href`, `target`, `rel`, `title`
- Images: `src`, `alt`, `title`, `width`, `height`, `style` (cho alignment)
- Tables: `colspan`, `rowspan`, `scope`, `border`, `cellpadding`, `cellspacing`, `width`
- Text formatting: `style` (cho `p`, `div`, `span`) - chỉ các style an toàn
- Common: `class`, `id`

✅ **Style được phép (an toàn):**
- Text: `color`, `text-align`, `font-size`, `font-weight`, `font-style`, `text-decoration`
- Layout: `margin`, `padding`, `width`, `height`, `float`, `display`
- Image: `max-width`, `height`

### 2. **Bảo mật**

✅ **Tự động chặn:**
- `<script>` tags
- `<iframe>` tags
- Event handlers (`onclick`, `onerror`, etc.)
- JavaScript URLs (`javascript:`, `data:text/html`, etc.)
- Dangerous styles (`expression()`, `javascript:`)
- Data attributes (`data-*`)

✅ **Validate ảnh:**
- Chỉ cho phép ảnh từ Cloudinary và Wikipedia
- Chặn ảnh từ domain không tin cậy
- Validate file extension

### 3. **Upload Ảnh**

✅ **Endpoint sẵn có:**
```
POST /news/upload-content-image
Headers: Authorization: Bearer <token>
Body: multipart/form-data với field "image"
Response: { url, publicId }
```

---

## 📝 Cách sử dụng

### Frontend (React/Vue/etc.)

1. **Cài đặt CKEditor:**
```bash
npm install @ckeditor/ckeditor5-react @ckeditor/ckeditor5-build-classic
```

2. **Cấu hình CKEditor:**
```jsx
import { CKEditor } from '@ckeditor/ckeditor5-react';
import ClassicEditor from '@ckeditor/ckeditor5-build-classic';

const editorConfiguration = {
  simpleUpload: {
    uploadUrl: 'http://localhost:3000/news/upload-content-image',
    withCredentials: true,
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
};

<CKEditor
  editor={ClassicEditor}
  config={editorConfiguration}
  data={content}
  onChange={(event, editor) => {
    const html = editor.getData();
    // Gửi html lên backend
  }}
/>
```

3. **Gửi lên Backend:**
```javascript
// Tạo bài viết
POST /news
Body: {
  title: "Tiêu đề",
  content: "<p>HTML từ CKEditor</p>", // ← HTML từ CKEditor
  thumbnail: <file>,
  excerpt: "Tóm tắt" // Tùy chọn
}
```

---

## 🔄 Quy trình xử lý

1. **Admin nhập nội dung** trong CKEditor
2. **CKEditor tạo HTML** (ví dụ: `<p>Nội dung <strong>in đậm</strong></p>`)
3. **Frontend gửi HTML** lên backend qua API
4. **Backend xử lý:**
   - ✅ Validate bảo mật (chặn script, iframe, etc.)
   - ✅ Validate ảnh (chỉ Cloudinary/Wikipedia)
   - ✅ Sanitize HTML (loại bỏ code độc, giữ format)
   - ✅ Lưu vào database
5. **Frontend hiển thị** HTML đã được sanitize

---

## ⚠️ Lưu ý

1. **HTML từ CKEditor sẽ được sanitize** - một số style/attribute không an toàn sẽ bị loại bỏ
2. **Ảnh phải upload qua endpoint** `/news/upload-content-image` - không chấp nhận ảnh từ domain khác (trừ Wikipedia)
3. **Token authentication** - CKEditor cần token để upload ảnh
4. **Content length** - Sau khi sanitize, content phải còn ít nhất 100 ký tự

---

## ✅ Kết luận

**Backend đã hoàn toàn sẵn sàng cho CKEditor!**

Bạn chỉ cần:
1. ✅ Tích hợp CKEditor vào frontend
2. ✅ Cấu hình upload ảnh
3. ✅ Gửi HTML từ CKEditor lên backend

**Không cần viết HTML thủ công nữa!** 🎉
