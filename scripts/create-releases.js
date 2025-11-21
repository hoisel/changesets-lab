#!/usr/bin/env node

/**
 * @file create-releases.js
 * @description Automatically creates GitHub releases for application tags.
 * Scans git tags at HEAD, filters for application packages (docs, web), and creates
 * GitHub releases with auto-generated release notes. Provides detailed statistics
 * and GitHub Actions step summary integration.
 *
 * @example
 *   # Basic usage (scans HEAD for tags)
 *   node scripts/create-releases.js
 *
 *   # In CI environment with GitHub Actions integration
 *   GITHUB_STEP_SUMMARY=/path/to/summary GITHUB_REPOSITORY=owner/repo node scripts/create-releases.js
 *
 * @requires gh - GitHub CLI for release creation
 * @requires git - For tag detection and operations
 */

const { execSync } = require('child_process');
const { appendFileSync } = require('fs');

// ============================================================================
// CONFIGURATION - Environment and constants
// ============================================================================

/**
 * GitHub Actions step summary file path for output integration.
 * @type {string | undefined}
 * @constant
 */
const GITHUB_STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;

/**
 * GitHub repository in owner/repo format for URL generation.
 * @type {string | undefined}
 * @constant
 */
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;

/**
 * Script execution start time for performance tracking.
 * @type {number}
 * @constant
 */
const SCRIPT_START_TIME = Date.now();

/**
 * Git command to detect tags at current HEAD.
 * @type {string}
 * @constant
 */
const GIT_TAG_DETECTION_COMMAND = 'git tag --points-at HEAD';

/**
 * Application package prefixes that should have releases.
 * @type {string[]}
 * @constant
 * @customization Add or remove application prefixes here
 */
const RELEASE_APP_PREFIXES = ['docs@', 'web@'];

// ============================================================================
// TYPES (JSDoc type definitions)
// ============================================================================

/**
 * @typedef {Object} ReleaseResult
 * @property {string[]} created - Successfully created releases
 * @property {string[]} skipped - Skipped releases (non-app packages)
 * @property {string[]} failed - Failed releases with errors
 */

/**
 * @typedef {Object} ReleaseStatistics
 * @property {number} totalTags - Total number of tags detected
 * @property {number} created - Number of releases successfully created
 * @property {number} skipped - Number of releases skipped
 * @property {number} failed - Number of releases that failed
 * @property {string} duration - Execution duration in seconds
 */

/**
 * @typedef {Object} ReleaseAttempt
 * @property {string} tag - Tag name
 * @property {boolean} success - Whether the release was created successfully
 * @property {string} [error] - Error message if creation failed
 */

// ============================================================================
// CORE LOGIC
// ============================================================================

/**
 * Main entry point for GitHub release creation.
 * Orchestrates the entire workflow: tag detection, filtering, release creation, and reporting.
 *
 * @throws {Error} If critical operations fail
 */
function main() {
  initializeGitHubStepSummary();

  console.log('🔍 Detecting tags at HEAD...');

  const tags = detectTagsAtHead();

  if (tags.length === 0) {
    handleNoTagsFound();
    return;
  }

  console.log('Tags encontradas:', tags);

  const releaseResults = processAllTags(tags);
  const statistics = calculateStatistics(tags, releaseResults);

  writeStatisticsToSummary(statistics);
  handleExecutionResult(releaseResults, statistics);
}

// ============================================================================
// TAG DETECTION
// ============================================================================

/**
 * Detects all git tags pointing at the current HEAD commit.
 * Executes git command and parses the output into a list of tag names.
 *
 * @returns {string[]} List of tag names at HEAD (empty array if none found)
 * @throws {Error} If git command execution fails
 */
function detectTagsAtHead() {
  try {
    const output = executeGitTagDetection();
    const tags = parseTagOutput(output);
    return tags;
  } catch (error) {
    console.error('❌ Error detecting tags:', error.message);
    throw error;
  }
}

/**
 * Executes the git tag detection command.
 * Command is fixed with no user input interpolation - safe from injection attacks.
 *
 * @returns {string} Raw output from git tag command
 * @throws {Error} If command execution fails
 */
