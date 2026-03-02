/**
 * Export Service
 *
 * Builds Excel (or other) exports. Each export type can add its own sheets or files.
 * E.g. sales staff stats → multiple sheets; others can add more export types here.
 *
 * @module services/ExportService
 */

const ExcelJS = require("exceljs");
const OrderService = require("./OrderService");
const DiscountService = require("./DiscountService");
const PreOrderService = require("./PreOrderService");
const NewsService = require("./NewsService");

// ---- Format helpers ----
// Change these to adjust the look of exported Excel sheets.

/** Header row: background fill. Change fgColor.argb (ARGB hex, e.g. "FF4472C4" = blue). */
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };

/** Header row: font. Change bold, color.argb (white = "FFFFFFFF"), size. */
const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };

/** Cell border for tables. Change style to "thin" | "medium" | "thick" | "dotted" | "dashed" etc. */
const THIN_BORDER = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

/** Apply header style (fill + font + border) to a single row. Uses HEADER_FILL and HEADER_FONT above. */
function styleHeaderRow(ws, rowIndex) {
  const row = ws.getRow(rowIndex);
  row.font = HEADER_FONT;
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle" };
  row.eachCell((cell) => {
    cell.border = THIN_BORDER;
  });
}

/** Draw borders on a range of cells. startRow/endRow are 1-based; colCount = number of columns. */
function styleTableBorders(ws, startRow, endRow, colCount) {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = 1; c <= colCount; c++) {
      ws.getCell(r, c).border = THIN_BORDER;
    }
  }
}

