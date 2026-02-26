const ChatService = require("../services/ChatService");
const { staffOnline, staffOffline, getOnlineStaffs } = require("./staffPool");
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
      staffOnline(staffId, socket.id, { userName, avatar });
      console.log("🟢 Staff online:", {
        staffId,
        userName,
        avatar,
      });
      io.emit("online_staffs", getOnlineStaffs());
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
      const isStaff = staffOffline(socket.id);

      if (isStaff) {
        io.emit("online_staffs", getOnlineStaffs());
      }
    });
  });
};
