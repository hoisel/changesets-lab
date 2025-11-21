#!/usr/bin/env node

/**
 * @file generate-auto-changeset.mjs
 * @description Automatically generates changesets for affected packages in a pull request.
 * Uses Turbo to detect affected packages and creates a changeset file with proper versioning.
 *
 * @example
 *   # Basic usage with PR title
 *   node scripts/generate-auto-changeset.mjs "Add new feature"
 *
 *   # In CI environment with PR metadata
 *   PR_NUMBER=123 GITHUB_REPOSITORY=owner/repo node scripts/generate-auto-changeset.mjs "Fix bug"
 *
 * @requires pnpm - Package manager with turbo installed
 * @requires turbo - Monorepo build system for detecting affected packages
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// CONFIGURATION - Customize these values
// ============================================================================

/**
 * Version bump type for affected packages.
 * @type {'major' | 'minor' | 'patch'}
 * @customization Change this to control the semantic version bump level
 */
const BUMP_TYPE = 'minor';

/**
 * Package name patterns to exclude from changeset generation.
 * Config and tooling packages typically don't need version bumps.
 * @type {string[]}
 * @customization Add patterns to exclude specific package types
 */
const EXCLUDED_PATTERNS = [
  'typescript-config',
  'eslint-config',
];

/**
 * Turbo command configuration.
 * @type {string}
 * @constant
 */
const TURBO_DETECT_COMMAND = 'pnpm turbo ls --affected --output json';

// ============================================================================
// TYPES (JSDoc type definitions)
// ============================================================================

/**
 * @typedef {Object} TurboPackage
 * @property {string} name - Package name
 * @property {string} [version] - Package version
 * @property {string} [path] - Package path
 */

/**
 * @typedef {Object} TurboResult
 * @property {Object} packages - Packages information
 * @property {number} packages.count - Number of affected packages
 * @property {TurboPackage[]} packages.items - List of affected packages
 */

/**
 * @typedef {Object} EnvironmentConfig
 * @property {string} prTitle - Pull request title for changeset description
 * @property {string} prNumber - Pull request number for reference linking
 * @property {string} githubRepo - GitHub repository in owner/repo format
 */

// ============================================================================
// CORE LOGIC
// ============================================================================

/**
 * Main entry point for changeset generation.
 * Orchestrates the entire workflow: detection, filtering, and file creation.
 *
 * @throws {Error} If changeset generation fails
 */
function main() {
  const config = extractEnvironmentConfig();

  console.log('🔍 Detecting affected packages...');

  const affectedPackages = detectAffectedPackages();

  if (affectedPackages.length === 0) {
    logInfoAndExit('No affected packages found. Skipping changeset generation.');
  }

  const includedPackages = filterExcludedPackages(affectedPackages);

  if (includedPackages.length === 0) {
    logInfoAndExit('All affected packages are excluded (config/tooling). Skipping changeset generation.');
  }

  logIncludedPackages(includedPackages);

  const changesetContent = buildChangesetContent(includedPackages, config);
  const changesetPath = createChangesetFile(changesetContent);

  logSuccessMessage(changesetPath, changesetContent);
}

// ============================================================================
// CONFIGURATION EXTRACTION
// ============================================================================

/**
 * Extracts and validates configuration from command-line arguments and environment.
 *
 * @returns {EnvironmentConfig} Configuration object with PR metadata
 */
function extractEnvironmentConfig() {
  return {
    prTitle: process.argv[2] || 'Update affected packages',
    prNumber: process.env.PR_NUMBER || '',
    githubRepo: process.env.GITHUB_REPOSITORY || '',
  };
}

// ============================================================================
// PACKAGE DETECTION
// ============================================================================

/**
 * Detects affected packages using Turbo's change detection.
 * Executes `turbo ls --affected` and parses the JSON output.
 *
 * @returns {TurboPackage[]} List of affected packages
 * @throws {Error} Silently exits with code 0 if detection fails (no affected packages)
 */
function detectAffectedPackages() {
  try {
    const output = executeTurboDetection();
    const result = parseTurboOutput(output);
    const packages = extractPackagesFromResult(result);

    console.log(`   Found ${packages.length} affected package(s)`);

    return packages;
  } catch (error) {
    logWarningAndExit(
      `Could not detect affected packages: ${error.message}`,
      'This might mean no packages are affected. Exiting gracefully.'
    );
  }
}

/**
 * Executes the Turbo detection command.
 * Command is fixed with no user input interpolation - safe from injection attacks.
 *
 * @returns {string} Raw JSON output from Turbo
 * @throws {Error} If command execution fails
 */
