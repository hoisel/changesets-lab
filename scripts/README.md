# Scripts Documentation

This directory contains utility scripts for the changesets-lab monorepo.

## generate-auto-changeset.mjs

Automatically generates a changeset for affected packages in a pull request.

### Purpose

When a PR is opened without a changeset, this script:
1. Detects affected packages using Turborepo
2. Filters out config/tooling packages
3. Generates a changeset with minor bumps for all affected packages
4. Uses the PR title as the changeset description

### Usage

**Via GitHub Actions** (automatic):
The workflow `.github/workflows/auto-changeset.yml` runs this automatically on PRs.

**Manual testing** (local):
```bash
# Basic usage
node scripts/generate-auto-changeset.mjs "Your PR title here"

# With PR number for metadata
PR_NUMBER=123 node scripts/generate-auto-changeset.mjs "Your PR title"

# Test affected package detection
pnpm turbo ls --affected --output json
```

### Customization

#### Change Bump Type

Edit `scripts/generate-auto-changeset.mjs`, line ~29:

```javascript
// Change from 'minor' to 'major' or 'patch'
const BUMP_TYPE = 'patch';
```

#### Modify Changeset Body Format

Edit `scripts/generate-auto-changeset.mjs`, line ~133:

```javascript
const changesetBody = `---
${yamlFrontmatter}
---

${description}

## Additional Information
- Modified by: ${process.env.GITHUB_ACTOR}
- PR: #${prNumber}
`;
```

#### Filter Different Packages

Edit `scripts/generate-auto-changeset.mjs`, line ~36:

```javascript
const EXCLUDED_PATTERNS = [
  'typescript-config',
  'eslint-config',
  'your-package-name-here', // Add your patterns
];
```

### How It Works

1. **Detect Affected Packages**: Runs `turbo ls --affected --output json`
2. **Filter Packages**: Removes config-only packages
3. **Generate YAML**: Creates frontmatter with package names and bump type
4. **Create File**: Writes changeset to `.changeset/auto-{timestamp}.md`

### Error Handling

- **No affected packages**: Exits gracefully with status 0
- **Turbo command fails**: Assumes no changes, exits gracefully
- **All packages excluded**: Skips changeset generation
- **Invalid JSON**: Reports error and exits with status 1

### Testing Locally

1. **Create a test branch**:
   ```bash
   git checkout -b test-auto-changeset
   ```

2. **Make changes to a package**:
   ```bash
   echo "// test change" >> apps/web/app/page.tsx
   git add apps/web/app/page.tsx
   git commit -m "test: trigger affected detection"
   ```

3. **Set base reference**:
   ```bash
   export BASE_REF=main
   ```

4. **Run the script**:
   ```bash
   node scripts/generate-auto-changeset.mjs "Test: auto-changeset generation"
   ```

5. **Check the generated changeset**:
   ```bash
   cat .changeset/auto-*.md
   ```

6. **Clean up**:
   ```bash
   rm .changeset/auto-*.md
   git checkout main
   git branch -D test-auto-changeset
   ```

### Troubleshooting

**Issue**: Script says "no affected packages" but I changed files

**Solution**: Ensure you have a base reference set:
```bash
export TURBO_SCM_BASE=main
export TURBO_SCM_HEAD=HEAD
pnpm turbo ls --affected --output json
```

**Issue**: Changeset not being created

**Solution**: Check if affected packages are in exclusion list:
```bash
node scripts/generate-auto-changeset.mjs "test" 2>&1 | grep "Excluding"
```

**Issue**: Workflow creates changeset but commits fail

**Solution**: Ensure PAT_TOKEN has write permissions to repository

**Issue**: Workflow loops (keeps running)

**Solution**: Verify `[skip ci]` is in commit message and workflow has proper concurrency settings

### Best Practices

1. **Test locally first**: Always test script changes locally before committing
2. **Review generated changesets**: Check auto-generated changesets match intent
3. **Manual override**: You can always add your own changeset before workflow runs
4. **Commit often**: Smaller PRs = more accurate affected package detection
5. **Clear PR titles**: They become your changeset descriptions
