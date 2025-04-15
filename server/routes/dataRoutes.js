/**
 * Data routes
 */
const express = require("express");
const router = express.Router();
const dataController = require("../controllers/dataController");
const helpers = require("../utils/helpers");

// Apply authentication middleware to individual routes
router.get("/liked", helpers.authenticateToken, dataController.getLikedVideos);

// Get watch history
router.get(
  "/history",
  helpers.authenticateToken,
  dataController.getWatchHistory
);

// Get channel statistics
router.get(
  "/statistics",
  helpers.authenticateToken,
  dataController.getStatistics
);

// Export data to CSV
router.post("/export", helpers.authenticateToken, dataController.exportToCsv);

module.exports = router;
