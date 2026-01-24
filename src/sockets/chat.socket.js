const ChatService = require("../services/ChatService");
const {
  staffOnline,
  staffOffline,
} = require("./staffPool");
/**
 * staffId => {
 *   socketId,
 *   activeRooms
 * }
 */
module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);


    /* ======================
       STAFF ONLINE
    ====================== */
    socket.on("staff_online", (staffId) => {
      staffOnline(staffId, socket.id);
      console.log("🟢 Staff online:", staffId);
    });
    /* ======================
       JOIN ROOM
    ====================== */
    socket.on("join_room", (roomId) => {
      socket.join(roomId);
    });

    /* ======================
       SEND MESSAGE
    ====================== */
    socket.on("send_message", async (data) => {
      try {
        const { roomId, senderId, senderRole, content } = data;

        const message = await ChatService.sendMessage({
          roomId,
          senderId,
          senderRole,
          content,
        });

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
      staffOffline(socket.id);
      console.log("🔴 Socket disconnected:", socket.id);
    });
  });
};

