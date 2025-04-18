/**
 * Git Analysis Agent (A20)
 * Establishes connection to Git repositories and analyzes code changes for issues
 */
const BaseAgent = require("../baseAgent");
const config = require("../../config/config");
const gitConfig = require("../../config/gitConfig");
const { simpleGit } = require("simple-git");
const path = require("path");
const fs = require("fs");
const { promisify } = require("util");
const exec = promisify(require("child_process").exec);

class GitAnalysisAgent extends BaseAgent {
  constructor() {
    super(
      "Git Analysis Agent (A20)",
      "Analyzes Git repository changes to detect potential issues and extract relevant context"
    );
    this.prompt = config.agents.gitAnalysisPrompt;
    this.git = null;
    this.repoPath = null;
    this.lastAnalyzedCommit = null;
    this.isConnected = false;
    this.currentSessionId = null;
  }

  /**
   * Set the current session ID for repository configuration
   * @param {string} sessionId - The session identifier
   */
  setSession(sessionId) {
    this.currentSessionId = sessionId;
    this.isConnected = false; // Reset connection status for new session
    this.lastAnalyzedCommit = null;
    console.log(`Git Analysis Agent: Session set to ${sessionId}`);
    return this;
  }

  /**
   * Initialize connection to the Git repository
   * @param {Object} options - Optional repository connection options
   * @returns {Promise<boolean>} Connection success status
   */
  async connectToRepository(options = {}) {
    try {
      console.log("GitAnalysisAgent: Connecting to repository...");

      // If options are provided, update the configuration for this session
      if (Object.keys(options).length > 0 && this.currentSessionId) {
        gitConfig.setConfig(this.currentSessionId, options);
      }

      // Get repository configuration for current session
      const repoConfig = gitConfig.getConfig(this.currentSessionId);
      console.log(`GitAnalysisAgent: Using repo URL ${repoConfig.repoUrl}`);

      // Get unique repository path for this session
      this.repoPath = gitConfig.getRepoPath(this.currentSessionId);
      console.log(`GitAnalysisAgent: Using repo path ${this.repoPath}`);

      // SAFETY CHECK: Ensure the repository path is not inside the project directory
      if (!this.isSafePath(this.repoPath)) {
        throw new Error(
          `Safety check failed: Cannot use repository path ${this.repoPath} as it appears to be inside the project directory. Please configure a separate path in gitConfig.json.`
        );
      }

      // Validate required config
      if (!repoConfig.repoUrl) {
        throw new Error("Repository URL not provided in configuration");
      }

      // Ensure repo directory exists
      if (!fs.existsSync(this.repoPath)) {
        fs.mkdirSync(this.repoPath, { recursive: true });
        console.log(`GitAnalysisAgent: Created directory ${this.repoPath}`);
      }

      // Format repo URL with credentials if available
      let formattedRepoUrl = repoConfig.repoUrl;
      if (repoConfig.username && repoConfig.token) {
        const urlObj = new URL(repoConfig.repoUrl);
        formattedRepoUrl = `${urlObj.protocol}//${repoConfig.username}:${repoConfig.token}@${urlObj.host}${urlObj.pathname}`;
        console.log(
          "GitAnalysisAgent: Using authenticated URL with credentials"
        );
      }

      // Initialize git client
      this.git = simpleGit(this.repoPath);
      console.log("GitAnalysisAgent: Git client initialized");

      // Check if git repo already exists at the path
      const isRepo = await this.git.checkIsRepo();
      console.log(`GitAnalysisAgent: Is already a repo: ${isRepo}`);

      if (!isRepo) {
        // Clone repo
        console.log(`GitAnalysisAgent: Cloning repository to ${this.repoPath}`);
        await this.git.clone(formattedRepoUrl, this.repoPath);
        console.log(`GitAnalysisAgent: Repository cloned to ${this.repoPath}`);

        // Checkout the target branch
        await this.git.checkout(repoConfig.targetBranch);
        console.log(
          `GitAnalysisAgent: Checked out branch ${repoConfig.targetBranch}`
        );
      } else {
        // Handle existing repository
        console.log("GitAnalysisAgent: Repository already exists, updating");

        // First, reset any changes to avoid conflicts
        await this.git.reset(["--hard"]);
        console.log("GitAnalysisAgent: Reset any local changes");

        // Then fetch latest changes
        await this.git.fetch("origin");
        console.log("GitAnalysisAgent: Fetched latest changes");

        // Checkout the target branch
        await this.git.checkout(repoConfig.targetBranch);
        console.log(
          `GitAnalysisAgent: Checked out branch ${repoConfig.targetBranch}`
        );

        // Pull the latest changes
        await this.git.pull("origin", repoConfig.targetBranch);
        console.log(
          `GitAnalysisAgent: Pulled latest changes from ${repoConfig.targetBranch}`
        );
      }

      // Get latest commit hash to track changes
      const latestCommit = await this.git.revparse(["HEAD"]);
      console.log(`GitAnalysisAgent: Latest commit is ${latestCommit}`);
      this.lastAnalyzedCommit = latestCommit;
      this.isConnected = true;

      console.log("GitAnalysisAgent: Successfully connected to repository");
      return true;
    } catch (error) {
      console.error("Error connecting to Git repository:", error);
      this.error = error.message;
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Check for new commits or pull requests on the target branch
   * @returns {Promise<Object>} New commit data if available
   */
  async checkForChanges() {
    if (!this.isConnected) {
      console.log("GitAnalysisAgent: Not connected, connecting first");
      await this.connectToRepository();
    }

    try {
      // Get repository configuration
      const repoConfig = gitConfig.getConfig(this.currentSessionId);
      const targetBranch = repoConfig.targetBranch;
      console.log(
        `GitAnalysisAgent: Checking for changes on branch ${targetBranch}`
      );

      // Pull latest changes for the target branch
      await this.git.checkout(targetBranch);
      await this.git.pull("origin", targetBranch);
      console.log("GitAnalysisAgent: Pulled latest changes");

      // Get latest commit
      const latestCommit = await this.git.revparse(["HEAD"]);
      console.log(`GitAnalysisAgent: Current HEAD is ${latestCommit}`);

      // If no previous commit or new commits are available
      if (
        !this.lastAnalyzedCommit ||
        latestCommit !== this.lastAnalyzedCommit
      ) {
        console.log(
          `GitAnalysisAgent: New commits found since ${
            this.lastAnalyzedCommit || "initial check"
          }`
        );

        // Get commit range to analyze
        const commitRange = this.lastAnalyzedCommit
          ? `${this.lastAnalyzedCommit}..${latestCommit}`
          : latestCommit;

        // Get commit details
        const commitLog = await this.git.log({
          from: this.lastAnalyzedCommit || "",
          to: latestCommit,
        });
        console.log(
          `GitAnalysisAgent: Found ${commitLog.all.length} new commits`
        );

        // Update last analyzed commit
        this.lastAnalyzedCommit = latestCommit;

        return {
          hasChanges: true,
          commits: commitLog.all,
          commitRange,
          currentBranch: targetBranch,
        };
      }

      console.log("GitAnalysisAgent: No new changes detected");
      return {
        hasChanges: false,
        currentBranch: targetBranch,
      };
    } catch (error) {
      console.error("Error checking for changes:", error);
      this.error = error.message;

      // Even in case of error, return a valid result object so the workflow can continue
      return {
        hasChanges: false,
        error: error.message,
        errorObject: error,
        // Try to determine current branch even on error
        currentBranch: await this.git
          .revparse(["--abbrev-ref", "HEAD"])
          .catch(() => "unknown"),
      };
    }
  }

  /**
   * Get diff for specific commits
   * @param {string} commitRange - Range of commits to analyze (e.g., hash1..hash2)
   * @returns {Promise<Object>} Diff details
   */
  async getCommitDiff(commitRange) {
    try {
      console.log(`GitAnalysisAgent: Getting diff for range ${commitRange}`);

      // Get the diff
      const diff = await this.git.diff([commitRange]);

      // Get the list of changed files
      const summary = await this.git.diffSummary([commitRange]);
      console.log(
        `GitAnalysisAgent: Found ${summary.files.length} changed files`
      );

      return {
        diff,
        changedFiles: summary.files,
        insertions: summary.insertions,
        deletions: summary.deletions,
        changedFilesCount: summary.files.length,
      };
    } catch (error) {
      console.error("Error getting commit diff:", error);
      this.error = error.message;
      return { error: error.message };
    }
  }

  /**
   * Run security scan on changed files
   * @param {Array} changedFiles - List of changed files to scan
   * @returns {Promise<Object>} Security scan results
   */
  async runSecurityScan(changedFiles) {
    try {
      console.log(
        `GitAnalysisAgent: Running security scan on ${changedFiles.length} files`
      );
      let securityIssues = [];

      // Check if external scanning tools are available
      const hasBandit = await this.checkToolAvailability("bandit --version");
      const hasESLint = await this.checkToolAvailability("eslint --version");
      console.log(
        `GitAnalysisAgent: Available tools - ESLint: ${hasESLint}, Bandit: ${hasBandit}`
      );

      // Filter files by language/type for specific scanners
      const jsFiles = changedFiles.filter(
        (file) =>
          file.file.endsWith(".js") ||
          file.file.endsWith(".jsx") ||
          file.file.endsWith(".ts")
      );

      const pyFiles = changedFiles.filter((file) => file.file.endsWith(".py"));
      console.log(
        `GitAnalysisAgent: Found ${jsFiles.length} JS files and ${pyFiles.length} Python files`
      );

      // Run ESLint for JavaScript files
      if (hasESLint && jsFiles.length > 0) {
        console.log(
          `GitAnalysisAgent: Running ESLint on ${jsFiles.length} JavaScript files`
        );
        for (const file of jsFiles) {
          const filePath = path.join(this.repoPath, file.file);
          if (fs.existsSync(filePath)) {
            try {
              const { stdout } = await exec(
                `eslint --no-eslintrc -f json ${filePath}`
              );
              const results = JSON.parse(stdout);

              if (
                results &&
                results.length > 0 &&
                results[0].messages.length > 0
              ) {
                results[0].messages.forEach((msg) => {
                  securityIssues.push({
                    file: file.file,
                    line: msg.line,
                    column: msg.column,
                    severity:
                      msg.severity === 2
                        ? "high"
                        : msg.severity === 1
                        ? "medium"
                        : "low",
                    message: msg.message,
                    ruleId: msg.ruleId,
                    tool: "eslint",
                  });
                });
              }
            } catch (eslintError) {
              // Still capture issues from error output (ESLint exits with non-zero on findings)
              try {
                const results = JSON.parse(eslintError.stdout);
                if (
                  results &&
                  results.length > 0 &&
                  results[0].messages.length > 0
                ) {
                  results[0].messages.forEach((msg) => {
                    securityIssues.push({
                      file: file.file,
                      line: msg.line,
                      column: msg.column,
                      severity:
                        msg.severity === 2
                          ? "high"
                          : msg.severity === 1
                          ? "medium"
                          : "low",
                      message: msg.message,
                      ruleId: msg.ruleId,
                      tool: "eslint",
                    });
                  });
                }
              } catch (parseError) {
                console.error("Error parsing ESLint output:", parseError);
              }
            }
          }
        }
      }

      // Run Bandit for Python files
      if (hasBandit && pyFiles.length > 0) {
        console.log(
          `GitAnalysisAgent: Running Bandit on ${pyFiles.length} Python files`
        );
        for (const file of pyFiles) {
          const filePath = path.join(this.repoPath, file.file);
          if (fs.existsSync(filePath)) {
            try {
              const { stdout } = await exec(`bandit -f json ${filePath}`);
              const results = JSON.parse(stdout);

              if (results && results.results && results.results.length > 0) {
                results.results.forEach((finding) => {
                  securityIssues.push({
                    file: file.file,
                    line: finding.line_number,
                    severity: finding.issue_severity.toLowerCase(),
                    confidence: finding.issue_confidence.toLowerCase(),
                    message: finding.issue_text,
                    codeSnippet: finding.code,
                    tool: "bandit",
                  });
                });
              }
            } catch (banditError) {
              console.error("Error running Bandit:", banditError);
            }
          }
        }
      }

      // Simple pattern-based security checks for all files
      console.log("GitAnalysisAgent: Running pattern-based scan on all files");
      for (const file of changedFiles) {
        const filePath = path.join(this.repoPath, file.file);
        if (fs.existsSync(filePath)) {
          try {
            const content = await fs.promises.readFile(filePath, "utf8");
            const issues = this.runPatternBasedScan(content, file.file);
            securityIssues = securityIssues.concat(issues);
          } catch (fileReadError) {
            console.error(`Error reading file ${file.file}:`, fileReadError);
          }
        }
      }

      console.log(
        `GitAnalysisAgent: Found ${securityIssues.length} security issues`
      );
      return {
        issuesFound: securityIssues.length > 0,
        securityIssues,
        toolsAvailable: {
          eslint: hasESLint,
          bandit: hasBandit,
        },
      };
    } catch (error) {
      console.error("Error in security scan:", error);
      this.error = error.message;
      return {
        issuesFound: false,
        error: error.message,
        securityIssues: [],
      };
    }
  }

  /**
   * Pattern-based scan for common security issues
   * @param {string} content - File content to scan
   * @param {string} fileName - Name of the file being scanned
   * @returns {Array} Found issues
   */
  runPatternBasedScan(content, fileName) {
    const issues = [];
    const lines = content.split("\n");

    // Define patterns to look for
    const patterns = [
      {
        regex: /password\s*=\s*['"][^'"]+['"]/i,
        severity: "high",
        message: "Hardcoded password detected",
      },
      {
        regex: /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
        severity: "high",
        message: "Hardcoded API key detected",
      },
      {
        regex: /secret\s*=\s*['"][^'"]+['"]/i,
        severity: "high",
        message: "Hardcoded secret detected",
      },
      {
        regex: /token\s*=\s*['"][^'"]+['"]/i,
        severity: "high",
        message: "Hardcoded token detected",
      },
      {
        regex: /exec\s*\(/i,
        severity: "medium",
        message: "Command execution detected",
      },
      {
        regex: /eval\s*\(/i,
        severity: "medium",
        message: "Eval usage detected",
      },
      {
        regex: /TODO|FIXME|XXX|BUG/i,
        severity: "low",
        message: "Code annotation found",
      },
    ];

    // Add language-specific patterns based on file extension
    if (
      fileName.endsWith(".js") ||
      fileName.endsWith(".jsx") ||
      fileName.endsWith(".ts")
    ) {
      patterns.push(
        {
          regex: /innerHTML\s*=/i,
          severity: "medium",
          message: "Potential XSS vulnerability with innerHTML",
        },
        {
          regex: /document\.write\s*\(/i,
          severity: "medium",
          message: "Potential XSS vulnerability with document.write",
        }
      );
    } else if (fileName.endsWith(".py")) {
      patterns.push(
        {
          regex: /pickle\.loads?\(/i,
          severity: "medium",
          message: "Unsafe deserialization with pickle",
        },
        {
          regex: /\.system\s*\(/i,
          severity: "medium",
          message: "Potential command injection with system call",
        }
      );
    }

    // Check each line against patterns
    lines.forEach((line, lineIndex) => {
      patterns.forEach((pattern) => {
        if (pattern.regex.test(line)) {
          issues.push({
            file: fileName,
            line: lineIndex + 1,
            severity: pattern.severity,
            message: pattern.message,
            codeSnippet: line.trim(),
            tool: "pattern-scan",
          });
        }
      });
    });

    return issues;
  }

  /**
   * Check if an external tool is available
   * @param {string} command - Command to check tool availability
   * @returns {Promise<boolean>} Whether the tool is available
   */
  async checkToolAvailability(command) {
    try {
      await exec(command);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract context around issues
   * @param {Object} securityResults - Security scan results
   * @param {Object} diffData - Git diff data
   * @returns {Promise<Object>} Enhanced context information
   */
  async extractContext(securityResults, diffData) {
    try {
      console.log("GitAnalysisAgent: Extracting context around issues");
      const issuesWithContext = [];

      for (const issue of securityResults.securityIssues) {
        const filePath = path.join(this.repoPath, issue.file);

        if (fs.existsSync(filePath)) {
          // Read file content
          const content = await fs.promises.readFile(filePath, "utf8");
          const lines = content.split("\n");

          // Extract context (5 lines before and after the issue)
          const startLine = Math.max(0, issue.line - 6);
          const endLine = Math.min(lines.length - 1, issue.line + 4);

          const contextLines = [];
          for (let i = startLine; i <= endLine; i++) {
            contextLines.push({
              lineNumber: i + 1,
              content: lines[i],
              isIssueLine: i + 1 === issue.line,
            });
          }

          // Add file metadata
          const fileChange = diffData.changedFiles.find(
            (f) => f.file === issue.file
          );
          const changeInfo = fileChange
            ? {
                insertions: fileChange.insertions,
                deletions: fileChange.deletions,
                changes: fileChange.changes,
              }
            : { insertions: 0, deletions: 0, changes: 0 };

          issuesWithContext.push({
            ...issue,
            context: contextLines,
            changeInfo,
          });
        } else {
          // File not found, just add the issue without context
          issuesWithContext.push(issue);
        }
      }

      return {
        issuesWithContext,
        totalIssues: securityResults.securityIssues.length,
        issuesBySeverity: {
          high: securityResults.securityIssues.filter(
            (i) => i.severity === "high"
          ).length,
          medium: securityResults.securityIssues.filter(
            (i) => i.severity === "medium"
          ).length,
          low: securityResults.securityIssues.filter(
            (i) => i.severity === "low"
          ).length,
        },
      };
    } catch (error) {
      console.error("Error extracting context:", error);
      this.error = error.message;
      return { error: error.message };
    }
  }

  /**
   * Analyze repository changes and identify issues
   * @param {string} sessionId - Session identifier
   * @param {Object} options - Repository options
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeChanges(sessionId, options = {}) {
    try {
      console.log("GitAnalysisAgent: Starting analysis...");

      // Set the current session if provided
      if (sessionId) {
        this.setSession(sessionId);
      }

      // If options are provided, update configuration
      if (Object.keys(options).length > 0) {
        console.log("GitAnalysisAgent: Using provided repository options");
        gitConfig.setConfig(this.currentSessionId, options);
      }

      // Connect to repository
      if (!this.isConnected) {
        console.log("GitAnalysisAgent: Connecting to repository...");
        const connected = await this.connectToRepository();
        console.log(
          "GitAnalysisAgent: Repository connection result:",
          connected
        );
        if (!connected) {
          throw new Error("Failed to connect to repository");
        }
      }

      // Check for new changes
      console.log("GitAnalysisAgent: Checking for changes...");
      const changeData = await this.checkForChanges();
      console.log("GitAnalysisAgent: Change data:", changeData);

      // No changes or error
      if (!changeData.hasChanges) {
        console.log("GitAnalysisAgent: No changes detected");
        return this.process({
          status: "no_changes",
          message: "No new commits to analyze",
          repoInfo: {
            url: gitConfig.getConfig(this.currentSessionId).repoUrl,
            branch: gitConfig.getConfig(this.currentSessionId).targetBranch,
          },
        });
      }

      // Get diff data
      const diffData = await this.getCommitDiff(changeData.commitRange);

      if (diffData.error) {
        throw new Error(`Error getting diff: ${diffData.error}`);
      }

      // Run security scan on changed files
      const securityResults = await this.runSecurityScan(diffData.changedFiles);

      // Extract context around issues
      const contextData = await this.extractContext(securityResults, diffData);

      // Get repository configuration for current session
      const repoConfig = gitConfig.getConfig(this.currentSessionId);

      // Process the results
      const analysisResults = {
        repositoryUrl: repoConfig.repoUrl,
        targetBranch: repoConfig.targetBranch,
        commitData: changeData.commits,
        diffSummary: {
          insertions: diffData.insertions,
          deletions: diffData.deletions,
          changedFilesCount: diffData.changedFilesCount,
          changedFiles: diffData.changedFiles.map((f) => f.file),
        },
        securityIssues: contextData.issuesWithContext,
        securitySummary: {
          totalIssues: contextData.totalIssues,
          issuesBySeverity: contextData.issuesBySeverity,
        },
        analysisTimestamp: new Date().toISOString(),
      };

      // Process through LLM for analysis
      return this.process(analysisResults, this.prompt);
    } catch (error) {
      console.error("GitAnalysisAgent: Error analyzing changes:", error);
      this.error = error.message;

      // Return an error result
      return {
        name: this.name,
        processed: false,
        error: error.message,
        result: null,
      };
    }
  }

  /**
   * Clean up resources when done
   */
  cleanup() {
    console.log("GitAnalysisAgent: Cleaning up resources");

    // Clear the session configuration
    if (this.currentSessionId) {
      gitConfig.clearConfig(this.currentSessionId);
    }

    this.isConnected = false;
    this.lastAnalyzedCommit = null;
    this.currentSessionId = null;
  }
}

module.exports = new GitAnalysisAgent();
