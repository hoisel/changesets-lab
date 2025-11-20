const { execSync } = require('child_process');


// Função para verificar se pacote deve gerar release
function shouldCreateRelease(tag) {
    // Apps não geram releases
    if (tag.startsWith('@apps/')) {
        return true;
    }
    return false;
}

// Pegar tags criadas no último commit
const tags = execSync('git tag --points-at HEAD', { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(Boolean);

console.log('Tags encontradas:', tags);

for (const tag of tags) {
    if (shouldCreateRelease(tag)) {
        console.log(`✅ Criando release para ${tag}`);
        execSync(`gh release create "${tag}" --generate-notes`, { stdio: 'inherit' });
    } else {
        console.log(`⏭️  Ignorando release para ${tag} (não é app)`);
    }
}
