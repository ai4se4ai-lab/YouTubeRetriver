/**
 * Git Utility Functions
 * Contains helper functions for Git repository operations
 */
const { promisify } = require("util");
const exec = promisify(require("child_process").exec);
const path = require("path");
const fs = require("fs");

/**
 * Check if an external tool is available
 * @param {string} command - Command to check tool availability
 * @returns {Promise<boolean>} Whether the tool is available
 */
async function checkToolAvailability(command) {
  try {
    await exec(command);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if a path is safe to use (not inside the project directory)
 * @param {string} pathToCheck - Path to verify
 * @param {string} projectRootDir - Project root directory
 * @returns {boolean} True if the path is safe to use
 */
function isSafePath(pathToCheck, projectRootDir) {
  // Resolve to absolute paths for comparison
  const absolutePath = path.resolve(pathToCheck);

  // Check if the path is inside the project directory
  const isInsideProject = absolutePath.startsWith(projectRootDir);

  if (isInsideProject) {
    console.error(
      `SAFETY CHECK FAILED: Path ${absolutePath} is inside the project directory ${projectRootDir}`
    );
    return false;
  }

  return true;
}

/**
 * Run pattern-based scan for common security issues
 * @param {string} content - File content to scan
 * @param {string} fileName - Name of the file being scanned
 * @returns {Array} Found issues
 */
function runPatternBasedScan(content, fileName) {
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

  const environmentalPatterns = [
    {
      regex: /[\s\S]*?while\s*\(\s*true\s*\)[\s\S]*?/i,
      severity: "medium",
      category: "environmental",
      message:
        "Infinite loop detected - may cause excessive CPU usage and energy consumption",
    },
    {
      regex: /setTimeout\s*\(\s*[\s\S]*?,\s*[0-9]+\s*\)/i,
      severity: "low",
      category: "environmental",
      message:
        "Short polling intervals may increase server load and energy consumption",
    },
  ];

  const ideIntegrationPatterns = [
    {
      regex: /\b(he|his|him|she|her|hers)\b/i,
      severity: "medium",
      category: "ide",
      message:
        "Potentially gendered language in code or comments - consider using gender-neutral terms for inclusive code",
    },
    {
      regex: /\b(blacklist|whitelist|master|slave)\b/i,
      severity: "medium",
      category: "ide",
      message:
        "Potentially exclusionary terminology - consider using more inclusive alternatives (allowlist/denylist, primary/secondary)",
    },
    {
      regex: /\bgender\s*[=:]\s*['"][mf]ale['"]/i,
      severity: "high",
      category: "ide",
      message:
        "Limited gender options may be exclusionary - consider inclusive approaches to gender data collection",
    },
    {
      regex:
        /<select[^>]*>\s*<option[^>]*>Male<\/option>\s*<option[^>]*>Female<\/option>/i,
      severity: "high",
      category: "ide",
      message:
        "Binary gender selection UI element detected - consider more inclusive options",
    },
    {
      regex: /hardcoded.*?(language|locale|region|country)/i,
      severity: "medium",
      category: "ide",
      message:
        "Potential internationalization issue - hardcoded locale assumptions may not work for all users",
    },
    {
      regex: /aria-[a-z]+=|role=|tabindex=/i,
      severity: "low",
      category: "ide",
      message:
        "Accessibility attributes found - verify they're used correctly for assistive technology compatibility",
    },
    {
      regex: /<div[^>]*onClick/i,
      severity: "medium",
      category: "ide",
      message:
        "Potential keyboard accessibility issue - non-interactive elements with click handlers may not be keyboard accessible",
    },
    {
      regex: /contrast|color|background/i,
      severity: "low",
      category: "ide",
      message:
        "Check color contrast for accessibility compliance - ensure text is readable for users with low vision",
    },
    {
      regex: /throw\s+new\s+Error\(['"][^'"]*['"]\)/i,
      severity: "low",
      category: "ide",
      message:
        "Basic error handling detected - ensure errors are handled inclusively with clear, helpful messages for all users",
    },
    {
      regex: /firstName|lastName|fullName/i,
      severity: "low",
      category: "ide",
      message:
        "Name fields detected - ensure name handling accommodates diverse naming conventions across cultures",
    },
    {
      regex: /\bdefault\s+avatar\b|\bdefault\s+profile\b/i,
      severity: "medium",
      category: "ide",
      message:
        "Default user representation - ensure default avatars/profiles are diverse and inclusive",
    },
  ];

  const ethicalPatterns = [
    {
      regex: /password|user|email|personal|private/i,
      severity: "high",
      category: "ethical",
      message:
        "Potential privacy concern: Check for proper data handling and consent",
    },
    {
      regex: /tracking|analytics|monitor/i,
      severity: "medium",
      category: "ethical",
      message:
        "User tracking detected - ensure transparent disclosure and opt-out options",
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
      },
      ...environmentalPatterns,
      ...ideIntegrationPatterns,
      ...ethicalPatterns
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
      },
      ...environmentalPatterns,
      ...ideIntegrationPatterns,
      ...ethicalPatterns
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
          category: pattern.category || "security"
        });
      }
    });
  });

  return issues;
}

