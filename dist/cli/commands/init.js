"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCommand = void 0;
exports.selectInstallationDirectory = selectInstallationDirectory;
exports.validateInstallationDirectory = validateInstallationDirectory;
exports.getPodInformation = getPodInformation;
exports.analyzeTechStackWithContext = analyzeTechStackWithContext;
exports.updateGitHubCopilotInstructions = updateGitHubCopilotInstructions;
const commander_1 = require("commander");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const chalk_1 = __importDefault(require("chalk"));
const ora_1 = __importDefault(require("ora"));
const inquirer_1 = __importDefault(require("inquirer"));
const CoreSystemManager_1 = require("../../core/CoreSystemManager");
const LayerManager_1 = require("../../core/LayerManager");
const RuntimeConfigManager_1 = require("../../core/RuntimeConfigManager");
const GitHubCopilotManager_1 = require("../../core/GitHubCopilotManager");
const MetadataGenerator_1 = require("../../core/MetadataGenerator");
const techStacker_1 = require("../../utils/techStacker");
const repositoryConfig = require('../../../config/repository.json');
const repoUrl = repositoryConfig.repository.url;
/**
 * Ask user for installation directory
 */
async function selectInstallationDirectory() {
    console.log(chalk_1.default.blue('\n🎯 LCAgents Installation Setup'));
    console.log(chalk_1.default.gray('First, let\'s determine where to install LCAgents.\n'));
    const { installChoice } = await inquirer_1.default.prompt([
        {
            type: 'list',
            name: 'installChoice',
            message: 'Where would you like to install LCAgents?',
            choices: [
                { name: '📁 Current directory', value: 'current' },
                { name: '📂 Select a different directory', value: 'custom' },
                { name: '🏠 Home directory', value: 'home' }
            ]
        }
    ]);
    let installPath;
    switch (installChoice) {
        case 'current':
            installPath = process.cwd();
            break;
        case 'home':
            installPath = os.homedir();
            break;
        case 'custom':
            const { customPath } = await inquirer_1.default.prompt([
                {
                    type: 'input',
                    name: 'customPath',
                    message: 'Enter the full path to the directory:',
                    validate: (input) => {
                        if (!input.trim())
                            return 'Path cannot be empty';
                        return true;
                    }
                }
            ]);
            installPath = path.resolve(customPath.trim());
            break;
        default:
            installPath = process.cwd();
    }
    console.log(chalk_1.default.gray(`\n📍 Selected installation path: ${installPath}`));
    return installPath;
}
/**
 * Validate directory for LCAgents installation
 */
async function validateInstallationDirectory(installPath) {
    const spinner = (0, ora_1.default)('🔍 Validating directory structure...').start();
    try {
        // Check if directory exists
        if (!await fs.pathExists(installPath)) {
            spinner.fail(chalk_1.default.red('Directory does not exist'));
            console.log(chalk_1.default.red(`❌ The specified directory does not exist: ${installPath}`));
            process.exit(1);
        }
        // Check if directory is readable
        try {
            await fs.access(installPath, fs.constants.R_OK);
        }
        catch (error) {
            spinner.fail(chalk_1.default.red('Directory is not readable'));
            console.log(chalk_1.default.red(`❌ Cannot read directory: ${installPath}`));
            process.exit(1);
        }
        // Check if directory has any files (empty directory check)
        const files = await fs.readdir(installPath);
        if (files.length === 0) {
            spinner.fail(chalk_1.default.red('Directory is empty'));
            console.log(chalk_1.default.yellow(`\n⚠️  The selected directory is empty.`));
            console.log(chalk_1.default.gray('Please select a directory with source code files to proceed with installation.\n'));
            process.exit(1);
        }
        // Check for basic project indicators (at least some code files should exist)
        const codeFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.js', '.ts', '.py', '.java', '.go', '.rb', '.php', '.cs', '.cpp', '.c', '.json', '.yaml', '.yml', '.md'].includes(ext);
        });
        if (codeFiles.length === 0) {
            spinner.fail(chalk_1.default.red('No source files detected'));
            console.log(chalk_1.default.yellow(`\n⚠️  No recognizable source code files found in directory.`));
            console.log(chalk_1.default.gray('Please select a directory that contains a software project.\n'));
            process.exit(1);
        }
        spinner.succeed(chalk_1.default.green('Directory validation completed'));
        console.log(chalk_1.default.green(`✅ Directory is suitable for LCAgents installation`));
        console.log(chalk_1.default.gray(`   Found ${files.length} files including ${codeFiles.length} source files\n`));
    }
    catch (error) {
        spinner.fail(chalk_1.default.red('Failed to validate directory'));
        console.error(chalk_1.default.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
    }
}
/**
 * Get pod information from user
 */