function executeTurboDetection() {
  return execSync(TURBO_DETECT_COMMAND, {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

/**
 * Parses Turbo's JSON output into a structured result.
 *
 * @param {string} output - Raw JSON string from Turbo
 * @returns {TurboResult} Parsed Turbo result
 * @throws {SyntaxError} If JSON parsing fails
 */
function parseTurboOutput(output) {
  return JSON.parse(output);
}

/**
 * Extracts package list from parsed Turbo result.
 * Handles Turbo's nested structure: { packages: { count: N, items: [...] } }
 *
 * @param {TurboResult} result - Parsed Turbo output
 * @returns {TurboPackage[]} List of affected packages
 */
function extractPackagesFromResult(result) {
  return result.packages?.items || [];
}

// ============================================================================
// PACKAGE FILTERING
// ============================================================================

/**
 * Filters out packages matching exclusion patterns.
 * Config and tooling packages are typically excluded from changesets.
 *
 * @param {TurboPackage[]} packages - List of affected packages
 * @returns {TurboPackage[]} Filtered list with exclusions removed
 */
function filterExcludedPackages(packages) {
  return packages.filter(pkg => {
    if (shouldExcludePackage(pkg)) {
      console.log(`   ⊘ Excluding config package: ${pkg.name}`);
      return false;
    }
    return true;
  });
}

/**
 * Determines if a package should be excluded based on configured patterns.
 *
 * @param {TurboPackage} pkg - Package to check
 * @returns {boolean} True if package matches any exclusion pattern
 */
function shouldExcludePackage(pkg) {
  return EXCLUDED_PATTERNS.some(pattern => pkg.name.includes(pattern));
}

// ============================================================================
// CHANGESET GENERATION
// ============================================================================

/**
 * Builds the complete changeset file content.
 * Combines YAML frontmatter with markdown body including PR reference.
 *
 * @param {TurboPackage[]} packages - Packages to include in changeset
 * @param {EnvironmentConfig} config - PR metadata configuration
 * @returns {string} Complete changeset content ready for file writing
 */
function buildChangesetContent(packages, config) {
  const yamlFrontmatter = generateYamlFrontmatter(packages);
  const prReference = formatPullRequestReference(config.prNumber, config.githubRepo);
  const description = config.prTitle;

  return assembleChangesetDocument(yamlFrontmatter, prReference, description);
}

/**
 * Generates YAML frontmatter with package version bumps.
 * Format: "package-name": bump-type
 *
 * @param {TurboPackage[]} packages - Packages to include
 * @returns {string} YAML frontmatter content
 */
function generateYamlFrontmatter(packages) {
  const yamlLines = packages.map(pkg => `"${pkg.name}": ${BUMP_TYPE}`);
  return yamlLines.join('\n');
}

/**
 * Formats a pull request reference with optional GitHub link.
 * Creates clickable link if repository information is available.
 *
 * @param {string} prNumber - Pull request number
 * @param {string} githubRepo - GitHub repository (owner/repo format)
 * @returns {string} Formatted PR reference or empty string
 *
 * @example
 *   formatPullRequestReference('123', 'owner/repo')
 *   // Returns: "[#123](https://github.com/owner/repo/pull/123)\n\n"
 */
function formatPullRequestReference(prNumber, githubRepo) {
  if (!prNumber) {
    return '';
  }

  if (githubRepo) {
    const prUrl = `https://github.com/${githubRepo}/pull/${prNumber}`;
    return `[#${prNumber}](${prUrl})\n\n`;
  }

  // Fallback: GitHub auto-links #123 format
  return `#${prNumber}\n\n`;
}

/**
 * Assembles the final changeset document from components.
 *
 * @param {string} yamlFrontmatter - Package version bumps in YAML format
 * @param {string} prReference - Formatted PR reference
 * @param {string} description - PR title or description
 * @returns {string} Complete changeset document
 *
 * @customization Modify the template structure here to change changeset format
 */
function assembleChangesetDocument(yamlFrontmatter, prReference, description) {
  return `---
${yamlFrontmatter}
---

${prReference}${description}
`;
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

/**
 * Creates a changeset file with unique timestamp-based name.
 * Writes content to .changeset directory in project root.
 *
 * @param {string} content - Complete changeset content to write
 * @returns {string} Relative path to created changeset file
 * @throws {Error} If file writing fails
 */
function createChangesetFile(content) {
  const fileName = generateChangesetFileName();
  const filePath = buildChangesetFilePath(fileName);

  writeFileSync(filePath, content, 'utf-8');

  return `.changeset/${fileName}`;
}

/**
 * Generates a unique changeset filename using timestamp.
 * Format: auto-{timestamp}.md
 *
 * @returns {string} Unique changeset filename
 */
function generateChangesetFileName() {
  const timestamp = Date.now();
  return `auto-${timestamp}.md`;
}

/**
 * Builds the absolute path to the changeset file.
 *
 * @param {string} fileName - Changeset filename
 * @returns {string} Absolute file path
 */
function buildChangesetFilePath(fileName) {
  return join(process.cwd(), '.changeset', fileName);
}

// ============================================================================
// LOGGING AND OUTPUT
// ============================================================================

/**
 * Logs information message and exits with success code.
 *
 * @param {string} message - Information message to display
 */
function logInfoAndExit(message) {
  console.log(`ℹ️  ${message}`);
  process.exit(0);
}

/**
 * Logs warning message with additional context and exits gracefully.
 *
 * @param {string} warning - Warning message to display
 * @param {string} context - Additional context information
 */
function logWarningAndExit(warning, context) {
  console.log(`⚠️  ${warning}`);
  console.log(`ℹ️  ${context}`);
  process.exit(0);
}

/**
 * Logs the list of packages included in the changeset.
 *
 * @param {TurboPackage[]} packages - Packages to log
 */
function logIncludedPackages(packages) {
  console.log(`✅ ${packages.length} package(s) will be included in changeset:`);
  packages.forEach(pkg => {
    console.log(`   • ${pkg.name}`);
  });
}

/**
 * Logs success message with changeset details.
 *
 * @param {string} filePath - Relative path to created changeset file
 * @param {string} content - Changeset content for preview
 */
function logSuccessMessage(filePath, content) {
  console.log('');
  console.log('🎉 Changeset generated successfully!');
  console.log(`   File: ${filePath}`);
  console.log('');
  console.log('📄 Changeset content:');
  console.log('─────────────────────────────────────');
  console.log(content);
  console.log('─────────────────────────────────────');
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
  console.error('❌ Error generating changeset:', error.message);
  console.error(error.stack);
  process.exit(1);
}
