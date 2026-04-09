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

const staffOfflineByStaffId = (staffId, socketId) => {
  const staff = onlineStaffs.get(staffId);
  if (!staff) return false;

  staff.sockets.delete(socketId);

  if (staff.sockets.size === 0) {
    onlineStaffs.delete(staffId);
    return true;
  }

  return false;
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
  staffOfflineByStaffId,
  pickAvailableStaff,
  getOnlineStaffs,
};
