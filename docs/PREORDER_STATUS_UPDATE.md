# Pre-order status model update – summary of changes

## 1. New status model (backend + frontend)

- **WAITING_FOR_ALLOCATION** – Deposit paid, no stock allocated yet (replaces old “waiting for product” for new orders).
- **WAITING_FOR_NEXT_BATCH** – Deposit paid, allocation was attempted but stock was insufficient.
- **ALLOCATED_WAITING_PAYMENT** – Stock allocated, waiting for remaining 50% payment.
- **READY_FOR_FULFILLMENT** – 100% paid, ready for delivery.
- **COMPLETED** – Delivery completed.

Legacy status **WAITING_FOR_PRODUCT** remains in the enum and is treated like WAITING_FOR_ALLOCATION in demand and allocation (backward compatible).

---

## 2. Modified services

### PreOrderModel.js
- Status enum updated to new values + `WAITING_FOR_PRODUCT` (legacy).
- Default status set to `WAITING_FOR_ALLOCATION`.

### PreOrderService.js
- **fulfillPaymentIntent**: creates PreOrder with `status: "WAITING_FOR_ALLOCATION"`.
- **getMyPreOrders**: `canPayRemaining` only when `status === "ALLOCATED_WAITING_PAYMENT"`; status filter uses new + legacy statuses.
- **createRemainingPaymentIntent**: allowed only when `status === "ALLOCATED_WAITING_PAYMENT"` (no allocation record check).
- **fulfillRemainingPayment**: sets `remainingPaidAt` and `status: "READY_FOR_FULFILLMENT"` (unchanged).
- **markPreOrderCompleted**: only when `status === "READY_FOR_FULFILLMENT"` (unchanged).
- Removed dependency on `PreOrderAllocationModel` for `getMyPreOrders` and `createRemainingPaymentIntent`.

### PreOrderAllocationService.js
- **Demand**: `DEMAND_STATUSES = ["WAITING_FOR_ALLOCATION", "WAITING_FOR_NEXT_BATCH", "ALLOCATED_WAITING_PAYMENT", "WAITING_FOR_PRODUCT"]`.  
  READY_FOR_FULFILLMENT and COMPLETED are **not** counted in demand.
- **allocatedKg**: computed from PreOrders with status in `["ALLOCATED_WAITING_PAYMENT", "READY_FOR_FULFILLMENT", "COMPLETED"]`.
- **upsertAllocation**: replaced with FIFO allocation:
  - Available stock = `receivedKg - allocatedSoFar`.
  - Queue: WAITING_FOR_NEXT_BATCH first (createdAt asc), then WAITING_FOR_ALLOCATION / WAITING_FOR_PRODUCT (createdAt asc).
  - For each order: if `available >= order.quantityKg` → set `ALLOCATED_WAITING_PAYMENT` and deduct; else set `WAITING_FOR_NEXT_BATCH` (if was WAITING_FOR_ALLOCATION or WAITING_FOR_PRODUCT) and stop.
  - No partial allocation; no setting fruit type to INACTIVE.
  - PreOrderAllocationModel.allocatedKg updated for display/backward compat; `triggerReadyAndNotifyForFruitType` still called.

### PreOrderHarvestBatchService.js
- **Demand**: no longer used in createBatch (removed “quantity must equal demand” and “one batch per fruit type”).
- **createBatch**: multiple batches per fruit type allowed; `quantityKg` only required to be > 0 (receive-time validates against demand).

### PreOrderStockService.js
- **getDemandKgForFruitType**: new helper; demand = sum(quantityKg) for PreOrders with status in `DEMAND_STATUSES` (includes WAITING_FOR_PRODUCT).
- **createReceive**: requires `confirmed: true`; validates `quantityKg <= (demand - totalReceived)` for that fruit type.
- **createReceiveByBatch**: requires `confirmed: true`; allows partial receive (`quantityKg <= batch.quantityKg - batch.receivedKg`); validates `quantityKg <= (demand - totalReceived)` for that fruit type. Controller passes `confirmed: true`.

### preorderFulfillmentLogic.js
- **triggerReadyAndNotifyForFruitType**: notifies pre-orders with status `ALLOCATED_WAITING_PAYMENT` (was WAITING_FOR_PRODUCT).

### PreOrderStockController.js
- **createReceive** and **createReceiveByBatch**: pass `confirmed: true` to the service.

---

## 3. Frontend

### PreOrderListPage.jsx (admin)
- STATUS_LABEL and filter options updated to new statuses + legacy WAITING_FOR_PRODUCT.
- Badge colors for new statuses (purple for ALLOCATED_WAITING_PAYMENT, amber for WAITING_FOR_NEXT_BATCH, etc.).
- “Mark completed” still only for READY_FOR_FULFILLMENT (unchanged).

### MyPreOrdersPage.jsx (customer)
- STATUS_LABEL, STATUS_OPTIONS, statusStyles updated to new statuses + WAITING_FOR_PRODUCT.
- Descriptive text updated to mention “Waiting for allocation” and “Allocated, pay remaining”.
- `canPayRemaining` is driven by backend (ALLOCATED_WAITING_PAYMENT only).

---

## 4. Payment rules (unchanged)

- PreOrder is created only after deposit payment SUCCESS.
- Idempotent VNPay callback preserved.
- Remaining payment allowed only when status = ALLOCATED_WAITING_PAYMENT.
- After remaining payment SUCCESS → status READY_FOR_FULFILLMENT.

---

## 5. Backward compatibility

- **WAITING_FOR_PRODUCT** kept in enum and in demand/queue logic so existing documents still count in demand and can be allocated (then become ALLOCATED_WAITING_PAYMENT or WAITING_FOR_NEXT_BATCH).
- Admin/customer UIs show a label for WAITING_FOR_PRODUCT (e.g. “Waiting for allocation (legacy)”).
