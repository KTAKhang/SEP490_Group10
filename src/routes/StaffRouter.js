const express = require('express');
const router = express.Router();
const { authAdminMiddleware } = require('../middleware/authMiddleware');
const {
    updateStaffStatusController,
    createStaffController,
    updateStaffController,
    getStaffsController,
    getStaffDetailsController,
    searchStaffsController,
    filterStaffsController
} = require('../controller/StaffController');

// Apply admin authentication middleware to all staff routes
router.use(authAdminMiddleware);

// Update staff status (active / inactive)
router.put('/status/:staffId', updateStaffStatusController);

// Create new staff account
router.post('/', createStaffController);

// Update staff account information
router.put('/:staffId', updateStaffController);

// Search staff by keyword (username, email, phone)
router.get('/search', searchStaffsController);

// Filter staff by role, status, sorting options
router.get('/filter', filterStaffsController);

// Get paginated list of staff
router.get('/', getStaffsController);

// Get staff details by ID
router.get('/:id', getStaffDetailsController);

module.exports = router;
