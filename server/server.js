// server/server.js
/**
 * Main server file
 */
// Load dotenv at the very beginning
require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const session = require("express-session");
const fs = require("fs");
const compression = require("compression"); // Add compression middleware
const http = require("http");
const socketIo = require("socket.io");

// Load configuration
const config = require("./config/config");
const gitConfig = require("./config/gitConfig");

// Import routes
const authRoutes = require("./routes/authRoutes");
const dataRoutes = require("./routes/dataRoutes");
const agentRoutes = require("./routes/agentRoutes");

// Import controllers
const agentController = require("./controllers/agentController");

// Create Express app
const app = express();

// Create HTTP server with Express app
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIo(server, {
  cors: {
    origin: config.security.corsOrigin,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const agentManager = require("./agents/AgentManager");

// Get repository configuration for current session
const repoConfig = gitConfig.getConfig(this.currentSessionId);
console.log(`GitAnalysisAgent: Using repo URL ${repoConfig.repoUrl}`);

// Get unique repository path for this session
this.repoPath = gitConfig.getRepoPath(this.currentSessionId);
console.log(`GitAnalysisAgent: Using repo path ${this.repoPath}`);

// Start Git monitoring immediately
console.log("Starting persistent Git monitoring on server startup");
if (repoConfig.repoUrl) {
  // Set up persistent monitoring with specific repository details
  const gitMonitoringOptions = {
    repoUrl: repoConfig.repoUrl,
    targetBranch: repoConfig.targetBranch || "main",
    username: repoConfig.username || "",
    token: repoConfig.token || "",
  };

  // Create a monitoring session
  const monitoringSessionId = `persistent_monitor_${Date.now()}`;

  // Initialize Git agent with the monitoring session
  const gitAgent = agentManager.getAgent("gitAnalysis");
  gitAgent.setSession(monitoringSessionId);

  // Connect to repository with provided options
  gitAgent
    .connectToRepository(gitMonitoringOptions)
    .then((connected) => {
      if (connected) {
        console.log(
          `Successfully connected to Git repository: ${repoConfig.repoUrl}`
        );
      } else {
        console.error("Failed to connect to Git repository");
      }
    })
    .catch((error) => {
      console.error("Error connecting to Git repository:", error);
    });
}

// Listen for Git changes
agentManager.on("gitChangesDetected", async (changeInfo) => {
  console.log("Git changes detected by monitoring:", changeInfo.timestamp);

  // Notify all connected clients about the change
  io.emit("gitChangesDetected", {
    timestamp: changeInfo.timestamp,
    message: "New Git changes detected in the repository",
    changeData: {
      hasChanges: true,
      commitCount: changeInfo.changeData.commits?.length || "unknown",
    },
  });

  // If automatic mode is enabled, start a new workflow
  if (changeInfo.automatic) {
    console.log("Automatic Git change detection, starting analysis workflow");

    try {
      // Start a new Git-triggered workflow
      await agentManager.processGitChanges(changeInfo.changeData);
    } catch (error) {
      console.error("Error starting Git-triggered workflow:", error);
    }
  }
});

// Add event handler for Git-triggered workflows
agentManager.on("gitWorkflowStarted", (info) => {
  console.log(`Git-triggered workflow started: ${info.sessionId}`);

  // Broadcast to all clients
  io.emit("gitWorkflowStarted", {
    sessionId: info.sessionId,
    timestamp: info.timestamp,
    message: info.message,
  });
});

// Make io accessible to the Express app
app.set("io", io);

// Middleware
// Increase JSON body parser limits for large datasets
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Enable compression for all responses
app.use(compression());

// Enable CORS
app.use(
  cors({
    origin: config.security.corsOrigin,
    credentials: true,
  })
);

// Session middleware
app.use(
  session({
    secret: config.security.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.server.nodeEnv === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Serve static files
app.use(express.static(path.join(__dirname, "../public")));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/agents", agentRoutes);

// Development-only route to check environment variables
if (config.server.nodeEnv === "development") {
  app.get("/api/env-check", (req, res) => {
    res.json({
      googleClientIdExists: !!config.google.clientId,
      googleClientSecretExists: !!config.google.clientSecret,
      googleRedirectUri: config.google.redirectUri,
      corsOrigin: config.security.corsOrigin,
      openaiApiKeyExists: !!config.agents.openaiApiKey,
    });
  });
}

// Download route for CSV files
app.get("/download/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(config.storage.tempDir, filename);

  // Check if file exists
  if (fs.existsSync(filePath)) {
    return res.download(filePath);
  }

  res.status(404).send("File not found");
});

// Fallback route - serve index.html for any unmatched routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(err.status || 500).json({
    error: true,
    message: err.message || "An unexpected error occurred",
  });
});

// Create temp directory if it doesn't exist
if (!fs.existsSync(config.storage.tempDir)) {
  fs.mkdirSync(config.storage.tempDir, { recursive: true });
}

// Set up Socket.IO handlers
agentController.setupSocketHandlers(io);

// Start server
const PORT = config.server.port;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${config.server.nodeEnv}`);
  console.log(`Auth endpoint: ${config.google.redirectUri}`);
  console.log(`Socket.IO initialized`);
  console.log(`Git monitoring active: ${!!repoConfig.repoUrl}`);
});

// Cleanup function for temporary files
const cleanupTempFiles = () => {
  const tempDir = config.storage.tempDir;
  const maxAge = config.storage.maxFileAge;

  if (fs.existsSync(tempDir)) {
    fs.readdir(tempDir, (err, files) => {
      if (err) {
        console.error("Error reading temp directory:", err);
        return;
      }

      const now = Date.now();

      files.forEach((file) => {
        const filePath = path.join(tempDir, file);

        fs.stat(filePath, (statErr, stats) => {
          if (statErr) {
            console.error(`Error getting stats for file ${file}:`, statErr);
            return;
          }

          // Check if file is older than max age
          if (now - stats.mtime.getTime() > maxAge) {
            fs.unlink(filePath, (unlinkErr) => {
              if (unlinkErr) {
                console.error(`Error deleting file ${file}:`, unlinkErr);
              } else {
                console.log(`Deleted old temp file: ${file}`);
              }
            });
          }
        });
      });
    });
  }
};

// Run cleanup every hour
setInterval(cleanupTempFiles, 60 * 60 * 1000);

// Cleanup on exit
process.on("SIGINT", () => {
  console.log("Shutting down server");

  // Stop Git monitoring gracefully
  if (agentManager.gitPollingInterval) {
    clearInterval(agentManager.gitPollingInterval);

    // Tell Git agent to stop monitoring
    const gitAgent = agentManager.getAgent("gitAnalysis");
    if (gitAgent && gitAgent.isMonitoring) {
      console.log("Stopping Git monitoring before shutdown");
      gitAgent.stopMonitoring();
    }
  }

  setTimeout(() => {
    console.log("Shutdown complete");
    process.exit(0);
  }, 1000);
});

module.exports = app;