/**
 * Extract context around issues in code
 * @param {Object} securityResults - Security scan results
 * @param {Object} diffData - Git diff data
 * @param {string} repoPath - Path to the repository
 * @returns {Promise<Object>} Enhanced context information
 */
async function extractContextAroundIssues(securityResults, diffData, repoPath) {
  try {
    console.log("Extracting context around issues");
    const issuesWithContext = [];

    // Categorize issues by type
    const categorizedIssues = {
      security: [],
      environmental: [],
      ide: [],
      ethical: [],
    };

    for (const issue of securityResults.securityIssues) {
      const category = issue.category || "security";
      let contextLines = [];

      const filePath = path.join(repoPath, issue.file);

      if (fs.existsSync(filePath)) {
        // Read file content
        const content = await fs.promises.readFile(filePath, "utf8");
        const lines = content.split("\n");

        // Extract context (5 lines before and after the issue)
        const startLine = Math.max(0, issue.line - 6);
        const endLine = Math.min(lines.length - 1, issue.line + 4);

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

      if (categorizedIssues[category]) {
        categorizedIssues[category].push({
          ...issue,
          context: contextLines,
          changeInfo,
        });
      } else {
        // Fallback to security category
        categorizedIssues.security.push({
          ...issue,
          context: contextLines,
          changeInfo,
        });
      }
    }

    return {
      issuesByCategory: categorizedIssues,
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
    return { error: error.message };
  }
}

/**
 * Create repositories directory if it doesn't exist
 * @param {string} reposDir - Path to repositories directory
 */
function ensureReposDirExists(reposDir) {
  if (!fs.existsSync(reposDir)) {
    fs.mkdirSync(reposDir, { recursive: true });
    console.log(`Created Git repositories directory: ${reposDir}`);
  }
}

/**
 * Start Git repository polling
 * @param {Object} options - Git repository options
 * @param {Function} checkFn - Function to check for changes
 * @param {Function} emitFn - Function to emit events
 * @param {number} interval - Polling interval in milliseconds
 * @returns {NodeJS.Timeout} Interval ID
 */
function startGitPolling(options, checkFn, emitFn, interval = 60000) {
  console.log("Starting Git repository polling");

  // Poll at specified interval
  return setInterval(async () => {
    try {
      console.log("Polling Git repository for changes");

      // Check for changes
      const changeData = await checkFn();

      if (changeData.hasChanges) {
        console.log("Git changes detected, triggering analysis");

        // Emit event about new changes
        emitFn("gitChangesDetected", {
          changeData,
          timestamp: new Date().toISOString(),
        });
      } else {
        console.log("No Git changes detected during polling");
      }
    } catch (error) {
      console.error("Error during Git repository polling:", error);
    }
  }, interval);
}

module.exports = {
  checkToolAvailability,
  isSafePath,
  runPatternBasedScan,
  extractContextAroundIssues,
  ensureReposDirExists,
  startGitPolling
};