# News Management API - Hướng Dẫn Test

## Cấu hình

1. **Import collection vào Postman/Insomnia:**
   - File: `news-api-test-collection.json`
   - Import vào Postman hoặc Insomnia

2. **Thiết lập Variables:**
   - `baseUrl`: `http://localhost:3000` (hoặc URL server của bạn)
   - `token`: JWT token từ login (lấy từ `/auth/login`)
   - `newsId`: ID của bài viết (sẽ được set sau khi tạo bài viết)

## Lấy Token

Trước khi test, bạn cần đăng nhập để lấy token:

```http
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "email": "your-email@example.com",
  "password": "your-password"
}
```

Copy `accessToken` từ response và paste vào variable `token` trong collection.

## Test Cases

### 1. Public Endpoints (Không cần auth)

#### 1.1. Get Public News List
```http
GET http://localhost:3000/news/public?public=true&page=1&limit=20
```
- **Expected:** Danh sách bài viết PUBLISHED
- **Query params:**
  - `public=true`: Chỉ lấy PUBLISHED
  - `page`: Số trang
  - `limit`: Số bài/trang
  - `search`: Tìm kiếm (optional)
  - `is_featured`: Lọc featured (optional)

#### 1.2. Get Featured News
```http
GET http://localhost:3000/news/public/featured
```
- **Expected:** Tối đa 5 bài viết featured

#### 1.3. Get Public News By ID
```http
GET http://localhost:3000/news/public/{newsId}
```
- **Expected:** Chi tiết bài viết
- **Note:** Optional auth để track view (nếu không có token, vẫn xem được nhưng không track view)

### 2. Author Endpoints (Cần auth)

#### 2.1. Create News (DRAFT)
```http
POST http://localhost:3000/news
Authorization: Bearer {token}
Content-Type: multipart/form-data

title: "Tiêu đề bài viết mẫu - Phải có ít nhất 10 ký tự"
content: "<p>Nội dung phải có ít nhất 100 ký tự...</p>"
excerpt: "Excerpt phải có ít nhất 50 ký tự..." (optional, tự động generate nếu không có)
status: "DRAFT"
thumbnail: [file image jpg/png/webp, max 5MB]
```
- **Expected:** Tạo bài viết DRAFT thành công
- **Note:** 
  - Excerpt tự động generate từ content nếu không có
  - Thumbnail bắt buộc

#### 2.2. Create News (PUBLISHED)
```http
POST http://localhost:3000/news
Authorization: Bearer {token}
Content-Type: multipart/form-data

title: "Bài viết đã xuất bản"
content: "<p>Nội dung đầy đủ...</p>"
status: "PUBLISHED"
thumbnail: [file image]
```
- **Expected:** Tạo bài viết PUBLISHED thành công
- **Validation:** Phải có đủ title, content, thumbnail

#### 2.3. Create Featured News
```http
POST http://localhost:3000/news
Authorization: Bearer {token}
Content-Type: multipart/form-data

title: "Bài viết nổi bật"
content: "<p>Nội dung...</p>"
status: "PUBLISHED"
is_featured: "true"
thumbnail: [file image]
```
- **Expected:** Tạo bài viết featured
- **Note:** 
  - Chỉ PUBLISHED mới được featured
  - Tối đa 5 bài featured, nếu set bài thứ 6 → tự động unfeature bài cũ nhất

#### 2.4. Get News List (Auth)
```http
GET http://localhost:3000/news?page=1&limit=20&status=DRAFT
Authorization: Bearer {token}
```
- **Expected:** Danh sách bài viết của mình (hoặc tất cả nếu admin)
- **Query params:**
  - `status`: DRAFT hoặc PUBLISHED
  - `author_id`: Lọc theo author (optional)
  - `search`: Tìm kiếm (optional)

#### 2.5. Get News By ID (Auth)
```http
GET http://localhost:3000/news/{newsId}
Authorization: Bearer {token}
```
- **Expected:** Chi tiết bài viết
- **Note:** 
  - Author/Admin xem không tính view
  - User khác xem sẽ track view (1 view/IP/24h)

#### 2.6. Update News - Change Status to PUBLISHED
```http
PUT http://localhost:3000/news/{newsId}
Authorization: Bearer {token}
Content-Type: multipart/form-data

status: "PUBLISHED"
```
- **Expected:** Cập nhật status thành công
- **Validation:** Phải có đủ title, content, thumbnail

#### 2.7. Update News - Change Title and Content
```http
PUT http://localhost:3000/news/{newsId}
Authorization: Bearer {token}
Content-Type: multipart/form-data

title: "Tiêu đề đã được cập nhật"
content: "<p>Nội dung đã cập nhật...</p>"
excerpt: "Excerpt đã cập nhật..." (optional)
```
- **Expected:** Cập nhật thành công
- **Note:** Author chỉ sửa được bài của mình, Admin sửa được tất cả

#### 2.8. Update News - Set Featured
```http
PUT http://localhost:3000/news/{newsId}
Authorization: Bearer {token}
Content-Type: multipart/form-data

is_featured: "true"
```
- **Expected:** Set featured thành công
- **Note:** Chỉ PUBLISHED mới được featured

