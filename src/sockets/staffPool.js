const onlineStaffs = new Map();

const staffOnline = (staffId, socketId, meta = {}) => {
  if (!onlineStaffs.has(staffId)) {
    onlineStaffs.set(staffId, {
      sockets: new Set(),
      userName: meta.userName,
      avatar: meta.avatar,
    });
  }

  const staff = onlineStaffs.get(staffId);

  // ⚠️ fallback nếu data cũ chưa có sockets
  if (!staff.sockets) {
    staff.sockets = new Set();
  }

  staff.sockets.add(socketId);
};

const staffOffline = (socketId) => {
  let removed = false;

  for (const [staffId, info] of onlineStaffs.entries()) {
    // 🔒 GUARD QUAN TRỌNG
    if (!info.sockets) continue;

    if (info.sockets.has(socketId)) {
      info.sockets.delete(socketId);

      // chỉ remove staff khi không còn socket nào
      if (info.sockets.size === 0) {
        onlineStaffs.delete(staffId);
        removed = true;
      }
      break;
    }
  }

  return removed;
};

const getOnlineStaffs = () =>
  Array.from(onlineStaffs.entries()).map(([staffId, info]) => ({
    staffId,
    userName: info.userName,
    avatar: info.avatar,
  }));

const pickAvailableStaff = () => {
  let selected = null;
  let minRooms = Infinity;

  for (const [staffId, info] of onlineStaffs.entries()) {
    if (info.activeRooms < minRooms) {
      minRooms = info.activeRooms;
      selected = staffId;
    }
  }

  if (selected) onlineStaffs.get(selected).activeRooms += 1;
  return selected;
};

module.exports = {
  staffOnline,
  staffOffline,
  pickAvailableStaff,
  getOnlineStaffs,
};
