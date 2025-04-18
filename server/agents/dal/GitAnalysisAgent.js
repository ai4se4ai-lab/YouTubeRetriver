/**
 * Git Analysis Agent (A20)
 * Establishes connection to Git repositories and analyzes code changes for issues
 */
const BaseAgent = require("../baseAgent");
const config = require("../../config/config");
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
  }

  /**
   * Initialize connection to the Git repository
   * @returns {Promise<boolean>} Connection success status
   */
  // Improve the connectToRepository method to be less destructive
  async connectToRepository() {
    try {
      // Get repository configuration from environment
      const repoUrl = process.env.GIT_REPO_URL;
      const repoPath = process.env.GIT_REPO_PATH || "./temp/git-repo";
      const gitUsername = process.env.GIT_USERNAME;
      const gitToken = process.env.GIT_TOKEN;
      const targetBranch = process.env.GIT_TARGET_BRANCH || "main";

      // Validate required config
      if (!repoUrl) {
        throw new Error("GIT_REPO_URL environment variable not set");
      }

      this.repoPath = repoPath;

      // Ensure repo directory exists
      if (!fs.existsSync(repoPath)) {
        fs.mkdirSync(repoPath, { recursive: true });
      }

      // Format repo URL with credentials if available
      let formattedRepoUrl = repoUrl;
      if (gitUsername && gitToken) {
        const urlObj = new URL(repoUrl);
        formattedRepoUrl = `${urlObj.protocol}//${gitUsername}:${gitToken}@${urlObj.host}${urlObj.pathname}`;
      }

      // Initialize git client
      this.git = simpleGit(repoPath);

      // Check if git repo already exists at the path
      const isRepo = await this.git.checkIsRepo();

      if (!isRepo) {
        // Clone repo
        console.log(
          `GitAnalysisAgent: Cloning repository ${formattedRepoUrl} to ${repoPath}`
        );
        try {
          await this.git.clone(formattedRepoUrl, repoPath);
          console.log(`GitAnalysisAgent: Repository cloned successfully`);
        } catch (cloneError) {
          console.error(`GitAnalysisAgent: Clone error: ${cloneError.message}`);
          // Try a different approach if clone fails
          try {
            console.log(
              "GitAnalysisAgent: Attempting init and remote add instead"
            );
            await this.git.init();
            await this.git.addRemote("origin", formattedRepoUrl);
            await this.git.fetch();
            await this.git.checkout(targetBranch);
            console.log("GitAnalysisAgent: Init approach succeeded");
          } catch (initError) {
            console.error(
              `GitAnalysisAgent: Init approach failed: ${initError.message}`
            );
            throw initError;
          }
        }
      } else {
        // Reset any local changes and pull latest
        console.log(
          "GitAnalysisAgent: Resetting and updating existing repository"
        );
        try {
          await this.git.reset("hard");
          await this.git.checkout(targetBranch);
          await this.git.pull("origin", targetBranch);
          console.log(`GitAnalysisAgent: Repository updated at ${repoPath}`);
        } catch (updateError) {
          console.error(
            `GitAnalysisAgent: Update error: ${updateError.message}`
          );
          throw updateError;
        }
      }

      // Get latest commit hash to track changes
      try {
        console.log("GitAnalysisAgent: Getting latest commit hash");
        const latestCommit = await this.git.revparse(["HEAD"]);
        console.log(`GitAnalysisAgent: Latest commit: ${latestCommit}`);
        this.lastAnalyzedCommit = latestCommit;
        this.isConnected = true;
      } catch (revparseError) {
        console.error(
          `GitAnalysisAgent: Revparse error: ${revparseError.message}`
        );
        throw revparseError;
      }

      console.log("GitAnalysisAgent: Repository connection successful");
      return true;
    } catch (error) {
      console.error(`GitAnalysisAgent: Connection error: ${error.message}`);
      this.error = error.message;
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Check for new commits or pull requests on the target branch
   * @returns {Promise<Array>} New commit data if available
   */
  async checkForChanges() {
    if (!this.isConnected) {
      await this.connectToRepository();
    }

    try {
      const targetBranch = process.env.GIT_TARGET_BRANCH || "main";

      // Pull latest changes
      await this.git.checkout(targetBranch);
      await this.git.pull("origin", targetBranch);

      // Get latest commit
      const latestCommit = await this.git.revparse(["HEAD"]);

      // If no previous commit or new commits are available
      if (
        !this.lastAnalyzedCommit ||
        latestCommit !== this.lastAnalyzedCommit
      ) {
        // Get commit range to analyze
        const commitRange = this.lastAnalyzedCommit
          ? `${this.lastAnalyzedCommit}..${latestCommit}`
          : latestCommit;

        // Get commit details
        const commitLog = await this.git.log({
          from: this.lastAnalyzedCommit || "",
          to: latestCommit,
        });

        // Update last analyzed commit
        this.lastAnalyzedCommit = latestCommit;

        return {
          hasChanges: true,
          commits: commitLog.all,
          commitRange,
        };
      }

      return { hasChanges: false };
    } catch (error) {
      console.error("Error checking for changes:", error);
      this.error = error.message;
      return { hasChanges: false, error: error.message };
    }
  }

  /**
   * Get diff for specific commits
   * @param {string} commitRange - Range of commits to analyze (e.g., hash1..hash2)
   * @returns {Promise<Object>} Diff details
   */
  async getCommitDiff(commitRange) {
    try {
      // Get the diff
      const diff = await this.git.diff([commitRange]);

      // Get the list of changed files
      const summary = await this.git.diffSummary([commitRange]);

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
      let securityIssues = [];

      // Check if external scanning tools are available
      const hasBandit = await this.checkToolAvailability("bandit --version");
      const hasESLint = await this.checkToolAvailability("eslint --version");

      // Filter files by language/type for specific scanners
      const jsFiles = changedFiles.filter(
        (file) =>
          file.file.endsWith(".js") ||
          file.file.endsWith(".jsx") ||
          file.file.endsWith(".ts")
      );

      const pyFiles = changedFiles.filter((file) => file.file.endsWith(".py"));

      // Run ESLint for JavaScript files
      if (hasESLint && jsFiles.length > 0) {
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
   * @returns {Promise<Object>} Analysis results
   */
  async analyzeChanges() {
    try {
      try {
        console.log("GitAnalysisAgent: Starting analysis...");

        // Connect to repository if not connected
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
          });
        }

        // Get diff data
        const diffData = await this.getCommitDiff(changeData.commitRange);

        if (diffData.error) {
          throw new Error(`Error getting diff: ${diffData.error}`);
        }

        // Run security scan on changed files
        const securityResults = await this.runSecurityScan(
          diffData.changedFiles
        );

        // Extract context around issues
        const contextData = await this.extractContext(
          securityResults,
          diffData
        );

        // Process the results
        const analysisResults = {
          repositoryUrl: process.env.GIT_REPO_URL,
          targetBranch: process.env.GIT_TARGET_BRANCH || "main",
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
        console.error("Error analyzing changes:", error);
        this.error = error.message;

        // Return an error result
        return {
          name: this.name,
          processed: false,
          error: error.message,
          result: null,
        };
      }
      // Rest of the function...
    } catch (error) {
      console.error("GitAnalysisAgent: Error analyzing changes:", error);
      // Rest of the error handling...
    }
  }
}

module.exports = new GitAnalysisAgent();
