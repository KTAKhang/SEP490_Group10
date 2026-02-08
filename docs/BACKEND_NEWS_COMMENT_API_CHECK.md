# Backend – Kiểm tra API News Comment (reply nhiều cấp)

**Ngữ cảnh:** Frontend hỗ trợ reply nhiều cấp (tối đa 5 tầng, root = tầng 0). Tài liệu này xác nhận Backend đã có đủ thuộc tính và logic tương ứng.

---

## 1. POST tạo comment/reply

| Yêu cầu | Trạng thái | Chi tiết |
|--------|------------|----------|
| Endpoint | ✅ | `POST /news-comments/:newsId` (mount tại `src/routes/index.js`: `app.use("/news-comments", ...)`) |
| Body có `parent_id` | ✅ | Controller truyền `...req.body` vào service → client gửi `{ content, parent_id? }`. Service đọc `parent_id` từ payload (`NewsCommentService.createComment`). |
| Backend chấp nhận `parent_id` trỏ tới bất kỳ comment nào (kể cả reply của reply) | ✅ | Có. Logic không giới hạn `parent_id` chỉ cho comment gốc; chỉ validate: comment cha tồn tại, cùng `news_id`, không DELETED, và **độ sâu (depth)** (xem bên dưới). |
| Giới hạn depth | ✅ Đã nới | Backend **có** check depth trong `checkCommentDepth()`. **Giới hạn hiện tại: tối đa 5 cấp** (depth 0 = root, depth 4 = cấp 5). Reply bị từ chối khi comment cha đã ở cấp 5 (depth ≥ 4). Message lỗi: *"Không thể reply vào comment cấp 5. Hệ thống chỉ hỗ trợ tối đa 5 cấp comment"*. |

**Code tham chiếu:**
- Route: `NewsCommentRouter.js` → `POST /:newsId`, `createComment`.
- Controller: `NewsCommentController.createComment` → body gồm `content`, `parent_id` (từ `req.body`).
- Service: `NewsCommentService.createComment` → dùng `parent_id`, gọi `checkCommentDepth(parent_id)`.
- Depth: `NewsCommentService.checkCommentDepth` → tính depth bằng cách đi ngược `parent_id` đến null; từ chối khi `depth >= 4`.

---

## 2. GET danh sách comment theo parent

| Yêu cầu | Trạng thái | Chi tiết |
|--------|------------|----------|
| Endpoint | ✅ | `GET /news-comments/:newsId?parent_id=null` (comment gốc) hoặc `GET /news-comments/:newsId?parent_id=<commentId>` (reply của comment đó). |
| Trả về chỉ **con trực tiếp** của `parent_id` | ✅ | Có. Query: `parent_id = null` (lấy gốc) hoặc `parent_id = parentId` (lấy đúng con trực tiếp của `parentId`). Không trả về cây lồng sâu; Frontend gọi đệ quy theo từng `parent_id` để build cây đến depth 5. |

**Code tham chiếu:**
- Route: `NewsCommentRouter.js` → `GET /:newsId`, `getComments`.
- Controller: `NewsCommentController.getComments` → đọc `parent_id` từ `req.query`; chuẩn hóa `"null"`/empty → `null`.
- Service: `NewsCommentService.getComments(newsId, parentId, ...)` → `query.parent_id = null` hoặc `query.parent_id = parentId`; không lấy cháu.

---

## 3. Model / Comment schema

| Yêu cầu | Trạng thái | Chi tiết |
|--------|------------|----------|
| Mỗi comment có trường `parent_id` tham chiếu comment cha (null nếu gốc) | ✅ | Model `NewsCommentModel` có `parent_id`: `ObjectId`, ref `"news_comments"`, `default: null`, có index. |
| Không cần thêm thuộc tính mới cho “reply nhiều cấp” | ✅ | Đúng. Chỉ cần `parent_id` và logic depth trong service; không có trường `depth` hoặc `level` trong schema. |

**Code tham chiếu:** `src/models/NewsCommentModel.js` → field `parent_id`.

---

## Tóm tắt câu trả lời BE

1. **`parent_id` có được dùng cho mọi comment (kể cả reply của reply) khi tạo mới không?**  
   **Có.** Backend chấp nhận `parent_id` trỏ tới bất kỳ comment nào (gốc hoặc reply), miễn cùng bài viết, không bị xóa và không vượt quá depth cho phép.

2. **Có check depth không? Nếu có, giới hạn hiện tại là bao nhiêu?**  
   **Có.** Backend check depth trong `checkCommentDepth()`. Giới hạn hiện tại: **tối đa 5 cấp** (depth 0, 1, 2, 3, 4 tương ứng cấp 1–5). Reply bị từ chối khi comment cha đã ở cấp 5 (Frontend cần tối thiểu depth 5 → đã đáp ứng).

3. **GET theo `parent_id` có trả về đúng danh sách con trực tiếp không?**  
   **Có.** GET `/:newsId?parent_id=null` trả về comment gốc; `?parent_id=<commentId>` trả về chỉ các comment có `parent_id = <commentId>` (con trực tiếp). Không trả về cây lồng sâu.

---

## Kết luận

- **POST:** Chấp nhận `parent_id` bất kỳ (kể cả reply của reply); giới hạn depth đã là 5 cấp.
- **GET:** Trả về đúng danh sách con trực tiếp theo `parent_id`; Frontend có thể gọi đệ quy để build cây đến depth 5.
- **Model:** Có `parent_id`, không cần thêm thuộc tính mới.

Backend đã sẵn sàng cho reply nhiều cấp (tối đa 5 tầng) theo đúng yêu cầu kiểm tra trên.

---

## Yêu cầu Frontend (UI/UX) – News Comment

Hai quy tắc hiển thị và tương tác sau **Frontend cần implement** (Backend không đổi):

### 1. Thụt lề (indent) reply

- **Reply đầu tiên** dưới một comment: thụt lùi **1 cấp** (margin/padding trái 1 đơn vị) so với comment gốc.
- **Reply thứ 2 trở đi** (cùng cấp dưới cùng một comment hoặc cùng chuỗi reply): **không** thụt thêm; cùng mức thụt lề với reply đầu tiên (chỉ 1 cấp so với gốc).

→ Tóm lại: một “tầng” reply chỉ có **một mức** thụt lề, không tăng dần theo từng reply.

### 2. Đối tượng được reply – chỉ reply mới nhất

- Người dùng **không** chọn được một comment cụ thể trong chuỗi reply để trả lời.
- Chỉ có thể **trả lời vào reply mới nhất** của chuỗi đó (reply mới nhất trong nhánh).
- Hành vi giống bên **admin**: một nhánh chỉ có một nút/action “Reply”, và luôn gắn với reply mới nhất.

**Cách implement (Frontend):**

- Trong mỗi nhánh (comment gốc + các reply), khi user bấm **Reply**:
  - Gửi `POST /news-comments/:newsId` với `parent_id` = **ID của reply mới nhất** trong nhánh đó (comment “đuôi” của chuỗi, `createdAt` lớn nhất hoặc phần tử cuối theo thứ tự hiển thị).
- Không hiển thị nút “Reply” trên từng comment riêng lẻ trong chuỗi; chỉ một điểm “Reply” cho cả nhánh, và luôn tạo reply con của reply mới nhất.

Backend vẫn chấp nhận mọi `parent_id` hợp lệ; Frontend chủ động luôn gửi `parent_id` = reply mới nhất để đạt đúng UX trên.
