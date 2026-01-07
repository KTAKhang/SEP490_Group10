const RoleService = require('../services/RoleService');

const getAllRole = async (req, res) => {
    try {
        const response = await RoleService.getAllRole();
        return res.status(200).json(response);
    } catch (error) {
        return res.status(500).json({
            status: "ERR",
            message: error.message || "Internal Server Error",
        });
    }
}

module.exports = {
    getAllRole,
};