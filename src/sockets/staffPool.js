/**
 * staffId => {
 *   socketId,
 *   activeRooms
 * }
 */
const onlineStaffs = new Map();

const staffOnline = (staffId, socketId) => {
  onlineStaffs.set(staffId, {
    socketId,
    activeRooms: onlineStaffs.get(staffId)?.activeRooms || 0,
  });
};

const staffOffline = (socketId) => {
  for (const [staffId, info] of onlineStaffs) {
    if (info.socketId === socketId) {
      onlineStaffs.delete(staffId);
      return staffId;
    }
  }
};

const pickAvailableStaff = () => {
  let selected = null;
  let minRooms = Infinity;

  for (const [staffId, info] of onlineStaffs) {
    if (info.activeRooms < minRooms) {
      minRooms = info.activeRooms;
      selected = staffId;
    }
  }

  if (selected) {
    onlineStaffs.get(selected).activeRooms += 1;
  }

  return selected;
};


module.exports = {
  staffOnline,
  staffOffline,
  pickAvailableStaff,
};