/** Set column widths (in characters). widths = array of numbers, one per column (1-based order). */
function setColumnWidths(ws, widths) {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

/** Number format for currency. Change the symbol (e.g. "₫" or "$") or pattern (e.g. "#,##0.00"). */
function formatCurrencyCell(cell) {
  cell.numFmt = '#,##0 "₫"';
}

/** Number format for percentage (e.g. 0.6667 → 66.67%). Change decimal places with "0.00%" vs "0.0%". */
function formatPercentCell(cell) {
  cell.numFmt = "0.00%";
}

/** Number format for integers with thousands separator. Change to "#,##0.00" for decimals. */
function formatNumberCell(cell) {
  cell.numFmt = "#,##0";
}

const STATUS_LABELS = {
  PENDING: "Pending",
  PAID: "Paid",
  "READY-TO-SHIP": "Ready to ship",
  SHIPPING: "Shipping",
  COMPLETED: "Completed",
  REFUND: "Refund",
  CANCELLED: "Cancelled",
};

function getOrderStatusLabel(statusName) {
  if (!statusName) return "N/A";
  const normalized = String(statusName).trim().toUpperCase().replace(/[\s-]+/g, "-");
  return STATUS_LABELS[normalized] || statusName;
}

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Export sales staff dashboard stats to Excel buffer.
 * Multiple sheets: Order Stats, Revenue Refund, Orders List, Discount Stats/List/Usage, Pre-orders, Pre-order Stats, News.
 *
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function exportSalesStatsToExcel() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dashboard Export";
  workbook.created = new Date();

  const currentYear = new Date().getFullYear();
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  // ---- Sheet 1: Order Stats ----
  const orderCountsRes = await OrderService.getOrderStatusCounts();
  const totalOrders = orderCountsRes?.data?.totalOrders ?? 0;
  const statusCounts = orderCountsRes?.data?.statusCounts ?? [];
  const revenueRefund = await OrderService.getOrderRevenueRefundStats({ groupBy: "month", year: currentYear });

  const wsOrderStats = workbook.addWorksheet("Order Stats", { sheetView: { showGridLines: true } });
  wsOrderStats.addRow(["Metric", "Value"]);
  wsOrderStats.addRow(["Total orders", totalOrders]);
  wsOrderStats.addRow(["Needs action", (statusCounts.find((s) => /PENDING/i.test(s.status_name))?.total ?? 0) + (statusCounts.find((s) => /PAID/i.test(s.status_name))?.total ?? 0)]);
  wsOrderStats.addRow(["Completed", statusCounts.find((s) => /COMPLETED/i.test(s.status_name))?.total ?? 0]);
  wsOrderStats.addRow(["Refund", statusCounts.find((s) => /REFUND/i.test(s.status_name))?.total ?? 0]);
  wsOrderStats.addRow([]);
  wsOrderStats.addRow(["Status", "Count"]);
  statusCounts.forEach((s) => wsOrderStats.addRow([getOrderStatusLabel(s.status_name), s.total ?? 0]));
  setColumnWidths(wsOrderStats, [22, 12]);
  styleHeaderRow(wsOrderStats, 1);
  styleHeaderRow(wsOrderStats, 7);
  styleTableBorders(wsOrderStats, 1, 5, 2);
  styleTableBorders(wsOrderStats, 7, 7 + statusCounts.length, 2);
  for (let r = 2; r <= 5; r++) wsOrderStats.getCell(r, 2).numFmt = "#,##0";
  for (let r = 8; r <= 7 + statusCounts.length; r++) wsOrderStats.getCell(r, 2).numFmt = "#,##0";

  // ---- Sheet 2: Revenue Refund ----
  if (revenueRefund && (revenueRefund.revenue?.length || revenueRefund.refund?.length || revenueRefund.netRevenue?.length)) {
    const wsRev = workbook.addWorksheet("Revenue Refund", { sheetView: { showGridLines: true } });
    wsRev.addRow(["Total revenue", (revenueRefund.revenue || []).reduce((s, r) => s + (r.value || 0), 0)]);
    wsRev.addRow(["Total refund", (revenueRefund.refund || []).reduce((s, r) => s + (r.value || 0), 0)]);
    wsRev.addRow(["Net revenue", (revenueRefund.netRevenue || []).reduce((s, r) => s + (r.value || 0), 0)]);
    wsRev.addRow(["Refund rate", (revenueRefund.refundRate ?? 0) / 100]);
    wsRev.addRow([]);
    wsRev.addRow(["Period", "Revenue", "Refund", "Net"]);
    (revenueRefund.netRevenue || []).forEach((nr) => {
      const rev = (revenueRefund.revenue || []).find((r) => r.label === nr.label)?.value ?? 0;
      const ref = (revenueRefund.refund || []).find((r) => r.label === nr.label)?.value ?? 0;
      wsRev.addRow([nr.label, rev, ref, nr.value ?? 0]);
    });
    setColumnWidths(wsRev, [18, 18, 18, 18]);
    styleTableBorders(wsRev, 1, 4, 2);
    formatCurrencyCell(wsRev.getCell(1, 2));
    formatCurrencyCell(wsRev.getCell(2, 2));
    formatCurrencyCell(wsRev.getCell(3, 2));
    formatPercentCell(wsRev.getCell(4, 2));
    const headerRowRev = 6;
    styleHeaderRow(wsRev, headerRowRev);
    const dataStartRev = 7;
    const dataEndRev = 6 + (revenueRefund.netRevenue || []).length;
    styleTableBorders(wsRev, dataStartRev, dataEndRev, 4);
    for (let r = dataStartRev; r <= dataEndRev; r++) {
      formatCurrencyCell(wsRev.getCell(r, 2));
      formatCurrencyCell(wsRev.getCell(r, 3));
      formatCurrencyCell(wsRev.getCell(r, 4));
    }
  }

  // ---- Sheet 3: Orders List ----
  const ordersRes = await OrderService.getOrdersForAdmin({ page: 1, limit: 500, sortBy: "createdAt", sortOrder: "desc" });
  const orders = ordersRes?.data ?? [];
  const wsOrders = workbook.addWorksheet("Orders List", { sheetView: { showGridLines: true } });
  wsOrders.addRow(["ID", "Recipient", "Phone", "Status", "Total", "Created"]);
  orders.forEach((o) => {
    const statusName = o.order_status_id?.name;
    wsOrders.addRow([
      o._id?.toString().slice(-8) ?? "",
      o.receiver_name ?? "",
      o.receiver_phone ?? "",
      getOrderStatusLabel(statusName),
      o.total_price ?? o.totalPrice ?? 0,
      fmtDate(o.createdAt),
    ]);
  });
  setColumnWidths(wsOrders, [12, 22, 14, 16, 16, 20]);
  styleHeaderRow(wsOrders, 1);
  styleTableBorders(wsOrders, 1, 1 + orders.length, 6);
  for (let r = 2; r <= 1 + orders.length; r++) formatCurrencyCell(wsOrders.getCell(r, 5));

  // ---- Sheet 4: Discount Stats ----
  const discListRes = await DiscountService.getDiscounts({ page: 1, limit: 1000 });
  const discStats = discListRes?.statistics ?? {};
  const discountTotal = discStats.total ?? 0;
  const wsDiscStats = workbook.addWorksheet("Discount Stats", { sheetView: { showGridLines: true } });
  wsDiscStats.addRow(["Metric", "Value"]);
  wsDiscStats.addRow(["Total codes", discountTotal]);
  wsDiscStats.addRow(["Pending approval", discStats.pending ?? 0]);
  wsDiscStats.addRow(["Approved", discStats.approved ?? 0]);
  wsDiscStats.addRow(["Rejected", discStats.rejected ?? 0]);
  wsDiscStats.addRow(["Expired", discStats.expired ?? 0]);
  setColumnWidths(wsDiscStats, [22, 12]);
  styleHeaderRow(wsDiscStats, 1);
  styleTableBorders(wsDiscStats, 1, 6, 2);
  for (let r = 2; r <= 6; r++) formatNumberCell(wsDiscStats.getCell(r, 2));

  // ---- Sheet 5: Discount List ----
  const discountList = discListRes?.data ?? [];
  const wsDiscList = workbook.addWorksheet("Discount List", { sheetView: { showGridLines: true } });
  wsDiscList.addRow(["Code", "Discount %", "Status", "Expires"]);
  discountList.forEach((d) => {
    wsDiscList.addRow([
      d.code ?? "",
      d.discountPercent ?? d.discount_percent ?? 0,
      d.status ?? "",
      fmtDate(d.endDate || d.end_date),
    ]);
  });
  setColumnWidths(wsDiscList, [16, 14, 14, 20]);
  styleHeaderRow(wsDiscList, 1);
  styleTableBorders(wsDiscList, 1, 1 + discountList.length, 4);
  for (let r = 2; r <= 1 + discountList.length; r++) {
    wsDiscList.getCell(r, 2).numFmt = "0%";
  }

  // ---- Sheet 6: Discount Usage (last 30 days) ----
  const discUsageRes = await DiscountService.getDiscountStats({ startDate: startStr, endDate: endStr });
  const discountUsageStats = discUsageRes?.data ?? null;
  if (discountUsageStats) {
    const wsUsage = workbook.addWorksheet("Discount Usage", { sheetView: { showGridLines: true } });
    wsUsage.addRow(["Total discounts", discountUsageStats.summary?.totalDiscounts ?? 0]);
    wsUsage.addRow(["Total used", discountUsageStats.summary?.totalUsed ?? 0]);
    wsUsage.addRow(["Total discount amount", discountUsageStats.summary?.totalDiscountAmount ?? 0]);
    wsUsage.addRow(["AOV when code applied", discountUsageStats.summary?.averageOrderValue ?? 0]);
    wsUsage.addRow([]);
    wsUsage.addRow(["Date", "Uses", "Discount amount"]);
    (discountUsageStats.usageByDate || []).forEach((r) => {
      wsUsage.addRow([r.date, r.usageCount ?? 0, r.discountAmount ?? 0]);
    });
    setColumnWidths(wsUsage, [28, 12, 18]);
    styleTableBorders(wsUsage, 1, 4, 2);
    formatNumberCell(wsUsage.getCell(1, 2));
    formatNumberCell(wsUsage.getCell(2, 2));
    formatCurrencyCell(wsUsage.getCell(3, 2));
    formatCurrencyCell(wsUsage.getCell(4, 2));
    styleHeaderRow(wsUsage, 6);
    const usageDataEnd = 6 + (discountUsageStats.usageByDate || []).length;
    styleTableBorders(wsUsage, 7, usageDataEnd, 3);
    for (let r = 7; r <= usageDataEnd; r++) {
      formatNumberCell(wsUsage.getCell(r, 2));
      formatCurrencyCell(wsUsage.getCell(r, 3));
    }
    if ((discountUsageStats.topDiscounts || []).length > 0) {
      const wsTop = workbook.addWorksheet("Top Discount Codes", { sheetView: { showGridLines: true } });
      wsTop.addRow(["#", "Code", "Description", "Type", "Uses", "Total discount", "AOV", "Status", "Expires"]);
      discountUsageStats.topDiscounts.forEach((d, i) => {
        wsTop.addRow([
          i + 1,
          d.code ?? "",
          d.name ?? "",
          d.type === "percentage" ? "%" : "Fixed",
          d.usageCount ?? 0,
          d.totalDiscountAmount ?? 0,
          d.averageOrderValue ?? 0,
          d.status ?? "",
          fmtDate(d.expiredAt),
        ]);
      });
      setColumnWidths(wsTop, [6, 14, 24, 8, 8, 16, 14, 10, 20]);
      styleHeaderRow(wsTop, 1);
      const topCount = discountUsageStats.topDiscounts.length;
      styleTableBorders(wsTop, 1, 1 + topCount, 9);
      for (let r = 2; r <= 1 + topCount; r++) {
        formatNumberCell(wsTop.getCell(r, 5));
        formatCurrencyCell(wsTop.getCell(r, 6));
        formatCurrencyCell(wsTop.getCell(r, 7));
      }
    }
  }

  // ---- Sheet: Pre-orders List ----
  const preOrderListRes = await PreOrderService.getAdminPreOrderList({ page: 1, limit: 500, sortBy: "createdAt", sortOrder: "desc" });
  const preOrderList = preOrderListRes?.data ?? [];
  const wsPreOrders = workbook.addWorksheet("Pre-orders List", { sheetView: { showGridLines: true } });
  wsPreOrders.addRow(["ID", "Status", "Total", "Created"]);
  preOrderList.forEach((po) => {
    wsPreOrders.addRow([
      po._id?.toString().slice(-8) ?? "",
      po.status ?? "",
      po.totalAmount ?? po.total_amount ?? 0,
      fmtDate(po.createdAt || po.created_at),
    ]);
  });
  setColumnWidths(wsPreOrders, [12, 28, 16, 20]);
  styleHeaderRow(wsPreOrders, 1);
  styleTableBorders(wsPreOrders, 1, 1 + preOrderList.length, 4);
  for (let r = 2; r <= 1 + preOrderList.length; r++) formatCurrencyCell(wsPreOrders.getCell(r, 3));

  // ---- Sheet: Pre-order Stats (last 30 days) ----
  const preOrderStats = await PreOrderService.getPreOrderStats({
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });
  const sum = preOrderStats?.summary ?? {};
  const wsPreStats = workbook.addWorksheet("Pre-order Stats", { sheetView: { showGridLines: true } });
  wsPreStats.addRow(["Metric", "Value"]);
  wsPreStats.addRow(["Total pre-orders", sum.total ?? 0]);
  wsPreStats.addRow(["Total revenue", sum.totalRevenue ?? 0]);
  wsPreStats.addRow(["Total deposit", sum.totalDepositCollected ?? 0]);
  wsPreStats.addRow(["Total remainder", sum.totalRemainingCollected ?? 0]);
  wsPreStats.addRow(["Cancellation rate", (sum.cancellationRate ?? 0) / 100]);
  wsPreStats.addRow(["Total kg", sum.totalQuantityKg ?? 0]);
  wsPreStats.addRow(["Pending payment count", preOrderStats.pendingPayment?.count ?? 0]);
  wsPreStats.addRow(["Pending payment amount", preOrderStats.pendingPayment?.totalAmount ?? 0]);
  wsPreStats.addRow([]);
  wsPreStats.addRow(["Date", "Count", "Revenue"]);
  (preOrderStats.byDate || []).forEach((r) => wsPreStats.addRow([r.date, r.count ?? 0, r.revenue ?? 0]));
  wsPreStats.addRow([]);
  wsPreStats.addRow(["Fruit type", "Orders", "Total kg", "Total revenue"]);
  (preOrderStats.byFruitType || []).forEach((r) => {
    wsPreStats.addRow([r.fruitTypeName ?? "", r.count ?? 0, r.totalQuantityKg ?? 0, r.totalRevenue ?? 0]);
  });
  setColumnWidths(wsPreStats, [28, 14, 12, 18]);
  styleHeaderRow(wsPreStats, 1);
  styleTableBorders(wsPreStats, 1, 8, 2);
  formatNumberCell(wsPreStats.getCell(1, 2));
  formatCurrencyCell(wsPreStats.getCell(2, 2));
  formatCurrencyCell(wsPreStats.getCell(3, 2));
  formatCurrencyCell(wsPreStats.getCell(4, 2));
  formatPercentCell(wsPreStats.getCell(5, 2));
  formatNumberCell(wsPreStats.getCell(6, 2));
  formatNumberCell(wsPreStats.getCell(7, 2));
  formatCurrencyCell(wsPreStats.getCell(8, 2));
  const byDateHeaderRow = 10;
  styleHeaderRow(wsPreStats, byDateHeaderRow);
  const byDateEnd = byDateHeaderRow + (preOrderStats.byDate || []).length;
  styleTableBorders(wsPreStats, byDateHeaderRow, byDateEnd, 3);
  for (let r = byDateHeaderRow + 1; r <= byDateEnd; r++) {
    formatNumberCell(wsPreStats.getCell(r, 2));
    formatCurrencyCell(wsPreStats.getCell(r, 3));
  }
  const byFruitHeaderRow = byDateEnd + 2;
  styleHeaderRow(wsPreStats, byFruitHeaderRow);
  const byFruitEnd = byFruitHeaderRow + (preOrderStats.byFruitType || []).length;
  styleTableBorders(wsPreStats, byFruitHeaderRow, byFruitEnd, 4);
  for (let r = byFruitHeaderRow + 1; r <= byFruitEnd; r++) {
    formatNumberCell(wsPreStats.getCell(r, 2));
    formatNumberCell(wsPreStats.getCell(r, 3));
    formatCurrencyCell(wsPreStats.getCell(r, 4));
  }

  // ---- Sheet: News List ----
  const newsRes = await NewsService.getNews({ page: 1, limit: 500 });
  const newsList = newsRes?.data ?? [];
  const wsNews = workbook.addWorksheet("News List", { sheetView: { showGridLines: true } });
  wsNews.addRow(["Title", "Status", "Created"]);
  newsList.forEach((n) => {
    wsNews.addRow([n.title ?? "", n.status ?? "", fmtDate(n.createdAt || n.created_at)]);
  });
  setColumnWidths(wsNews, [40, 12, 20]);
  styleHeaderRow(wsNews, 1);
  styleTableBorders(wsNews, 1, 1 + newsList.length, 3);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = {
  exportSalesStatsToExcel,
};
