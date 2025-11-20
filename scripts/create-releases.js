const { execSync } = require('child_process');


function shouldCreateRelease(tag) {
    // Exemplo: ignorar apps docs/web, criar release para o resto
    if (tag.startsWith('docs@') || tag.startsWith('web@')) {
        return true;
    }
    return false;
}
// Pegar tags criadas no último commit
const tags = execSync('git tag --points-at HEAD', { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .filter(Boolean);

if (tags.length === 0) {
    console.log('Nenhuma tag encontrada no HEAD, saindo sem criar releases.');
    process.exit(0);
}

console.log('Tags encontradas:', tags);

for (const tag of tags) {
    if (shouldCreateRelease(tag)) {
        console.log(`✅ Criando release para ${tag}`);
        execSync(`gh release create "${tag}" --generate-notes`, { stdio: 'inherit' });
    } else {
        console.log(`⏭️  Ignorando release para ${tag} (não é app)`);
    }
}
