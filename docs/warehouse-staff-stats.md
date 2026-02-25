# Trang thống kê cho Warehouse Staff

## Tổng quan

Warehouse staff có hai luồng chính:
1. **Nhập hàng vào kho (Product)** – qua `InventoryTransaction` type `RECEIPT` (ProductBatchService liên quan đến product receivedQuantity, chốt lô do Admin).
2. **Nhập Pre-order vào kho** – qua `PreOrderReceive` (PreOrderStockService).

Dữ liệu **theo cá nhân** (mỗi nhân viên khác nhau) dựa trên:
- **RECEIPT**: `InventoryTransaction.createdBy` (user ID).
- **Pre-order receive**: `PreOrderReceive.receivedBy` (user ID).

Dữ liệu **chung** (giống nhau cho mọi warehouse staff) là tổng quan kho: tồn kho, pre-order stock, v.v.

---

## 1. File liên quan (đã có sẵn)

### Nhập hàng (RECEIPT – Product)
| File | Vai trò |
|------|--------|
| `src/models/InventoryTransactionModel.js` | Schema: `type`, `product`, `quantity`, **`createdBy`**, `harvestBatch`, `note`, `createdAt`. |
| `src/services/InventoryTransactionService.js` | `createReceipt(userId, payload)`, **`getReceiptHistory(filters)`** – filter `createdBy`, `productId`, `startDate`, `endDate`. |
| `src/controller/InventoryTransactionController.js` | `createReceipt`, `getReceiptHistory`, `getReceiptById`, `getTransactionHistory`. |
| `src/routes/InventoryRouter.js` | POST `/inventory/receipts`, GET `/inventory/receipts`, GET `/inventory/receipts/:id`, GET `/inventory/transactions`. |

### Nhập Pre-order
| File | Vai trò |
|------|--------|
| `src/models/PreOrderReceiveModel.js` | Schema: **`receivedBy`**, `fruitTypeId`, `quantityKg`, `preOrderHarvestBatchId`, `note`, `createdAt`. |
| `src/services/PreOrderStockService.js` | `createReceive({ receivedBy, ... })`, `createReceiveByBatch({ receivedBy, ... })`, **`listReceives(fruitTypeId, page, limit)`** – không filter theo receivedBy (chỉ fruitTypeId, preOrderHarvestBatchId). |
| `src/controller/PreOrderStockController.js` | Nhận `req.user._id` → `receivedBy`. |
| `src/routes/InventoryRouter.js` | GET `/inventory/preorder-stock`, POST `/inventory/preorder-stock/receive`, POST `/inventory/preorder-stock/receive-by-batch`, GET `/inventory/preorder-stock/receives`. |

### Product / Batch (xem, không tạo bởi warehouse)
| File | Vai trò |
|------|--------|
| `src/services/ProductBatchService.js` | Logic chốt lô, reset batch (Admin). Warehouse chỉ liên quan gián tiếp qua RECEIPT. |
| `src/models/ProductBatchHistoryModel.js` | Lịch sử lô đã chốt (không có createdBy). |
| `src/models/ProductModel.js` | `onHandQuantity`, `stockStatus`, v.v. – dùng cho thống kê tổng. |

### Auth
| File | Vai trò |
|------|--------|
| `src/middleware/inventoryMiddleware.js` | `inventoryWarehouseMiddleware`, `inventoryAdminOrWarehouseMiddleware`. |
| `src/middleware/authMiddleware.js` | Role warehouse: `warehouse-staff` / `warehouse_staff`. |

---

## 2. Dữ liệu có thể dùng cho thống kê

### A. Theo cá nhân (per staff – mỗi nhân viên khác nhau)

- **Từ `inventory_transactions` (type = RECEIPT, createdBy = staffId):**
  - Số phiếu nhập hàng (số dòng RECEIPT).
  - Tổng số lượng đã nhập (sum quantity) theo kỳ (ngày/tuần/tháng).
  - Số sản phẩm khác nhau đã nhập (count distinct product).
  - Có thể nhóm theo product hoặc theo thời gian.

- **Từ `pre_order_receives` (receivedBy = staffId):**
  - Số phiếu nhập pre-order (số bản ghi).
  - Tổng kg đã nhập (sum quantityKg) theo kỳ.
  - Nhóm theo fruitTypeId (loại trái).

### B. Chung (giống nhau cho mọi warehouse staff)

- **Từ Product / Inventory:**
  - Tổng tồn kho hiện tại (sum Product.onHandQuantity), số sản phẩm IN_STOCK / OUT_OF_STOCK.
  - Có thể lấy từ ProductModel aggregate hoặc API product hiện có.

- **Từ PreOrderStockService.listStock():**
  - Theo từng fruit type: receivedKg, allocatedKg, availableKg (đã có API GET `/inventory/preorder-stock`).