async function getPodInformation() {
    console.log(chalk_1.default.blue('🏢 Pod Assignment'));
    console.log(chalk_1.default.gray('Assign this repository to an organizational pod for better management.\n'));
    return await (0, techStacker_1.selectPod)();
}
/**
 * Analyze tech stack and get repository information
 */
async function analyzeTechStackWithContext(installPath, podInfo) {
    const spinner = (0, ora_1.default)('🔍 Analyzing project technology stack...').start();
    try {
        // Set pod context before analysis
        const techStackData = await (0, techStacker_1.analyzeTechStack)(installPath, podInfo);
        if (techStackData.noTechStack) {
            spinner.warn(chalk_1.default.yellow('Limited technology stack detected'));
            console.log(chalk_1.default.yellow(`\n⚠️  ${techStackData.message}`));
            const { proceedAnyway } = await inquirer_1.default.prompt([
                {
                    type: 'confirm',
                    name: 'proceedAnyway',
                    message: 'Do you want to proceed with LCAgents installation anyway?',
                    default: false
                }
            ]);
            if (!proceedAnyway) {
                console.log(chalk_1.default.gray('\n👋 Installation cancelled. Please ensure your project has recognizable tech stack files.\n'));
                process.exit(0);
            }
        }
        else {
            spinner.succeed(chalk_1.default.green('Tech stack analysis completed'));
            console.log(chalk_1.default.blue('\n📊 Detected Technology Stack:'));
            console.log(chalk_1.default.white(`   Primary: ${techStackData.primaryStack || techStackData.stack}`));
            if (techStackData.allStacks && techStackData.allStacks.length > 1) {
                console.log(chalk_1.default.cyan(`   Additional: ${techStackData.allStacks.filter(s => s !== (techStackData.primaryStack || techStackData.stack)).join(', ')}`));
            }
            if (techStackData.frameworks.length > 0) {
                console.log(chalk_1.default.magenta(`   Frameworks: ${techStackData.frameworks.join(', ')}`));
            }
            if (techStackData.buildTools.length > 0) {
                console.log(chalk_1.default.yellow(`   Build Tools: ${techStackData.buildTools.join(', ')}`));
            }
            console.log(chalk_1.default.green('\n✅ Technology stack analysis completed!'));
        }
        return techStackData;
    }
    catch (error) {
        spinner.fail(chalk_1.default.red('Failed to analyze tech stack'));
        console.error(chalk_1.default.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
    }
}
/**
 * Update GitHub Copilot instructions with LCAgents information
 */
async function updateGitHubCopilotInstructions(installPath, podInfo, techStackData) {
    const spinner = (0, ora_1.default)('📝 Updating GitHub Copilot instructions...').start();
    try {
        const copilotManager = new GitHubCopilotManager_1.GitHubCopilotManager(installPath);
        await copilotManager.updateCopilotInstructions({
            projectPath: installPath,
            podInfo,
            techStack: techStackData.allStacks || [techStackData.stack].filter(Boolean)
        });
        spinner.succeed(chalk_1.default.green('GitHub Copilot instructions updated'));
        console.log(chalk_1.default.blue('\n📋 GitHub Copilot Integration:'));
        console.log(chalk_1.default.white('   ✅ LCAgents information added to .github/copilot-instructions.md'));
        console.log(chalk_1.default.cyan('   🤖 GitHub Copilot now has context about available agents'));
        console.log(chalk_1.default.dim('   💡 Use @lcagents activate <agent> to start working with specialized agents'));
        console.log();
    }
    catch (error) {
        spinner.fail(chalk_1.default.red('Failed to update GitHub Copilot instructions'));
        console.error(chalk_1.default.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
        // Don't exit - this is not critical for installation
        console.log(chalk_1.default.yellow('⚠️  Installation will continue without GitHub Copilot integration'));
        console.log();
    }
}
/**
 * Setup shell alias for lcagent command
 */
async function setupShellAlias() {
    try {
        const homeDir = os.homedir();
        const shell = process.env['SHELL'] || '';
        // Determine which shell config file to use
        let configFile = '';
        let shellName = '';
        if (shell.includes('zsh')) {
            configFile = path.join(homeDir, '.zshrc');
            shellName = 'zsh';
        }
        else if (shell.includes('bash')) {
            // Check for .bash_profile first, then .bashrc
            const bashProfile = path.join(homeDir, '.bash_profile');
            const bashrc = path.join(homeDir, '.bashrc');
            if (await fs.pathExists(bashProfile)) {
                configFile = bashProfile;
            }
            else {
                configFile = bashrc;
            }
            shellName = 'bash';
        }
        else {
            return {
                success: false,
                message: 'Unsupported shell detected',
                instructions: `Manually add: alias lcagent="npx git+${repoUrl}"`
            };
        }
        const aliasCommand1 = `alias lcagent="npx git+${repoUrl}"`;
        const aliasCommand2 = `alias lcagents="npx git+${repoUrl}"`;
        const aliasComment = '# LCAgents aliases for easy access';
        // Check if alias already exists
        if (await fs.pathExists(configFile)) {
            const content = await fs.readFile(configFile, 'utf-8');
            if (content.includes('alias lcagent=') && content.includes('alias lcagents=')) {
                return {
                    success: true,
                    message: 'Aliases already exist in shell configuration'
                };
            }
        }
        // Add aliases to shell config
        const aliasEntry = `\n${aliasComment}\n${aliasCommand1}\n${aliasCommand2}\n`;
        await fs.ensureFile(configFile);
        await fs.appendFile(configFile, aliasEntry);
        // Create activation script for immediate alias availability
        try {
            const tempScript = path.join(os.tmpdir(), 'lcagents-activate.sh');
            const activateScript = `#!/bin/bash
# LCAgents alias activation script
source ${configFile}
alias lcagent="npx git+${repoUrl}"
alias lcagents="npx git+${repoUrl}"
echo "✅ LCAgents aliases activated in current session"
# Clean up this temporary script
rm -f "${tempScript}"
`;
            await fs.writeFile(tempScript, activateScript, { mode: 0o755 });
            // Show clear activation instructions with immediate execution option
            console.log(chalk_1.default.green('✅ LCAgents aliases configured in shell!'));
            console.log(chalk_1.default.yellow('💡 To activate immediately in this terminal:'));
            console.log(chalk_1.default.cyan(`   source ${tempScript}`));
            console.log(chalk_1.default.dim('   (or restart your terminal for automatic activation)'));
            console.log();
            return {
                success: true,
                message: `Aliases added to ${shellName} configuration`,
                instructions: `Execute: source ${tempScript} for immediate activation`
            };
        }
        catch (error) {
            return {
                success: true,
                message: `Aliases added to ${shellName} configuration`,
                instructions: `Run 'source ${path.basename(configFile)}' or restart your terminal to use 'lcagent' and 'lcagents' commands`
            };
        }
    }
    catch (error) {
        return {
            success: false,
            message: 'Failed to setup shell alias',
            instructions: `Manually add: alias lcagent="npx git+${repoUrl}"`
        };
    }
}
exports.initCommand = new commander_1.Command('init')
    .description('Initialize LCAgents in the current directory')
    .option('-f, --force', 'Overwrite existing installation')
    .option('--no-github', 'Skip GitHub integration setup')
    .option('--template <name>', 'Use specific project template')
    .option('--no-interactive', 'Skip interactive prompts')
    .option('--core-system <name>', 'Specify core system to install (default: bmad-core)')
    .action(async (options) => {
    // Show version info during install
    const packageJson = require('../../../package.json');
    console.log(chalk_1.default.cyan('🔧 LCAgents Installer'));
    console.log(chalk_1.default.gray(`github:jmaniLC/lcagents ver${packageJson.version}`));
    console.log();
    const spinner = (0, ora_1.default)('Initializing LCAgents...').start();
    try {
        // Step 1: Get directory
        spinner.stop();
        const installPath = await selectInstallationDirectory();
        // Step 2: Validate directory source (if error, fail the installer)
        await validateInstallationDirectory(installPath);
        // Step 3: Get the pod name  
        const podInfo = await getPodInformation();
        // Step 4: Analyze tech stack
        const techStackData = await analyzeTechStackWithContext(installPath, podInfo);
        const lcagentsDir = path.join(installPath, '.lcagents');
        // Check if already initialized
        if (await fs.pathExists(lcagentsDir) && !options.force) {
            console.log(chalk_1.default.red('❌ LCAgents already initialized in this directory'));
            console.log(chalk_1.default.yellow('Use --force to overwrite existing installation'));
            return;
        }
        spinner.start('Setting up LCAgents...');
        // Initialize managers
        const coreSystemManager = new CoreSystemManager_1.CoreSystemManager(installPath);
        const layerManager = new LayerManager_1.LayerManager(installPath);
        const runtimeConfigManager = new RuntimeConfigManager_1.RuntimeConfigManager(installPath);
        let selectedCoreSystem = options.coreSystem;
        // Interactive core system selection if not specified
        if (!selectedCoreSystem && options.interactive !== false) {
            const availableSystems = await coreSystemManager.getAvailableCoreSystems();
            if (availableSystems.length === 0) {
                console.log(chalk_1.default.red('No core systems available in registry'));
                process.exit(1);
            }
            console.log();
            console.log(chalk_1.default.cyan('🔧 Core Agent System Selection'));
            console.log(chalk_1.default.dim('Choose the core agent system that best fits your team and project needs:'));
            console.log();
            // Display available systems
            availableSystems.forEach((system, index) => {
                console.log(chalk_1.default.white(`${index + 1}. ${chalk_1.default.bold(system.name)} (v${system.version})`));
                console.log(chalk_1.default.dim(`   ${system.description}`));
                console.log(chalk_1.default.dim(`   ${system.agentCount} agents | ${system.installation.estimatedTime} | ${system.installation.diskSpace}`));
                if (system.isDefault) {
                    console.log(chalk_1.default.green('   ✅ Recommended for most teams'));
                }
                // Add development warnings for non-ready systems
                if (system.name === 'enterprise-core' || system.name === 'minimal-core') {
                    console.log(chalk_1.default.red('   ⚠️  [DEV MODE] - Not ready for production use'));
                }
                console.log();
            });
            const { coreSystemChoice } = await inquirer_1.default.prompt([
                {
                    type: 'list',
                    name: 'coreSystemChoice',
                    message: 'Select a core agent system:',
                    choices: availableSystems.map((system) => {
                        let warningText = '';
                        if (system.name === 'enterprise-core') {
                            warningText = chalk_1.default.red(' [NOT READY]');
                        }
                        else if (system.name === 'minimal-core') {
                            warningText = chalk_1.default.red(' [DEV MODE]');
                        }
                        return {
                            name: `${system.name} - ${system.description}${system.isDefault ? ' (Recommended)' : ''}${warningText}`,
                            value: system.name,
                            short: system.name
                        };
                    }),
                    default: availableSystems.find(s => s.isDefault)?.name || availableSystems[0]?.name
                }
            ]);
            selectedCoreSystem = coreSystemChoice;
            // Show selected system details
            const selectedSystemInfo = availableSystems.find(s => s.name === selectedCoreSystem);
            if (selectedSystemInfo) {
                console.log();
                console.log(chalk_1.default.green(`✅ Selected: ${chalk_1.default.bold(selectedSystemInfo.name)}`));
                console.log(chalk_1.default.dim(`Description: ${selectedSystemInfo.description}`));
                console.log(chalk_1.default.dim(`Features: ${selectedSystemInfo.features.join(', ')}`));
                console.log();
            }
        }
        // Use default if still not selected
        if (!selectedCoreSystem) {
            selectedCoreSystem = await coreSystemManager.getDefaultCoreSystem();
        }
        const installationOptions = {
            force: options.force,
            coreSystem: selectedCoreSystem,
            interactive: options.interactive,
            skipGithub: !options.github,
            template: options.template
        };
        // Stop the setup spinner before starting installation
        spinner.stop();
        const result = await performLayeredInstallation(installPath, installationOptions, coreSystemManager, layerManager, runtimeConfigManager);
        if (!result.success) {
            console.log(chalk_1.default.red('❌ Installation failed:'), result.error);
            process.exit(1);
        }
        // Update runtime config with tech stack information
        if (techStackData && !techStackData.isEmpty && !techStackData.noTechStack) {
            await runtimeConfigManager.updateRuntimeConfig({
                techStack: {
                    primary: techStackData.primaryStack,
                    all: techStackData.allStacks,
                    frameworks: techStackData.frameworks,
                    buildTools: techStackData.buildTools,
                    packageManagers: techStackData.packageManagers,
                    databases: techStackData.databases,
                    deployment: techStackData.deployment,
                    analyzedAt: new Date().toISOString(),
                    pod: techStackData.pod,
                    repository: techStackData.repository
                }
            });
            // Generate and save tech stack report
            const techReport = (0, techStacker_1.generateTechStackReport)(techStackData);
            if (techReport) {
                const techPreferencesPath = path.join(installPath, '.lcagents', 'core', '.bmad-core', 'data', 'technical-preferences.md');
                await fs.ensureDir(path.dirname(techPreferencesPath));
                await fs.writeFile(techPreferencesPath, techReport, 'utf-8');
            }
        }
        // Step 7: Update GitHub Copilot instructions
        await updateGitHubCopilotInstructions(installPath, podInfo, techStackData);
        console.log(chalk_1.default.green('🎉 LCAgents initialized successfully!'));
        console.log();
        // Display tech stack information
        if (techStackData && !techStackData.isEmpty && !techStackData.noTechStack) {
            console.log(chalk_1.default.blue('📊 Technology Stack Information:'));
            console.log(chalk_1.default.white(`   Primary Stack: ${techStackData.primaryStack}`));
            if (techStackData.frameworks.length > 0) {
                console.log(chalk_1.default.cyan(`   Frameworks: ${techStackData.frameworks.join(', ')}`));
            }
            console.log(chalk_1.default.blue('🏢 Pod Information:'));
            console.log(chalk_1.default.white(`   Pod: ${techStackData.pod.name} (${techStackData.pod.id})`));
            console.log(chalk_1.default.white(`   Owner: ${techStackData.pod.owner}`));
            console.log(chalk_1.default.white(`   Repository: ${techStackData.repository.name} (${techStackData.repository.isMainRepo ? 'Main' : 'Secondary'})`));
            console.log(chalk_1.default.green('   ✅ Tech stack preferences saved to technical-preferences.md'));
            console.log();
        }
        // Setup shell alias
        const aliasResult = await setupShellAlias();
        if (aliasResult.success) {
            console.log(chalk_1.default.green('🔧 Shell Alias Setup:'));
            console.log(chalk_1.default.white(`   ✅ ${aliasResult.message}`));
            if (aliasResult.instructions) {
                // Check if it's the activation script instruction
                if (aliasResult.instructions.includes('/tmp/lcagents-activate.sh')) {
                    console.log(chalk_1.default.yellow('   🚀 Quick Start:'));
                    console.log(chalk_1.default.cyan(`   ${aliasResult.instructions.split(': ')[1]}`));
                }
                else {
                    console.log(chalk_1.default.dim(`   💡 ${aliasResult.instructions}`));
                }
            }
            console.log(chalk_1.default.white('   Available commands:'), chalk_1.default.cyan('lcagent <command>'), chalk_1.default.dim('or'), chalk_1.default.cyan('lcagents <command>'));
            console.log();
        }
        else {
            console.log(chalk_1.default.yellow('⚠️  Shell Alias Setup:'));
            console.log(chalk_1.default.white(`   ⚠️  ${aliasResult.message}`));
            if (aliasResult.instructions) {
                console.log(chalk_1.default.dim(`   💡 ${aliasResult.instructions}`));
            }
            console.log();
        }
        console.log(chalk_1.default.cyan('📁 Layered Architecture Created:'));
        console.log(chalk_1.default.white(`  Core System: ${result.coreSystem} at ${path.relative(installPath, result.installedPath)}`));
        result.layersCreated.forEach(layer => {
            console.log(chalk_1.default.dim(`  ${layer} layer ready for customization`));
        });
        console.log();
        console.log(chalk_1.default.cyan('🔧 Next Steps:'));
        console.log(chalk_1.default.white('  1. Explore available agents:'), chalk_1.default.dim('ls .lcagents/agents/'));
        console.log(chalk_1.default.white('  2. View core system resources:'), chalk_1.default.dim(`ls .lcagents/core/${result.coreSystem}/`));
        console.log(chalk_1.default.white('  3. Customize agents:'), chalk_1.default.dim('edit .lcagents/custom/agents/overrides/'));
        console.log(chalk_1.default.white('  4. Configure your pod:'), chalk_1.default.dim('edit .lcagents/custom/config/pod-config.yaml'));
        console.log();
        if (result.warnings && result.warnings.length > 0) {
            console.log(chalk_1.default.yellow('⚠️  Warnings:'));
            result.warnings.forEach(warning => {
                console.log(chalk_1.default.yellow(`  • ${warning}`));
            });
            console.log();
        }
        console.log(chalk_1.default.dim('For help: lcagents --help or lcagent --help'));
    }
    catch (error) {
        // Make sure any running spinner is stopped
        if (spinner) {
            spinner.stop();
        }
        console.log(chalk_1.default.red('❌ Failed to initialize LCAgents'));
        console.error(chalk_1.default.red('Error:'), error);
        process.exit(1);
    }
});
/**
 * Perform layered installation with the new architecture
 */
async function performLayeredInstallation(basePath, options, coreSystemManager, layerManager, runtimeConfigManager) {
    const spinner = (0, ora_1.default)('Installing core agent system...').start();
    try {
        const lcagentsDir = path.join(basePath, '.lcagents');
        const coreSystemName = options.coreSystem || 'bmad-core';
        // Step 1: Clean existing installation if force
        if (options.force && await fs.pathExists(lcagentsDir)) {
            spinner.text = 'Cleaning existing installation...';
            await fs.remove(lcagentsDir);
        }
        // Step 2: Check for existing flat installation and migrate
        const hasExistingFlat = await checkForFlatInstallation(lcagentsDir);
        if (hasExistingFlat) {
            spinner.text = 'Migrating from flat structure to layered architecture...';
            await layerManager.migrateFromFlatStructure(coreSystemName);
        }
        else {
            // Step 3: Install selected core system
            spinner.text = `Installing ${coreSystemName} core system...`;
            const installResult = await coreSystemManager.installCoreSystem(coreSystemName, options.force);
            if (!installResult.success) {
                throw new Error(installResult.error);
            }
            // Step 4: Create layered directory structure
            spinner.text = 'Creating layered architecture...';
            await layerManager.createLayeredStructure();
            // Step 5: Set active core system (before virtual resolution setup)
            spinner.text = 'Configuring core system...';
            await coreSystemManager.switchCoreSystem(coreSystemName, 'Initial installation');
            // Step 6: Create backward compatibility resolution (after active core is set)
            spinner.text = 'Setting up backward compatibility...';
            await layerManager.createVirtualResolutionSystem(coreSystemName);
        }
        // Step 7: Initialize configuration
        spinner.text = 'Initializing configuration...';
        // Initialize runtime configuration with GitHub settings
        await runtimeConfigManager.updateRuntimeConfig({
            github: {
                integration: !options.skipGithub,
                copilotFeatures: !options.skipGithub,
                repository: "",
                branch: 'main'
            },
            coreSystem: {
                active: coreSystemName,
                fallback: coreSystemName
            }
        });
        // Step 8: Generate resource metadata
        spinner.text = 'Generating resource metadata...';
        try {
            await MetadataGenerator_1.MetadataGenerator.generateForInstallation(basePath);
            console.log(chalk_1.default.gray('\n✓ Resource metadata generated for creation wizards and validation'));
        }
        catch (metadataError) {
            console.log(chalk_1.default.yellow('\n⚠️  Metadata generation failed (non-critical):'), metadataError instanceof Error ? metadataError.message : String(metadataError));
        }
        spinner.succeed('Installation completed successfully!');
        return {
            success: true,
            coreSystem: coreSystemName,
            installedPath: path.join(lcagentsDir, 'core', `.${coreSystemName}`),
            layersCreated: ['Core', 'Organization', 'Pod Custom', 'Runtime'],
            configurationPath: path.join(lcagentsDir, 'runtime', 'config.yaml'),
            warnings: []
        };
    }
    catch (error) {
        spinner.fail('Installation failed');
        return {
            success: false,
            coreSystem: options.coreSystem || 'bmad-core',
            installedPath: '',
            layersCreated: [],
            configurationPath: '',
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
/**
 * Check if there's an existing flat installation
 */
async function checkForFlatInstallation(lcagentsDir) {
    if (!await fs.pathExists(lcagentsDir)) {
        return false;
    }
    // Check if it's already layered (has core directory)
    const coreDir = path.join(lcagentsDir, 'core');
    if (await fs.pathExists(coreDir)) {
        return false; // Already layered
    }
    // Check if it has flat structure (agents directory directly in .lcagents)
    const agentsDir = path.join(lcagentsDir, 'agents');
    return await fs.pathExists(agentsDir);
}
//# sourceMappingURL=init.js.map