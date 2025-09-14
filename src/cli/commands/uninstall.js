#!/usr/bin/env node

/**
 * LCAgents Standalone Uninstaller
 * Version: 2.2.0
 * 
 * Downloads and runs this script independently to avoid npx install prompts
 * Usage: curl -fsSL https://raw.githubusercontent.com/jmaniLC/lcagents/main/uninstall.js | node
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const rmdir = promisify(fs.rmdir);
const unlink = promisify(fs.unlink);

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

async function removeRecursive(targetPath) {
  try {
    const stats = await stat(targetPath);
    
    if (stats.isDirectory()) {
      const files = await readdir(targetPath);
      for (const file of files) {
        await removeRecursive(path.join(targetPath, file));
      }
      await rmdir(targetPath);
    } else {
      await unlink(targetPath);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function removeShellAlias() {
  try {
    const os = require('os');
    const homeDir = os.homedir();
    const shell = process.env.SHELL || '';
    
    // Determine which shell config file to use
    let configFile = '';
    let shellName = '';
    
    if (shell.includes('zsh')) {
      configFile = path.join(homeDir, '.zshrc');
      shellName = 'zsh';
    } else if (shell.includes('bash')) {
      // Check for .bash_profile first, then .bashrc
      const bashProfile = path.join(homeDir, '.bash_profile');
      const bashrc = path.join(homeDir, '.bashrc');
      
      if (await pathExists(bashProfile)) {
        configFile = bashProfile;
      } else {
        configFile = bashrc;
      }
      shellName = 'bash';
    } else {
      return {
        success: false,
        message: 'Unsupported shell detected - manually remove lcagent alias'
      };
    }
    
    // Check if config file exists and has the alias
    if (!await pathExists(configFile)) {
      return {
        success: true,
        message: 'No shell configuration file found'
      };
    }
    
    const content = await promisify(fs.readFile)(configFile, 'utf-8');
    if (!content.includes('alias lcagent=')) {
      return {
        success: true,
        message: 'No lcagent alias found in shell configuration'
      };
    }
    
    // Remove the alias and comment
    const lines = content.split('\n');
    const filteredLines = lines.filter(line => 
      !line.includes('alias lcagent=') && 
      !line.includes('# LCAgents alias for easy access')
    );
    
    await promisify(fs.writeFile)(configFile, filteredLines.join('\n'));
    
    return {
      success: true,
      message: `Alias removed from ${shellName} configuration`
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to remove shell alias - manually remove lcagent alias'
    };
  }
}

async function main() {
  console.log(colorize('cyan', '🔧 LCAgents Uninstaller'));
  console.log(colorize('gray', 'github:jmaniLC/lcagents ver2.2'));
  console.log();

  const currentDir = process.cwd();
  const lcagentsDir = path.join(currentDir, '.lcagents');
  
  // Check if LCAgents is installed
  if (!await pathExists(lcagentsDir)) {
    console.log(colorize('yellow', 'LCAgents is not installed in this directory'));
    return;
  }

  // Check for force flag
  const forceFlag = process.argv.includes('--force') || process.argv.includes('-f');
  
  if (!forceFlag) {
    console.log(colorize('yellow', '⚠️  This will remove LCAgents from the current directory'));
    console.log(colorize('gray', '   To proceed without confirmation, use: --force'));
    console.log();
    console.log(colorize('red', '❌ Uninstall cancelled (use --force to proceed)'));
    return;
  }

  console.log(colorize('bright', '🗑️  Removing LCAgents...'));
  
  try {
    // Remove .lcagents directory
    await removeRecursive(lcagentsDir);
    console.log(colorize('gray', '   ✓ Removed .lcagents directory'));
    
    // Remove GitHub workflow files if they exist
    const githubWorkflowsDir = path.join(currentDir, '.github', 'workflows');
    const lcagentsWorkflows = [
      'lcagents-validation.yml',
      'lcagents-docs.yml'
    ];
    
    for (const workflow of lcagentsWorkflows) {
      const workflowPath = path.join(githubWorkflowsDir, workflow);
      if (await pathExists(workflowPath)) {
        await removeRecursive(workflowPath);
        console.log(colorize('gray', `   ✓ Removed ${workflow}`));
      }
    }
    
    // Remove GitHub templates created by LCAgents
    const githubTemplatesDir = path.join(currentDir, '.github', 'ISSUE_TEMPLATE');
    const lcagentsTemplates = [
      'agent-request.md',
      'bug-report.md'
    ];
    
    for (const template of lcagentsTemplates) {
      const templatePath = path.join(githubTemplatesDir, template);
      if (await pathExists(templatePath)) {
        await removeRecursive(templatePath);
        console.log(colorize('gray', `   ✓ Removed ${template}`));
      }
    }
    
    console.log();
    console.log(colorize('green', '✅ LCAgents completely removed'));
    console.log();
    const repositoryConfig = require('../../../config/repository.json');
const repoUrl = repositoryConfig.repository.url;

// ... existing code ...
console.log(colorize('gray', `To reinstall: npx git+${repoUrl} init`));
    
  } catch (error) {
    console.log();
    console.log(colorize('red', '❌ Failed to remove LCAgents'));
    console.error(colorize('red', 'Error:'), error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(colorize('red', 'Uninstall failed:'), error.message);
  process.exit(1);
});