- **Lịch sử nhập hàng / giao dịch:**
  - GET `/inventory/receipts` (có filter createdBy) – đã có.
  - GET `/inventory/transactions` (có filter createdBy, type) – đã có.
  - GET `/inventory/preorder-stock/receives` – chưa filter receivedBy; cần thêm nếu muốn “chỉ phiếu của tôi”.

---

## 3. Trang thống kê warehouse staff nên hiển thị

### Phần 1: Thống kê cá nhân (của tôi)

| Nội dung | Nguồn dữ liệu | Ghi chú |
|----------|----------------|--------|
| Số phiếu nhập hàng (RECEIPT) trong kỳ | `InventoryTransaction` type RECEIPT, `createdBy = currentUser._id`, filter theo `createdAt` (today / week / month). | Aggregate count. |
| Tổng số lượng đã nhập (sản phẩm) trong kỳ | Cùng trên, sum `quantity`. | |
| Số phiếu nhập Pre-order trong kỳ | `PreOrderReceive` `receivedBy = currentUser._id`, filter `createdAt`. | Aggregate count. |
| Tổng kg Pre-order đã nhập trong kỳ | Cùng trên, sum `quantityKg`. | |
| Top sản phẩm tôi nhập nhiều nhất (kỳ) | RECEIPT createdBy = user, group by product, sum quantity, sort, limit. | Có thể kèm tên sản phẩm (populate product). |
| Top loại trái Pre-order tôi nhập nhiều nhất (kỳ) | PreOrderReceive receivedBy = user, group by fruitTypeId, sum quantityKg. | Có thể kèm tên fruit type. |

Kỳ: nên có filter (hôm nay / tuần này / tháng này) hoặc dropdown.

### Phần 2: Thống kê chung (kho – mọi người giống nhau)

| Nội dung | Nguồn dữ liệu | Ghi chú |
|----------|----------------|--------|
| Tổng tồn kho hiện tại (số sản phẩm / tổng unit) | ProductModel: sum onHandQuantity, count theo stockStatus. | |
| Số sản phẩm đang còn hàng / hết hàng | ProductModel: count IN_STOCK, OUT_OF_STOCK. | |
| Pre-order stock theo loại trái | Đã có: GET `/inventory/preorder-stock` (receivedKg, allocatedKg, availableKg). | Dùng lại API hiện có. |
| Số phiếu nhập hàng toàn kho (kỳ) | InventoryTransaction RECEIPT, count (không filter createdBy). | Tùy chọn. |
| Số phiếu nhập Pre-order toàn kho (kỳ) | PreOrderReceive count. | Tùy chọn. |

---

## 4. API đã triển khai

- **GET `/inventory/stats/warehouse`**  
  - Auth: `inventoryWarehouseMiddleware` (chỉ warehouse staff).  
  - Query: `page`, `limit` (cho lịch sử nhập kho cá nhân).  
  - Response:
    - **myStats.receiptHistory**: data (danh sách RECEIPT), pagination.
    - **warehouseStats**: totalReceivedByMonthThisYear, totalReceivedCurrentMonth, totalQuantityInStock, totalProductsInStock, totalProductsLowStock, totalProductsNearExpiry, totalProductsOutOfStock, totalPreOrderKg, preOrderStockSummary (totalReceivedKg, totalAllocatedKg, availableKg).

- **GET `/inventory/preorder-stock/receives`**  
  - Đã hỗ trợ query **`receivedBy=me`**: chỉ lấy phiếu nhập pre-order do user hiện tại thực hiện. Có thể truyền `receivedBy=<userId>` (ObjectId) để filter theo người khác (admin/warehouse xem).

---

## 5. File đã tạo/sửa

| File | Mô tả |
|------|--------|
| `src/services/WarehouseStaffStatsService.js` | getWarehouseStaffStats(staffId, { page, limit }): lịch sử RECEIPT cá nhân + warehouseStats. |
| `src/controller/WarehouseStaffStatsController.js` | getWarehouseStats (GET /inventory/stats/warehouse). |
| `src/routes/InventoryRouter.js` | Thêm GET `/stats/warehouse`, middleware warehouse. |
| `src/services/PreOrderStockService.js` | listReceives thêm tham số receivedBy. |
| `src/controller/PreOrderStockController.js` | listReceives truyền receivedBy=me → req.user._id. |

---

## 6. Tóm tắt

- **Cá nhân:** Dùng `InventoryTransaction.createdBy` và `PreOrderReceive.receivedBy` để mọi chỉ số “của tôi” đều theo đúng nhân viên đang đăng nhập.
- **Chung:** Dùng Product (tồn kho), PreOrderStock (listStock), và có thể thêm aggregate RECEIPT/PreOrderReceive không filter createdBy/receivedBy.
- **Cá nhân:** Lịch sử nhập kho (RECEIPT) của nhân viên đó, có phân trang.
- **Chung:** Tổng nhập theo tháng trong năm, tháng hiện tại; tồn kho; còn hàng / sắp hết (~10%) / hết hàng; sắp hết hạn (≤7 ngày); tổng Pre-order (kg) và summary (received, allocated, available).
