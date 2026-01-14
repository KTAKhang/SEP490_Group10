# Hướng Dẫn: Upload Ảnh Cho Content (HTML Editor)

## 📋 Tổng Quan

Đã tạo endpoint riêng để upload ảnh cho content (không phải thumbnail), cho phép admin upload ảnh và chèn vào HTML editor.

---

## 🚀 API Endpoint

### **POST /news/upload-content-image**

**Mô tả:** Upload ảnh để sử dụng trong HTML content của bài viết

**Authentication:** Required (Bearer token)

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body:
  - `image`: File ảnh (jpg, png, webp, max 5MB)

**Response:**
```json
{
  "status": "OK",
  "message": "Upload ảnh thành công",
  "data": {
    "url": "https://res.cloudinary.com/xxx/image/upload/v123/news/content/abc.jpg",
    "publicId": "news/content/abc"
  }
}
```

**Error Response:**
```json
{
  "status": "ERR",
  "message": "Ảnh phải là định dạng jpg, png hoặc webp"
}
```

---

## 💻 Cách Sử Dụng

### **1. Frontend - Upload Ảnh**

```javascript
// Function upload ảnh
const uploadContentImage = async (file) => {
  const formData = new FormData();
  formData.append('image', file);
  
  try {
    const response = await fetch('http://localhost:3000/news/upload-content-image', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });
    
    const result = await response.json();
    
    if (result.status === 'OK') {
      return result.data.url;  // Cloudinary URL
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  }
};
```

### **2. Tích Hợp Vào HTML Editor**

#### **Với TinyMCE:**

```javascript
tinymce.init({
  selector: '#content-editor',
  plugins: 'image',
  toolbar: 'image',
  images_upload_handler: async (blobInfo, progress) => {
    try {
      const url = await uploadContentImage(blobInfo.blob());
      progress(100);
      return url;
    } catch (error) {
      progress(0);
      throw error;
    }
  },
});
```

#### **Với CKEditor:**

```javascript
ClassicEditor
  .create(document.querySelector('#content-editor'), {
    simpleUpload: {
      uploadUrl: 'http://localhost:3000/news/upload-content-image',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    },
  })
  .then(editor => {
    console.log('Editor ready', editor);
  })
  .catch(error => {
    console.error('Editor error', error);
  });
```

#### **Với React Quill:**

```javascript
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const ImageHandler = async () => {
  const input = document.createElement('input');
  input.setAttribute('type', 'file');
  input.setAttribute('accept', 'image/*');
  input.click();
  
  input.onchange = async () => {
    const file = input.files[0];
    if (file) {
      try {
        const url = await uploadContentImage(file);
        const quill = quillRef.current.getEditor();
        const range = quill.getSelection();
        quill.insertEmbed(range.index, 'image', url);
      } catch (error) {
        console.error('Upload failed:', error);
      }
    }
  };
};

const modules = {
  toolbar: {
    container: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      ['image'],  // Image button
    ],
    handlers: {
      'image': ImageHandler,
    },
  },
};
```

### **3. Manual Upload (Không Dùng Editor)**

```javascript
// HTML
<input type="file" id="imageInput" accept="image/*" />
<button onclick="uploadAndInsert()">Upload & Insert</button>

// JavaScript
const uploadAndInsert = async () => {
  const fileInput = document.getElementById('imageInput');
  const file = fileInput.files[0];
  
  if (!file) {
    alert('Vui lòng chọn ảnh');
    return;
  }
  
  try {
    const url = await uploadContentImage(file);
    
    // Insert vào editor hoặc HTML content
    const imgTag = `<img src="${url}" alt="Hình ảnh" />`;
    
    // Ví dụ: Insert vào textarea
    const contentTextarea = document.getElementById('content');
    const cursorPos = contentTextarea.selectionStart;
    const textBefore = contentTextarea.value.substring(0, cursorPos);
    const textAfter = contentTextarea.value.substring(cursorPos);
    contentTextarea.value = textBefore + imgTag + textAfter;
    
    alert('Upload thành công!');
  } catch (error) {
    alert('Upload thất bại: ' + error.message);
  }
};
```

