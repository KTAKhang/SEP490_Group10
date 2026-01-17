/**
 * author: KhoaNDCE170420
 * Customer Service - business logic for customer management
 */
const UserModel = require("../models/UserModel");
const RoleModel = require("../models/RolesModel");
const EmailService = require("../services/CustomerEmailService");

const CUSTOMER_ROLE = "customer";

// Helper function to normalize status input
function normalizeStatus(input) {
    if (input === true || input === "true" || input === "active") return true;
    if (input === false || input === "false" || input === "inactive") return false;
    return null;
}

const CustomerService = {
    /**
     * get customer list with pagination and filters
     *
     * @param {Object} query - Query parameters
     * @param {Number} [query.page=1] - Current page number
     * @param {Number} [query.limit=10] - Number of records per page
     * @param {Boolean|String} [query.status] - Filter by status
     * @param {String} [query.sortBy] - Sort field (name, createdAt)
     * @param {String} [query.sortOrder=desc] - Sort order (asc or desc)
     * @returns {Promise<Object>} List of customers with pagination info
     */
    async getCustomers(query = {}) {
        try {
            const { page = 1, limit = 10 } = query;
            
            // Find customer role
            const customerRole = await RoleModel.findOne({ name: CUSTOMER_ROLE });
            if (!customerRole) {
                return { status: "ERR", message: "Customer role not found" };
            }

            // Create filter
            const filter = { role_id: customerRole._id };
            if (query.status !== undefined) {
                const normalized = normalizeStatus(query.status);
                if (normalized !== null) filter.status = normalized;
            }

            // Handle sorting
            const sortBy = (query.sortBy ?? "").toString().trim().toLowerCase();
            const sortOrder = (query.sortOrder ?? "desc").toString().trim().toLowerCase();
            let sortOption = { createdAt: -1 }; // Mặc định sắp xếp theo ngày tạo mới nhất

            if (sortBy === "name" || sortBy === "username" || sortBy === "user_name") {
                sortOption = { user_name: sortOrder === "asc" ? 1 : -1 };
            } else if (sortBy === "email") {
                sortOption = { email: sortOrder === "asc" ? 1 : -1 };
            } else if (sortBy === "createdat" || sortBy === "created" || sortBy === "created_at") {
                sortOption = { createdAt: sortOrder === "asc" ? 1 : -1 };
            }

            // get customers list
            const customers = await UserModel.find(filter)
                .populate('role_id', 'name')
                .collation({ locale: 'en', strength: 2 })
                .sort(sortOption)
                .skip((page - 1) * limit)
                .limit(Number(limit))
                .select('-password -refreshToken -resetPasswordOTP -resetPasswordExpires')
                .lean();

            const total = await UserModel.countDocuments(filter);

            const data = customers.map(customer => ({
                ...customer,
                role_name: customer.role_id?.name,
                role_id: customer.role_id?._id || customer.role_id,
            }));

            return {
                status: "OK",
                data,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Get detailed information of a customer
     *
     * @param {String} customerId - Customer ID
     * @returns {Promise<Object>} Detailed customer information
     */
    async getCustomerDetails(customerId) {
        try {
            if (!customerId) {
                return { status: "ERR", message: "Customer ID is required" };
            }

            const customerRole = await RoleModel.findOne({ name: CUSTOMER_ROLE });
            if (!customerRole) {
                return { status: "ERR", message: "Customer role not found" };
            }

            const customer = await UserModel.findOne({
                _id: customerId,
                role_id: customerRole._id
            })
                .populate('role_id', 'name')
                .select('-password -refreshToken -resetPasswordOTP -resetPasswordExpires')
                .lean();

            if (!customer) {
                return { status: "ERR", message: "Customer not found" };
            }

            return {
                status: "OK",
                data: {
                    ...customer,
                    role_name: customer.role_id?.name,
                    role_id: customer.role_id?._id || customer.role_id,
                }
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Update customer's active/inactive status
     * Send notification email when the account is suspended or reactivated
     *
     * @param {String} customerId - Customer ID
     * @param {Boolean|String} status - New status (true/false, "active"/"inactive")
     * @returns {Promise<Object>} Update result
     */
    async updateCustomerStatus(customerId, status) {
        try {
            const normalized = normalizeStatus(status);
            if (!customerId || normalized === null) {
                return { status: "ERR", message: "Customer ID and valid status are required" };
            }

            const customer = await UserModel.findById(customerId);
            if (!customer) {
                return { status: "ERR", message: "Customer not found" };
            }

            const roleDoc = await RoleModel.findById(customer.role_id);
            if (!roleDoc || roleDoc.name !== CUSTOMER_ROLE) {
                return { status: "ERR", message: "Not a customer account" };
            }

            // Save old status for comparison
            const oldStatus = customer.status;
            customer.status = normalized;
            await customer.save();

            // Send notification email if status changed
            let emailResult = null;
            if (oldStatus !== normalized) {
                if (normalized === false) {
                    // Account suspended - send warning email
                    emailResult = await EmailService.sendAccountSuspensionEmail(
                        customer.email,
                        customer.user_name
                    );
                } else {
                    // Account reactivated - send notification email
                    emailResult = await EmailService.sendAccountReactivationEmail(
                        customer.email,
                        customer.user_name
                    );
                }
            }

            return {
                status: "OK",
                message: "Customer status updated successfully",
                data: {
                    _id: customer._id,
                    user_name: customer.user_name,
                    email: customer.email,
                    status: customer.status
                },
                emailSent: emailResult ? emailResult.status === "OK" : false,
                emailMessage: emailResult ? emailResult.message : "No status change, email not sent"
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Search customers by keyword
     *
     * @param {String} keyword - Search keyword
     * @param {Object} query - Additional query parameters
     * @param {Number} [query.page=1] - Page number
     * @param {Number} [query.limit=10] - Number of records per page
     * @param {Boolean|String} [query.status] - Filter by status
     * @param {String} [query.sortBy] - Sort field
     * @param {String} [query.sortOrder=desc] - Sort order
     * @returns {Promise<Object>} List of matching customers
     */
    async searchCustomers(keyword, query = {}) {
        try {
            if (!keyword || keyword.trim() === "") {
                return { status: "ERR", message: "Search keyword is required" };
            }

            const { page = 1, limit = 10 } = query;

            const customerRole = await RoleModel.findOne({ name: CUSTOMER_ROLE });
            if (!customerRole) {
                return { status: "ERR", message: "Customer role not found" };
            }

            // Xử lý sorting
            const sortBy = (query.sortBy ?? "").toString().trim().toLowerCase();
            const sortOrder = (query.sortOrder ?? "desc").toString().trim().toLowerCase();
            let sortOption = { createdAt: -1 };

            if (sortBy === "name" || sortBy === "username" || sortBy === "user_name") {
                sortOption = { user_name: sortOrder === "asc" ? 1 : -1 };
            } else if (sortBy === "email") {
                sortOption = { email: sortOrder === "asc" ? 1 : -1 };
            } else if (sortBy === "createdat" || sortBy === "created" || sortBy === "created_at") {
                sortOption = { createdAt: sortOrder === "asc" ? 1 : -1 };
            }

            // Tạo criteria tìm kiếm
            const criteria = {
                role_id: customerRole._id,
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

            const customers = await UserModel.find(criteria)
                .populate('role_id', 'name')
                .collation({ locale: 'en', strength: 2 })
                .sort(sortOption)
                .skip((page - 1) * limit)
                .limit(Number(limit))
                .select('-password -refreshToken -resetPasswordOTP -resetPasswordExpires')
                .lean();

            const total = await UserModel.countDocuments(criteria);

            const data = customers.map(customer => ({
                ...customer,
                role_name: customer.role_id?.name,
                role_id: customer.role_id?._id || customer.role_id,
            }));

            return {
                status: "OK",
                data,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    },

    /**
     * Filter customers by specific criteria
     *
     * @param {Object} filters - Filter criteria
     * @param {Boolean|String} [filters.status] - Customer status
     * @param {Boolean|String} [filters.isGoogleAccount] - Whether Google account or not
     * @param {Number} [filters.page=1] - Page number
     * @param {Number} [filters.limit=10] - Number of records per page
     * @param {String} [filters.sortBy] - Sort field
     * @param {String} [filters.sortOrder=desc] - Sort order
     * @returns {Promise<Object>} List of filtered customers
     */
    async filterCustomers(filters = {}) {
        try {
            const { page = 1, limit = 10 } = filters;

            const customerRole = await RoleModel.findOne({ name: CUSTOMER_ROLE });
            if (!customerRole) {
                return { status: "ERR", message: "Customer role not found" };
            }

            const criteria = { role_id: customerRole._id };

            // status filter
            if (filters.status !== undefined) {
                const normalized = normalizeStatus(filters.status);
                if (normalized !== null) criteria.status = normalized;
            }

            // Filter by Google account type
            if (filters.isGoogleAccount !== undefined) {
                const isGoogle = filters.isGoogleAccount === true || 
                                filters.isGoogleAccount === "true";
                criteria.isGoogleAccount = isGoogle;
            }

            // Handle sorting
            const sortBy = (filters.sortBy ?? "").toString().trim().toLowerCase();
            const sortOrder = (filters.sortOrder ?? "desc").toString().trim().toLowerCase();
            let sortOption = { createdAt: -1 };

            if (sortBy === "name" || sortBy === "username" || sortBy === "user_name") {
                sortOption = { user_name: sortOrder === "asc" ? 1 : -1 };
            } else if (sortBy === "email") {
                sortOption = { email: sortOrder === "asc" ? 1 : -1 };
            } else if (sortBy === "createdat" || sortBy === "created" || sortBy === "created_at") {
                sortOption = { createdAt: sortOrder === "asc" ? 1 : -1 };
            }

            const customers = await UserModel.find(criteria)
                .populate('role_id', 'name')
                .collation({ locale: 'en', strength: 2 })
                .sort(sortOption)
                .skip((page - 1) * limit)
                .limit(Number(limit))
                .select('-password -refreshToken -resetPasswordOTP -resetPasswordExpires')
                .lean();

            const total = await UserModel.countDocuments(criteria);

            const data = customers.map(customer => ({
                ...customer,
                role_name: customer.role_id?.name,
                role_id: customer.role_id?._id || customer.role_id,
            }));

            return {
                status: "OK",
                data,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            return { status: "ERR", message: error.message };
        }
    }
};

module.exports = CustomerService; 