function executeGitTagDetection() {
  return execSync(GIT_TAG_DETECTION_COMMAND, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

/**
 * Parses git tag command output into individual tag names.
 * Filters out empty lines and trims whitespace.
 *
 * @param {string} output - Raw git command output
 * @returns {string[]} List of cleaned tag names
 */
function parseTagOutput(output) {
  return output
    .trim()
    .split('\n')
    .filter(Boolean);
}

// ============================================================================
// RELEASE FILTERING
// ============================================================================

/**
 * Determines if a tag should have a GitHub release created.
 * Only application packages (docs, web) should have releases.
 *
 * @param {string} tag - Tag name to check
 * @returns {boolean} True if release should be created
 *
 * @example
 *   shouldCreateRelease('docs@1.0.0')  // true
 *   shouldCreateRelease('web@2.1.0')   // true
 *   shouldCreateRelease('ui@1.0.0')    // false
 *   shouldCreateRelease('@repo/pkg@1') // false
 */
function shouldCreateRelease(tag) {
  return RELEASE_APP_PREFIXES.some(prefix => tag.startsWith(prefix));
}

/**
 * Classifies a tag as application or non-application package.
 *
 * @param {string} tag - Tag name to classify
 * @returns {'app' | 'non-app'} Classification result
 */
function classifyTag(tag) {
  return shouldCreateRelease(tag) ? 'app' : 'non-app';
}

// ============================================================================
// RELEASE CREATION
// ============================================================================

/**
 * Processes all tags and attempts to create releases.
 * Handles creation, skipping, and failure cases for each tag.
 *
 * @param {string[]} tags - List of tags to process
 * @returns {ReleaseResult} Results of release creation attempts
 */
function processAllTags(tags) {
  const results = {
    created: [],
    skipped: [],
    failed: []
  };

  for (const tag of tags) {
    const attempt = attemptReleaseCreation(tag);
    categorizeReleaseAttempt(tag, attempt, results);
    logReleaseAttemptToSummary(tag, attempt);
  }

  return results;
}

/**
 * Attempts to create a GitHub release for a single tag.
 * Checks if tag qualifies for release before attempting creation.
 *
 * @param {string} tag - Tag name to create release for
 * @returns {ReleaseAttempt} Result of release attempt
 */
function attemptReleaseCreation(tag) {
  if (!shouldCreateRelease(tag)) {
    return {
      tag,
      success: false,
      skipped: true
    };
  }

  try {
    console.log(`✅ Criando release para ${tag}`);
    executeReleaseCreation(tag);
    return {
      tag,
      success: true
    };
  } catch (error) {
    console.error(`❌ Erro ao criar release para ${tag}:`, error.message);
    return {
      tag,
      success: false,
      error: extractErrorMessage(error)
    };
  }
}

/**
 * Executes the GitHub CLI command to create a release.
 * Uses auto-generated release notes from GitHub.
 *
 * @param {string} tag - Tag name for the release
 * @throws {Error} If gh command execution fails
 */
function executeReleaseCreation(tag) {
  execSync(`gh release create "${tag}" --generate-notes`, {
    stdio: 'pipe',
    encoding: 'utf-8'
  });
}

/**
 * Extracts a clean error message from an error object.
 * Returns the first line of the error message to avoid verbose output.
 *
 * @param {Error} error - Error object
 * @returns {string} Cleaned error message
 */
function extractErrorMessage(error) {
  return error.message.split('\n')[0];
}

/**
 * Categorizes a release attempt into the appropriate result bucket.
 *
 * @param {string} tag - Tag name
 * @param {ReleaseAttempt} attempt - Release attempt result
 * @param {ReleaseResult} results - Results object to update
 */
function categorizeReleaseAttempt(tag, attempt, results) {
  if (attempt.success) {
    results.created.push(tag);
  } else if (attempt.skipped) {
    results.skipped.push(tag);
    console.log(`⏭️  Ignorando release para ${tag} (não é app)`);
  } else {
    results.failed.push(tag);
  }
}

// ============================================================================
// URL GENERATION
// ============================================================================

/**
 * Generates a GitHub release URL for a given tag.
 * URL is properly encoded to handle special characters in tags.
 *
 * @param {string} tag - Tag name
 * @returns {string} Full GitHub release URL
 *
 * @example
 *   generateTagUrl('docs@1.0.0')
 *   // Returns: 'https://github.com/owner/repo/releases/tag/docs%401.0.0'
 */
function generateTagUrl(tag) {
  return `https://github.com/${GITHUB_REPOSITORY}/releases/tag/${encodeURIComponent(tag)}`;
}

// ============================================================================
// STATISTICS CALCULATION
// ============================================================================

/**
 * Calculates execution statistics from release results.
 * Includes timing information and categorized counts.
 *
 * @param {string[]} tags - Original list of tags
 * @param {ReleaseResult} results - Results of release creation
 * @returns {ReleaseStatistics} Calculated statistics
 */
function calculateStatistics(tags, results) {
  const duration = calculateExecutionDuration();

  return {
    totalTags: tags.length,
    created: results.created.length,
    skipped: results.skipped.length,
    failed: results.failed.length,
    duration
  };
}

/**
 * Calculates script execution duration in seconds.
 *
 * @returns {string} Duration formatted to one decimal place
 */
function calculateExecutionDuration() {
  const milliseconds = Date.now() - SCRIPT_START_TIME;
  const seconds = milliseconds / 1000;
  return seconds.toFixed(1);
}

// ============================================================================
// GITHUB ACTIONS INTEGRATION
// ============================================================================

/**
 * Initializes the GitHub Actions step summary with header.
 * Creates the initial summary section for release information.
 */
function initializeGitHubStepSummary() {
  appendToStepSummary('## 🚀 GitHub Releases Created');
  appendToStepSummary('');
}

/**
 * Appends content to the GitHub Actions step summary file.
 * No-op if GITHUB_STEP_SUMMARY environment variable is not set.
 *
 * @param {string} content - Content to append
 */
function appendToStepSummary(content) {
  if (GITHUB_STEP_SUMMARY) {
    appendFileSync(GITHUB_STEP_SUMMARY, content + '\n');
  }
}

/**
 * Logs a release attempt result to the GitHub Actions step summary.
 * Formats output with appropriate emoji and link/context.
 *
 * @param {string} tag - Tag name
 * @param {ReleaseAttempt} attempt - Release attempt result
 */
function logReleaseAttemptToSummary(tag, attempt) {
  let summaryLine;

  if (attempt.success) {
    const tagUrl = generateTagUrl(tag);
    summaryLine = `- ✅ [${tag}](${tagUrl})`;
  } else if (attempt.skipped) {
    summaryLine = `- ⏭️ ${tag} (skipped: not an app)`;
  } else {
    summaryLine = `- ❌ ${tag} (failed: ${attempt.error})`;
  }

  appendToStepSummary(summaryLine);
}

/**
 * Writes execution statistics to the GitHub Actions step summary.
 * Creates a formatted statistics section with counts and duration.
 *
 * @param {ReleaseStatistics} stats - Statistics to write
 */
function writeStatisticsToSummary(stats) {
  appendToStepSummary('');
  appendToStepSummary('---');
  appendToStepSummary('### 📊 Statistics');
  appendToStepSummary(`- **Total Tags**: ${stats.totalTags}`);
  appendToStepSummary(`- **Releases Created**: ${stats.created}`);
  appendToStepSummary(`- **Skipped**: ${stats.skipped}`);
  appendToStepSummary(`- **Failed**: ${stats.failed}`);
  appendToStepSummary(`- **Duration**: ${stats.duration}s`);
  appendToStepSummary('');
}

// ============================================================================
// SPECIAL CASE HANDLING
// ============================================================================

/**
 * Handles the case when no tags are found at HEAD.
 * Logs informational message and creates summary entry, then exits gracefully.
 */
function handleNoTagsFound() {
  console.log('Nenhuma tag encontrada no HEAD, saindo sem criar releases.');

  appendToStepSummary('## 🚀 GitHub Releases');
  appendToStepSummary('');
  appendToStepSummary('**Status**: ⏭️ No tags found at HEAD');
  appendToStepSummary('');

  process.exit(0);
}

// ============================================================================
// EXECUTION RESULT HANDLING
// ============================================================================

/**
 * Handles final execution result based on release outcomes.
 * Exits with appropriate code and message.
 *
 * @param {ReleaseResult} results - Results of release creation
 * @param {ReleaseStatistics} statistics - Execution statistics
 */
function handleExecutionResult(results, statistics) {
  if (results.failed.length > 0) {
    handleFailedReleases(results.failed);
  } else {
    handleSuccessfulExecution(statistics.created);
  }
}

/**
 * Handles execution when releases failed.
 * Logs error message and exits with error code.
 *
 * @param {string[]} failedTags - List of tags that failed
 */
function handleFailedReleases(failedTags) {
  console.error(`\n❌ ${failedTags.length} release(s) failed`);
  process.exit(1);
}

/**
 * Handles successful execution with all releases created.
 * Logs success message and exits with success code.
 *
 * @param {number} createdCount - Number of releases created
 */
function handleSuccessfulExecution(createdCount) {
  console.log(`\n✅ Successfully created ${createdCount} release(s)`);
  process.exit(0);
}

// ============================================================================
// SCRIPT EXECUTION
// ============================================================================

/**
 * Executes the main function with error handling.
 * Catches and logs any unexpected errors, then exits with error code.
 */
try {
  main();
} catch (error) {
  console.error('❌ Fatal error in release creation:', error.message);
  console.error(error.stack);
  process.exit(1);
}
