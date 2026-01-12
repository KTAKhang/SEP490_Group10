/**
 * author: KhoaNDCE170420
 */
const StaffService = require('../services/StaffService');
/**
 * Update status (active/inactive) of a staff account
 * PUT /api/staff/:staffId/status
 * Body: { status }
 */
const updateStaffStatusController = async (req, res) => {
    try {
        const { staffId } = req.params;
        const status = req.body?.status;

        if (!staffId || status === undefined) {
            return res.status(400).json({
                status: "ERR",
                message: "User ID and status are required"
            });
        }

        const response = await StaffService.updateStaffStatus(staffId, status);
        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message
        });
    }
};

/**
 * Create a new staff account
 * POST /api/staff
 */
const createStaffController = async (req, res) => {
    try {
        // Normalize input: convert staff_name to user_name if needed
        const data = { ...req.body };
        if (data.staff_name && !data.user_name) {
            data.user_name = data.staff_name;
            delete data.staff_name;
        }

        const response = await StaffService.createStaff(data);
        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message
        });
    }
};

/**
 * Update staff account information
 * PUT /api/staff/:staffId
 * Body: { user_name, password, phone, address, role, avatar }
 */
const updateStaffController = async (req, res) => {
    try {
        const { staffId } = req.params;
        const data = req.body;

        if (!staffId) {
            return res.status(400).json({
                status: "ERR",
                message: "Staff ID is required"
            });
        }

        const response = await StaffService.updateStaff(staffId, data);
        const code = response?.status === 'OK' ? 200 : 400;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message
        });
    }
};

/**
 * Get paginated list of staff accounts
 * GET /api/staff
 * Query: page, limit, status, sortBy, sortOrder
 */
const getStaffsController = async (req, res) => {
    try {
        const response = await StaffService.getStaffs(req.query);
        const code = response?.status === 'OK' ? 200 : 400;
        return res.status(code).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message
        });
    }
};

/**
 * Get staff details by ID
 * GET /api/staff/:id
 */
const getStaffDetailsController = async (req, res) => {
    try {
        const { id } = req.params;
        const response = await StaffService.getStaffDetails(id);
        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message
        });
    }
};

/**
 * Search staff accounts by keyword
 * GET /api/staff/search?keyword=
 */
const searchStaffsController = async (req, res) => {
    try {
        const { keyword } = req.query;
        const response = await StaffService.searchStaffs(keyword, req.query);
        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message
        });
    }
};

/**
 * Filter staff accounts by role, status, and sorting options
 * GET /api/staff/filter
 */
const filterStaffsController = async (req, res) => {
    try {
        const filters = req.query;
        const response = await StaffService.filterStaffs(filters);
        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message
        });
    }
};

module.exports = {
    updateStaffStatusController,
    createStaffController,
    getStaffsController,
    getStaffDetailsController,
    searchStaffsController,
    updateStaffController,
    filterStaffsController
};