#### 2.9. Update News - Change to DRAFT
```http
PUT http://localhost:3000/news/{newsId}
Authorization: Bearer {token}
Content-Type: multipart/form-data

status: "DRAFT"
```
- **Expected:** Chuyển về DRAFT thành công
- **Note:** Cần thiết trước khi xóa PUBLISHED

#### 2.10. Delete News
```http
DELETE http://localhost:3000/news/{newsId}
Authorization: Bearer {token}
```
- **Expected:** Xóa thành công
- **Validation:** Chỉ có thể xóa DRAFT, không thể xóa PUBLISHED trực tiếp

### 3. Test Cases - Validation Errors

#### 3.1. Title Too Short
```http
POST http://localhost:3000/news
Authorization: Bearer {token}
Content-Type: multipart/form-data

title: "Short"  // < 10 ký tự
content: "<p>Content đủ dài...</p>"
thumbnail: [file]
```
- **Expected:** Error: "Tiêu đề phải có ít nhất 10 ký tự"

#### 3.2. Content Too Short
```http
POST http://localhost:3000/news
Authorization: Bearer {token}
Content-Type: multipart/form-data

title: "Title đủ dài"
content: "Short"  // < 100 ký tự
thumbnail: [file]
```
- **Expected:** Error: "Nội dung phải có ít nhất 100 ký tự"

#### 3.3. Missing Thumbnail
```http
POST http://localhost:3000/news
Authorization: Bearer {token}
Content-Type: multipart/form-data

title: "Title đủ dài"
content: "<p>Content đủ dài...</p>"
// Không có thumbnail
```
- **Expected:** Error: "Ảnh thumbnail là bắt buộc"

#### 3.4. Publish Without Required Fields
```http
PUT http://localhost:3000/news/{newsId}
Authorization: Bearer {token}
Content-Type: multipart/form-data

status: "PUBLISHED"
// Bài viết chưa có đủ title, content, thumbnail
```
- **Expected:** Error: "Tiêu đề là bắt buộc để xuất bản" hoặc tương tự

#### 3.5. Delete PUBLISHED News
```http
DELETE http://localhost:3000/news/{newsId}
Authorization: Bearer {token}
// newsId là bài viết PUBLISHED
```
- **Expected:** Error: "Không thể xóa bài viết đã PUBLISHED. Vui lòng chuyển về DRAFT trước"

## Business Rules Test Checklist

- [ ] **BR-NEWS-01:** Bài viết phải có đủ title, content, thumbnail mới cho phép PUBLISHED
- [ ] **BR-NEWS-01:** Chỉ PUBLISHED hiển thị ở trang công khai
- [ ] **BR-NEWS-02:** Author chỉ sửa/xóa được bài của mình
- [ ] **BR-NEWS-02:** Admin sửa/xóa được tất cả bài viết
- [ ] **BR-NEWS-02:** Không thể xóa PUBLISHED trực tiếp
- [ ] **BR-NEWS-03:** Tối đa 5 bài featured cùng lúc
- [ ] **BR-NEWS-03:** Set bài thứ 6 → tự động unfeature bài cũ nhất
- [ ] **BR-NEWS-03:** Chỉ PUBLISHED mới được featured
- [ ] **BR-NEWS-04:** Mỗi IP chỉ tính 1 view cho 1 bài trong 24h
- [ ] **BR-NEWS-04:** Author/Admin xem không tính view
- [ ] **BR-NEWS-08:** Validation title (10-200 ký tự), excerpt (50-500), content (min 100)
- [ ] **BR-NEWS-09:** Tự động sinh excerpt từ content nếu không có
- [ ] **BR-NEWS-10:** Upload ảnh tối đa 5MB
- [ ] **BR-NEWS-11:** PUBLISHED sắp xếp theo published_at DESC, DRAFT theo updated_at DESC

## Sample Data

### Sample News Content (HTML)
```html
<h1>Tiêu đề bài viết</h1>
<p>Đây là đoạn văn đầu tiên của bài viết. Nội dung này phải có ít nhất 100 ký tự để đáp ứng yêu cầu validation của hệ thống.</p>
<p>Đây là đoạn văn thứ hai để làm phong phú nội dung bài viết và cung cấp thêm thông tin cho người đọc.</p>
<h2>Tiêu đề phụ</h2>
<p>Đây là phần nội dung tiếp theo của bài viết với các thông tin chi tiết hơn.</p>
```

### Sample Excerpt
```
Đây là đoạn tóm tắt bài viết. Excerpt phải có ít nhất 50 ký tự và tối đa 500 ký tự để đáp ứng yêu cầu của hệ thống. Đây là một ví dụ về excerpt đầy đủ.
```

## Notes

1. **File Upload:** 
   - Sử dụng `multipart/form-data` cho các request có upload thumbnail
   - Chỉ chấp nhận jpg, png, webp
   - Tối đa 5MB

2. **View Tracking:**
   - Mỗi IP chỉ tính 1 view cho 1 bài trong 24h
   - Author/Admin xem không tính view
   - View được track tự động khi GET `/news/public/:id` hoặc `/news/:id`

3. **Featured Limit:**
   - Tối đa 5 bài featured
   - Khi set bài thứ 6, hệ thống tự động unfeature bài cũ nhất (theo published_at)

4. **Sorting:**
   - PUBLISHED: Sắp xếp theo `published_at DESC` (mới nhất trước)
   - DRAFT: Sắp xếp theo `updated_at DESC` (cập nhật gần nhất trước)
