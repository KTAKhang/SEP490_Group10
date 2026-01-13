/**
 * author: KhoaNDCE170420
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
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

// Configure multer for file upload
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 3 * 1024 * 1024, // 3MB
    },
});

// Apply admin authentication middleware to all staff routes
router.use(authAdminMiddleware);

// Update staff status (active / inactive)
router.put('/status/:staffId', updateStaffStatusController);

// Create new staff account (with optional avatar upload)
router.post('/', upload.single('avatar'), createStaffController);

// Update staff account information (with optional avatar upload)
router.put('/:staffId', upload.single('avatar'), updateStaffController);

// Search staff by keyword (username, email, phone)
router.get('/search', searchStaffsController);

// Filter staff by role, status, sorting options
router.get('/filter', filterStaffsController);

// Get paginated list of staff
router.get('/', getStaffsController);

// Get staff details by ID
router.get('/:id', getStaffDetailsController);

module.exports = router;
