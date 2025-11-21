const { execSync } = require('child_process');
const fs = require('fs');

const GITHUB_STEP_SUMMARY = process.env.GITHUB_STEP_SUMMARY;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const startTime = Date.now();

function shouldCreateRelease(tag) {
    // Criar release para apps docs/web
    if (tag.startsWith('docs@') || tag.startsWith('web@')) {
        return true;
    }
    return false;
}

function appendToSummary(content) {
    if (GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(GITHUB_STEP_SUMMARY, content + '\n');
    }
}

function getTagUrl(tag) {
    return `https://github.com/${GITHUB_REPOSITORY}/releases/tag/${encodeURIComponent(tag)}`;
}

// Pegar tags criadas no último commit
const tags = execSync('git tag --points-at HEAD', { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(Boolean);

if (tags.length === 0) {
    console.log('Nenhuma tag encontrada no HEAD, saindo sem criar releases.');
    appendToSummary('## 🚀 GitHub Releases');
    appendToSummary('');
    appendToSummary('**Status**: ⏭️ No tags found at HEAD');
    appendToSummary('');
    process.exit(0);
}

console.log('Tags encontradas:', tags);

// Iniciar summary
appendToSummary('## 🚀 GitHub Releases Created');
appendToSummary('');

const releasesCreated = [];
const releasesSkipped = [];
const releasesFailed = [];

for (const tag of tags) {
    if (shouldCreateRelease(tag)) {
        try {
            console.log(`✅ Criando release para ${tag}`);
            execSync(`gh release create "${tag}" --generate-notes`, {
                stdio: 'pipe',
                encoding: 'utf-8'
            });
            releasesCreated.push(tag);
            appendToSummary(`- ✅ [${tag}](${getTagUrl(tag)})`);
        } catch (error) {
            console.error(`❌ Erro ao criar release para ${tag}:`, error.message);
            releasesFailed.push(tag);
            appendToSummary(`- ❌ ${tag} (failed: ${error.message.split('\n')[0]})`);
        }
    } else {
        console.log(`⏭️  Ignorando release para ${tag} (não é app)`);
        releasesSkipped.push(tag);
        appendToSummary(`- ⏭️ ${tag} (skipped: not an app)`);
    }
}

// Adicionar estatísticas finais
const duration = ((Date.now() - startTime) / 1000).toFixed(1);
appendToSummary('');
appendToSummary('---');
appendToSummary('### 📊 Statistics');
appendToSummary(`- **Total Tags**: ${tags.length}`);
appendToSummary(`- **Releases Created**: ${releasesCreated.length}`);
appendToSummary(`- **Skipped**: ${releasesSkipped.length}`);
appendToSummary(`- **Failed**: ${releasesFailed.length}`);
appendToSummary(`- **Duration**: ${duration}s`);
appendToSummary('');

// Exit com código apropriado
if (releasesFailed.length > 0) {
    console.error(`\n❌ ${releasesFailed.length} release(s) failed`);
    process.exit(1);
}

console.log(`\n✅ Successfully created ${releasesCreated.length} release(s)`);