---

## 📸 Flow Hoạt Động

```
1. Admin chọn ảnh trong HTML Editor
    ↓
2. Frontend gọi POST /news/upload-content-image
    ↓
3. BE upload ảnh lên Cloudinary (folder: news/content)
    ↓
4. BE optimize ảnh (resize, compress, convert WebP)
    ↓
5. BE trả về Cloudinary URL
    ↓
6. Frontend insert <img src="URL"> vào editor
    ↓
7. Admin tiếp tục viết content
    ↓
8. Khi save bài viết, HTML content (có <img> tag) được gửi lên
    ↓
9. BE sanitize HTML (validate image URLs)
    ↓
10. BE lưu HTML vào database
```

---

## 🔍 Chi Tiết Kỹ Thuật

### **1. Upload Middleware**

- **File:** `src/middleware/uploadMiddleware.js`
- **Function:** `uploadNewsContentImage`
- **Folder Cloudinary:** `news/content`
- **Max size:** 5MB
- **Allowed formats:** jpg, jpeg, png, webp
- **Auto optimize:** Resize max 1920x1920, compress, convert WebP

### **2. Controller**

- **File:** `src/controller/NewsController.js`
- **Function:** `uploadContentImage`
- **Response:** URL và publicId của ảnh

### **3. Route**

- **File:** `src/routes/NewsRouter.js`
- **Endpoint:** `POST /news/upload-content-image`
- **Auth:** Required (newsAuthMiddleware)

---

## ✅ Lợi Ích

1. **Tách Biệt:**
   - Thumbnail: Dùng cho preview, list view
   - Content images: Dùng trong HTML content

2. **Tối Ưu:**
   - Ảnh được optimize tự động
   - Upload lên Cloudinary (CDN)
   - Format WebP (nhẹ hơn)

3. **Quản Lý:**
   - Folder riêng: `news/content`
   - Dễ quản lý và xóa sau này

4. **Bảo Mật:**
   - Validate file type
   - Validate file size
   - Sanitize HTML khi save

---

## 📝 Ví Dụ Request

### **cURL:**

```bash
curl -X POST http://localhost:3000/news/upload-content-image \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@/path/to/image.jpg"
```

### **Postman:**

1. Method: `POST`
2. URL: `http://localhost:3000/news/upload-content-image`
3. Headers:
   - `Authorization: Bearer YOUR_TOKEN`
4. Body:
   - Type: `form-data`
   - Key: `image` (type: File)
   - Value: Chọn file ảnh

### **JavaScript (Fetch):**

```javascript
const formData = new FormData();
formData.append('image', fileInput.files[0]);

fetch('http://localhost:3000/news/upload-content-image', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData,
})
  .then(res => res.json())
  .then(data => {
    if (data.status === 'OK') {
      console.log('Image URL:', data.data.url);
      // Insert vào editor
    }
  });
```

---

## ⚠️ Lưu Ý

1. **File Size:**
   - Tối đa 5MB
   - Nếu vượt quá → Error

2. **File Format:**
   - Chỉ chấp nhận: jpg, jpeg, png, webp
   - Các format khác → Error

3. **Authentication:**
   - Phải có token hợp lệ
   - Chỉ author/admin mới upload được

4. **URL Usage:**
   - URL trả về là Cloudinary URL (HTTPS)
   - Có thể dùng trực tiếp trong `<img>` tag
   - URL sẽ được validate khi save bài viết

5. **Sanitization:**
   - Khi save bài viết, HTML sẽ được sanitize
   - Invalid image URLs sẽ bị loại bỏ
   - Chỉ giữ lại valid URLs (http, https, data:image/)

---

## 🎯 Kết Luận

Bây giờ bạn có thể:
- ✅ Upload ảnh riêng cho content
- ✅ Chèn ảnh vào HTML editor
- ✅ Ảnh được optimize tự động
- ✅ URL an toàn, được validate

**Next Steps:**
1. Tích hợp vào HTML editor (TinyMCE, CKEditor, etc.)
2. Test upload với các loại ảnh khác nhau
3. Verify ảnh hiển thị đúng trong content
