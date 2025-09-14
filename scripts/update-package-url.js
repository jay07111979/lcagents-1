const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const repositoryConfigPath = path.join(__dirname, '..', 'config', 'repository.json');

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const repositoryConfig = JSON.parse(fs.readFileSync(repositoryConfigPath, 'utf-8'));

const repoUrl = repositoryConfig.repository.url.replace('.git', '');

packageJson.repository.url = repositoryConfig.repository.url;
packageJson.bugs.url = `${repoUrl}/issues`;
packageJson.homepage = `${repoUrl}#readme`;

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

console.log('✅ package.json repository URL updated successfully.');
