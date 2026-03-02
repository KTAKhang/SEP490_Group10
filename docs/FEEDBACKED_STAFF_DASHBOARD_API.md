# API Dashboard cho Feedbacked Staff

## Endpoint

- **GET** `/api/feedbacked-staff/dashboard`
- **Auth:** Bearer token (role phải là `admin` hoặc `feedbacked-staff`)

## Mục đích

Trang thống kê dành cho role **feedbacked-staff** (và admin) để sau khi đăng nhập có thể:
- Theo dõi tổng quan: reviews, comment tin tức, chat, bài viết
- Biết công việc cần làm: tin nhắn chưa đọc, review/comment đang ẩn, bài nháp

## Response mẫu

```json
{
  "status": "OK",
  "message": "Fetched feedbacked-staff dashboard successfully",
  "data": {
    "summary": {
      "reviews": { "total": 120, "visible": 110, "hidden": 10, "recentCount": 15 },
      "newsComments": { "total": 45, "visible": 40, "hidden": 5, "recentCount": 8 },
      "chat": { "roomsWithUnread": 3, "totalRooms": 20 },
      "news": { "total": 25, "draft": 2, "published": 23 }
    },
    "tasks": {
      "unreadChatRooms": 3,
      "reviewsHidden": 10,
      "commentsHidden": 5,
      "newsDraft": 2
    },
    "recent": {
      "reviews": [...],
      "newsComments": [...],
      "chatRooms": [...],
      "news": [...]
    }
  }
}
```

## Gợi ý hiển thị trên trang Dashboard (frontend)

1. **Thẻ tổng quan (summary):**
   - Số review (total / visible / hidden), số comment tin tức, số phòng chat (có tin chưa đọc / tổng phòng), số bài tin tức (draft / published).

2. **Phần "Công việc cần làm" (tasks):**
   - Tin nhắn chưa đọc: `tasks.unreadChatRooms` → link tới trang chat.
   - Review đang ẩn: `tasks.reviewsHidden` → link tới quản lý review.
   - Comment đang ẩn: `tasks.commentsHidden` → link tới bài viết/comment.
   - Bài nháp: `tasks.newsDraft` → link tới quản lý tin tức.

3. **Danh sách gần đây (recent):**
   - Hiển thị 5 review, 5 comment tin tức, 5 phòng chat, 5 bài tin tức mới nhất (dùng để nhanh chóng vào chi tiết hoặc duyệt nội dung).

## Frontend: sau khi đăng nhập

- Nếu `user.role === 'feedbacked-staff'` (hoặc admin), redirect hoặc hiển thị menu tới **Dashboard**.
- Gọi `GET /api/feedbacked-staff/dashboard` với header `Authorization: Bearer <token>`.
- Render trang thống kê theo `data.summary`, `data.tasks`, `data.recent` như trên.
