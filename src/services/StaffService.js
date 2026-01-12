/**
 * author: KhoaNDCE170420
 */

const UserModel = require("../models/UserModel");
const RoleModel = require("../models/RolesModel");

const ALLOWED_ROLES = ["sales-staff", "finance-staff", "inventory-staff"];

// Helper function to normalize status input
function normalizeStatus(input) {
    if (input === true || input === "true" || input === "active") return true;
    if (input === false || input === "false" || input === "inactive") return false;
    return null;
}

const StaffService = {

    /**
     * Update active/inactive status of a staff account.
     *
     * - Only applies to users with staff roles in ALLOWED_ROLES variable.
     * - Normalizes different status inputs (true/false, "active"/"inactive").
     * - Rejects invalid staff ID or non-staff accounts.
     *
     * @param {String} staffId - MongoDB ObjectId of the staff user
     * @param {Boolean|String} status - New status value (true/false, "active", "inactive")
     * @returns {Promise<Object>} Result object with status and message
     */
    async updateStaffStatus(staffId, status) {
        try {
            const normalized = normalizeStatus(status);
            if (!staffId || normalized === null) {
                return { status: "ERR", message: "Staff ID and valid status are required" };
            }
            const staff = await UserModel.findById(staffId);
            if (!staff) {
                return { status: "ERR", message: "Staff not found" };
            }
            const roleDoc = await RoleModel.findById(staff.role_id);
            if (!roleDoc || !ALLOWED_ROLES.includes(roleDoc.name)) {
                return { status: "ERR", message: "Not a staff account" };
            }
            staff.status = normalized;
            await staff.save();
            return { status: "OK", message: "Staff status updated successfully" };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Create a new staff account.
     *
     * - Validates required staff information.
     * - Only allows roles defined in ALLOWED_ROLES variable.
     * - Ensures email uniqueness.
     * - Hashes password before saving.
     * - Automatically sets staff status to active.
     *
     * @param {Object} data - Staff creation data
     * @param {String} data.user_name - Staff display name
     * @param {String} data.email - Staff email (used for login)
     * @param {String} data.password - Plain text password
     * @param {String} data.phone - Staff phone number
     * @param {String} data.address - Staff address
     * @param {String} data.role - Staff role name
     * @returns {Promise<Object>} Result object with status and message
     */
    async createStaff(data) {
        try {
            const { user_name, email, password, phone, address, role } = data;
            if (!user_name || !email || !password || !phone || !address) {
                return { status: "ERR", message: "Missing required fields" };
            }
            if (!ALLOWED_ROLES.includes(role)) {
                return { status: "ERR", message: `Role must be one of: ${ALLOWED_ROLES.join(", ")}` };
            }
            const existingUser = await UserModel.findOne({ email });
            if (existingUser) {
                return { status: "ERR", message: "Email already registered!" };
            }
            const existingUserName = await UserModel.findOne({ user_name });
            if (existingUserName) {
                return { status: "ERR", message: "Username already taken!" };
            }
            const staffRole = await RoleModel.findOne({ name: role });
            if (!staffRole) {
                return { status: "ERR", message: "Role not found" };
            }
            const bcrypt = require("bcrypt");
            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = new UserModel({
                user_name,
                email,
                password: hashedPassword,
                phone,
                address,
                role_id: staffRole._id,
                status: true,
                avatar: data.avatar || ""
            });
            await newUser.save();
            return { status: "OK", message: "Staff account created successfully" };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },
    /**
     * Update staff account information.
     *
     * - Only applies to users with staff roles in ALLOWED_ROLES variable.
     * - Allows updating user_name, password, phone, address, role, and avatar (email cannot be updated as it is the primary key).
     * - Validates and hashes password if provided.
     * - Ensures uniqueness for user_name if changed.
     * - Validates role if provided and updates role_id accordingly.
     * - Rejects invalid staff ID or non-staff accounts.
     *
     * @param {String} staffId - MongoDB ObjectId of the staff user
     * @param {Object} data - Staff update data
     * @param {String} [data.user_name] - New staff display name
     * @param {String} [data.password] - New plain text password
     * @param {String} [data.phone] - New staff phone number
     * @param {String} [data.address] - New staff address
     * @param {String} [data.role] - New staff role name
     * @param {String} [data.avatar] - New staff avatar URL
     * @returns {Promise<Object>} Result object with status and message
     */
    async updateStaff(staffId, data) {
        try {
            if (!staffId) {
                return { status: "ERR", message: "Staff ID is required" };
            }
            const staff = await UserModel.findById(staffId);
            if (!staff) {
                return { status: "ERR", message: "Staff not found" };
            }
            const roleDoc = await RoleModel.findById(staff.role_id);
            if (!roleDoc || !ALLOWED_ROLES.includes(roleDoc.name)) {
                return { status: "ERR", message: "Not a staff account" };
            }

            const { user_name, password, phone, address, role, avatar } = data;

            // Update user_name if provided and check uniqueness
            if (user_name && user_name !== staff.user_name) {
                const existingUserName = await UserModel.findOne({ user_name });
                if (existingUserName) {
                    return { status: "ERR", message: "Username already taken!" };
                }
                staff.user_name = user_name;
            }

            // Update password if provided
            if (password) {
                const bcrypt = require("bcrypt");
                const hashedPassword = await bcrypt.hash(password, 10);
                staff.password = hashedPassword;
            }

            // Update phone if provided
            if (phone) {
                staff.phone = phone;
            }

            // Update address if provided
            if (address) {
                staff.address = address;
            }

            // Update role if provided
            if (role) {
                if (!ALLOWED_ROLES.includes(role)) {
                    return { status: "ERR", message: `Role must be one of: ${ALLOWED_ROLES.join(", ")}` };
                }
                const staffRole = await RoleModel.findOne({ name: role });
                if (!staffRole) {
                    return { status: "ERR", message: "Role not found" };
                }
                staff.role_id = staffRole._id;
            }

            // Update avatar if provided
            if (avatar !== undefined) {
                staff.avatar = avatar;
            }

            await staff.save();
            return { status: "OK", message: "Staff account updated successfully" };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
   * Retrieve a paginated list of staff accounts.
   *
   * - Only returns users with staff roles defined in ALLOWED_ROLES.
   * - Supports filtering by staff status (active / inactive).
   * - Supports sorting by name or creation date.
   * - Applies pagination to the result set.
   *
   * @param {Object} query - Query parameters for filtering and pagination
   * @param {Number} [query.page=1] - Current page number
   * @param {Number} [query.limit=10] - Number of records per page
   * @param {Boolean|String} [query.status] - Filter by staff status
   * @param {String} [query.sortBy] - Sorting field (name, createdAt)
   * @param {String} [query.sortOrder=desc] - Sorting order (asc or desc)
   * @returns {Promise<Object>} Staff list with pagination information
    */
    async getStaffs(query = {}) {
        const { page = 1, limit = 10 } = query;
        const roles = await RoleModel.find({ name: { $in: ALLOWED_ROLES } });
        const roleIds = roles.map(role => role._id);

        const filter = { role_id: { $in: roleIds } };
        if (query.status !== undefined) {
            const normalized = normalizeStatus(query.status);
            if (normalized !== null) filter.status = normalized;
        }

        // Sorting options
        const sortBy = (query.sortBy ?? "").toString().trim().toLowerCase();
        const sortOrder = (query.sortOrder ?? "desc").toString().trim().toLowerCase();
        let sortOption = { createdAt: -1 }; // default newest first
        if (sortBy === "name" || sortBy === "username" || sortBy === "user_name") {
            sortOption = { user_name: sortOrder === "asc" ? 1 : -1 };
        } else if (sortBy === "createdat" || sortBy === "created" || sortBy === "createdat" || sortBy === "created_at") {
            sortOption = { createdAt: sortOrder === "asc" ? 1 : -1 };
        } else {
            sortOption = { createdAt: -1 };
        }

        const users = await UserModel.find(filter)
            .populate('role_id', 'name')
            .collation({ locale: 'en', strength: 2 })
            .sort(sortOption)
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .lean();
        const total = await UserModel.countDocuments(filter);

        const data = users.map(u => ({
            ...u,
            role_name: u.role_id?.name,
            role_id: u.role_id?._id || u.role_id,
        }));

        return { status: "OK", data, pagination: { page: Number(page), limit: Number(limit), total } };
    },

    /**
     * Retrieve detailed information of a staff account by ID.
     *
     * - Only returns data if the user belongs to a valid staff role.
     * - Populates and exposes the staff role name.
     *
     * @param {String} id - Staff user ID (MongoDB ObjectId)
     * @returns {Promise<Object|null>} Staff details or null if not found or not a staff account
     */
    async getStaffDetails(id) {
        const roles = await RoleModel.find({ name: { $in: ALLOWED_ROLES } });
        const roleIds = roles.map(role => role._id);
        const user = await UserModel.findOne({ _id: id, role_id: { $in: roleIds } })
            .populate('role_id', 'name')
            .lean();
        if (!user) return null;
        return {
            ...user,
            role_name: user.role_id?.name,
            role_id: user.role_id?._id || user.role_id,
        };
    },

    /**
     * Search staff accounts by keyword.
     *
     * - Only searches users with staff roles defined in ALLOWED_ROLES.
     * - Supports searching by username, email, or phone number.
     * - Can be combined with status filtering.
     * - Supports sorting and pagination.
     *
     * @param {String} keyword - Search keyword
     * @param {Object} query - Additional query parameters
     * @param {Number} [query.page=1] - Current page number
     * @param {Number} [query.limit=10] - Number of records per page
     * @param {Boolean|String} [query.status] - Staff status filter
     * @param {String} [query.sortBy] - Sort field (name, createdAt)
     * @param {String} [query.sortOrder=desc] - Sort order (asc or desc)
     * @returns {Promise<Object>} Matching staff list with pagination info
     */
    async searchStaffs(keyword, query = {}) {
        const { page = 1, limit = 10 } = query;
        const roles = await RoleModel.find({ name: { $in: ALLOWED_ROLES } });
        const roleIds = roles.map(role => role._id);

        // Sorting
        const sortBy = (query.sortBy ?? "").toString().trim().toLowerCase();
        const sortOrder = (query.sortOrder ?? "desc").toString().trim().toLowerCase();
        let sortOption = { createdAt: -1 };
        if (sortBy === "name" || sortBy === "username" || sortBy === "user_name") {
            sortOption = { user_name: sortOrder === "asc" ? 1 : -1 };
        } else if (sortBy === "createdat" || sortBy === "created" || sortBy === "created_at" || sortBy === "createdat") {
            sortOption = { createdAt: sortOrder === "asc" ? 1 : -1 };
        }

        const criteria = {
            role_id: { $in: roleIds },
            $or: [
                { user_name: { $regex: keyword, $options: 'i' } },
                { email: { $regex: keyword, $options: 'i' } },
                { phone: { $regex: keyword, $options: 'i' } }
            ]
        };
        if (query.status !== undefined) {
            const normalized = normalizeStatus(query.status);
            if (normalized !== null) criteria.status = normalized;
        }

        const users = await UserModel.find(criteria)
            .populate('role_id', 'name')
            .collation({ locale: 'en', strength: 2 })
            .sort(sortOption)
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .lean();
        const total = await UserModel.countDocuments(criteria);

        const data = users.map(u => ({
            ...u,
            role_name: u.role_id?.name,
            role_id: u.role_id?._id || u.role_id,
        }));

        return { status: "OK", data, pagination: { page: Number(page), limit: Number(limit), total } };
    },

    /**
     * Filter staff accounts based on specific criteria.
     *
     * - Only applies to users with staff roles.
     * - Supports filtering by role and active status.
     * - Supports sorting and pagination.
     *
     * @param {Object} filters - Filter criteria
     * @param {String} [filters.role] - Staff role name
     * @param {Boolean|String} [filters.status] - Staff status
     * @param {Number} [filters.page=1] - Current page number
     * @param {Number} [filters.limit=10] - Number of records per page
     * @param {String} [filters.sortBy] - Sort field (name, createdAt)
     * @param {String} [filters.sortOrder=desc] - Sort order (asc or desc)
     * @returns {Promise<Object>} Filtered staff list with pagination info
     */
    async filterStaffs(filters = {}) {
        const { page = 1, limit = 10 } = filters;
        let roles = await RoleModel.find({ name: { $in: ALLOWED_ROLES } });
        let roleIds = roles.map(role => role._id);
        if (filters.role && ALLOWED_ROLES.includes(filters.role)) {
            const roleDoc = await RoleModel.findOne({ name: filters.role });
            if (roleDoc) roleIds = [roleDoc._id];
        }
        const criteria = { role_id: { $in: roleIds } };
        if (filters.status !== undefined) {
            const normalized = normalizeStatus(filters.status);
            if (normalized !== null) criteria.status = normalized;
        }

        // Sorting
        const sortBy = (filters.sortBy ?? "").toString().trim().toLowerCase();
        const sortOrder = (filters.sortOrder ?? "desc").toString().trim().toLowerCase();
        let sortOption = { createdAt: -1 };
        if (sortBy === "name" || sortBy === "username" || sortBy === "user_name") {
            sortOption = { user_name: sortOrder === "asc" ? 1 : -1 };
        } else if (sortBy === "createdat" || sortBy === "created" || sortBy === "created_at" || sortBy === "createdat") {
            sortOption = { createdAt: sortOrder === "asc" ? 1 : -1 };
        }

        const users = await UserModel.find(criteria)
            .populate('role_id', 'name')
            .collation({ locale: 'en', strength: 2 })
            .sort(sortOption)
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .lean();
        const total = await UserModel.countDocuments(criteria);

        const data = users.map(u => ({
            ...u,
            role_name: u.role_id?.name,
            role_id: u.role_id?._id || u.role_id,
        }));

        return { status: "OK", data, pagination: { page: Number(page), limit: Number(limit), total } };
    }
};

module.exports = StaffService;
