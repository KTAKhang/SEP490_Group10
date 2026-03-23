const ChatService = require("../services/ChatService");
const { staffOnline, staffOfflineByStaffId, getOnlineStaffs } = require("./staffPool");
/**
 * staffId => {
 *   socketId,
 *   activeRooms
 * }
 */
module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);
    socket.on("get_online_staffs", () => {
      socket.emit("online_staffs", getOnlineStaffs());
    });

    /* ======================
       STAFF ONLINE
    ====================== */
    socket.on("staff_online", (staffId, userName, avatar) => {
      socket.staffId = staffId; // 🔥 QUAN TRỌNG

      staffOnline(staffId, socket.id, { userName, avatar });

      io.emit("online_staffs", getOnlineStaffs());
    });

    socket.on("staff_offline", () => {
  if (!socket.staffId) return;

  const isRemoved = staffOfflineByStaffId(socket.staffId, socket.id);

  if (isRemoved) {
    io.emit("online_staffs", getOnlineStaffs());
  }

  console.log("🔴 staff_offline:", socket.id);
});

    /* ======================
       JOIN ROOM
    ====================== */
    socket.on("join_room", (roomId) => {
      socket.join(roomId);
    });

    /* ======================
       LEAVE ROOM
    ====================== */
    socket.on("leave_room", (roomId) => {
      socket.leave(roomId);
      console.log(`🚪 Socket ${socket.id} left room ${roomId}`);
    });

    /* ======================
       SEND MESSAGE
    ====================== */
    socket.on("send_message", ({ roomId, message }) => {
      try {
        if (!roomId) return;

        io.to(roomId).emit("receive_message", message);
        io.emit("room_updated", {
          _id: message.room._id,
          user: message.room.user,
          staff: message.room.staff,
          lastMessage: message.content,
          updatedAt: message.createdAt,
          unreadByStaff: message.room.unreadByStaff,
        });
      } catch (err) {
        console.error("❌ send_message error:", err.message);
      }
    });

    /* ======================
       DISCONNECT
    ====================== */
    socket.on("disconnect", () => {
      if (!socket.staffId) return;

      const isStaff = staffOfflineByStaffId(socket.staffId, socket.id);

      if (isStaff) {
        io.emit("online_staffs", getOnlineStaffs());
      }
    });
  });
};
