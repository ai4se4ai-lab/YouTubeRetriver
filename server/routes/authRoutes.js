/**
 * Authentication routes
 */
const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// Initialize OAuth login flow
router.get("/login", authController.initiateOAuth);

// OAuth callback route
router.get("/callback", authController.handleOAuthCallback);

// Refresh access token
router.post("/refresh", authController.refreshToken);

// Revoke access token
router.post("/revoke", authController.revokeToken);

// Get current auth status
router.get("/status", authController.getAuthStatus);

module.exports = router;
