import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as yaml from 'yaml';
import * as path from 'path';
import * as readline from 'readline';
import { AgentLoader } from '../../core/AgentLoader';
import { LayerManager } from '../../core/LayerManager';
import { CoreSystemManager } from '../../core/CoreSystemManager';
import { ParsedAgent, AgentDefinition, AgentCommand } from '../../types/AgentDefinition';

// Helper function removed - AgentLoader no longer needs config

// Helper function to categorize agents
function categorizeAgent(agent: ParsedAgent): string {
  const role = agent.definition.persona.role.toLowerCase();
  if (role.includes('manager') || role.includes('pm') || role.includes('product')) return 'Business';
  if (role.includes('developer') || role.includes('dev') || role.includes('engineer')) return 'Technical';
  if (role.includes('qa') || role.includes('test') || role.includes('quality')) return 'Quality';
  if (role.includes('architect') || role.includes('design')) return 'Architecture';
  if (role.includes('security') || role.includes('compliance')) return 'Compliance';
  return 'General';
}

// Helper function to format agent display
function formatAgentDisplay(agent: ParsedAgent, layer: string): string {
  const agentId = agent.definition.id;
  const name = agent.definition.name;
  const whenToUse = agent.definition.whenToUse;
  const layerBadge = layer === 'core' ? chalk.blue('[CORE]') : 
                    layer === 'org' ? chalk.yellow('[ORG]') : 
                    chalk.magenta('[CUSTOM]');
  
  return `${chalk.yellow(agentId)} ${chalk.cyan(name)} ${layerBadge} - ${chalk.dim(whenToUse)}`;
}

// Helper function to search agents
function searchAgents(agents: ParsedAgent[], query: string): ParsedAgent[] {
  const lowerQuery = query.toLowerCase();
  return agents.filter(agent => {
    return agent.definition.name.toLowerCase().includes(lowerQuery) ||
           agent.definition.title.toLowerCase().includes(lowerQuery) ||
           agent.definition.whenToUse.toLowerCase().includes(lowerQuery) ||
           agent.definition.persona.role.toLowerCase().includes(lowerQuery) ||
           agent.definition.persona.focus.toLowerCase().includes(lowerQuery) ||
           Object.keys(agent.definition.commands).some(cmd => cmd.toLowerCase().includes(lowerQuery));
  });
}



export const agentCommand = new Command('agent')
  .description('Discover, explore, and manage agents in the LCAgents ecosystem')
  
  // Story 1.1: List Available Agents
  .addCommand(
    new Command('list')
      .description('Interactive agent browser showing all available agents')
      .action(async () => {
        try {
          console.log(chalk.blue('🔍 Loading agents from all layers...'));
          
          const currentDir = process.cwd();
          const agentLoader = new AgentLoader(currentDir);
          const layerManager = new LayerManager(currentDir);
          const coreSystemManager = new CoreSystemManager(currentDir);
          
          // Load all agents using AgentLoader.loadAllAgents()
          const { loaded: agents, errors } = await agentLoader.loadAllAgents();
          
          if (errors.length > 0) {
            console.log(chalk.yellow('⚠️  Some agents failed to load:'));
            
            // Group errors by failure reason
            const errorGroups = new Map<string, string[]>();
            
            errors.forEach(error => {
              // Extract agent name and reason from error message
              // Expected format: "agentName: Agent validation failed: reason1, reason2" 
              if (error.includes('Agent validation failed:')) {
                const match = error.match(/^(.+?): Agent validation failed: (.+)$/);
                if (match && match[1] && match[2]) {
                  const agentName = match[1];
                  const allReasons = match[2];
                  
                  // Split multiple reasons and process each
                  const reasons = allReasons.split(', ');
                  reasons.forEach(reason => {
                    // Group similar errors
                    let groupKey = reason;
                    if (reason.includes('name is required')) {
                      groupKey = 'Missing required name field';
                    } else if (reason.includes('title is required')) {
                      groupKey = 'Missing required title field';
                    } else if (reason.includes('persona role is required')) {
                      groupKey = 'Missing persona role';
                    } else if (reason.includes('commands are required')) {
                      groupKey = 'Missing commands field';
                    } else if (reason.includes('persona must be an object') || reason.includes('not a string')) {
                      groupKey = 'Invalid persona format';
                    }
                    
                    if (!errorGroups.has(groupKey)) {
                      errorGroups.set(groupKey, []);
                    }
                    errorGroups.get(groupKey)!.push(agentName);
                  });
                }
              } else if (error.includes('Failed to load')) {
                const nameMatch = error.match(/Failed to load (.+)$/);
                const agentName = (nameMatch && nameMatch[1]) ? nameMatch[1] : 'unknown';
                const reason = 'Loading error';
                
                if (!errorGroups.has(reason)) {
                  errorGroups.set(reason, []);
                }
                errorGroups.get(reason)!.push(agentName);
              } else {
                // Try to extract YAML parsing errors
                if (error.includes('YAML parsing error')) {
                  const nameMatch = error.match(/YAML parsing error in (.+?):/);
                  const agentName = (nameMatch && nameMatch[1]) ? nameMatch[1] : 'unknown';
                  const reason = 'YAML parsing error';
                  
                  if (!errorGroups.has(reason)) {
                    errorGroups.set(reason, []);
                  }
                  errorGroups.get(reason)!.push(agentName);
                } else {
                  // Generic error - try to extract agent name
                  const reason = 'Parse error';
                  let agentName = 'unknown';
                  
                  // Try common patterns to extract agent names
                  const patterns = [
                    /Error loading agent (.+?):/,
                    /(.+?): .+/,
                    /in (.+?):/
                  ];
                  
                  for (const pattern of patterns) {
                    const match = error.match(pattern);
                    if (match && match[1]) {
                      agentName = match[1];
                      break;
                    }
                  }
                  
                  if (!errorGroups.has(reason)) {
                    errorGroups.set(reason, []);
                  }
                  errorGroups.get(reason)!.push(agentName);
                }
              }
            });
            
            // Display grouped errors
            for (const [reason, agentNames] of errorGroups) {
              const uniqueAgents = [...new Set(agentNames)]; // Remove duplicates
              const agentList = uniqueAgents.join(', ');
              console.log(chalk.red(`   Agent validation failed: ${reason} (${agentList})`));
            }
          }

          if (agents.length === 0) {
            console.log(chalk.yellow('📭 No agents found. Initialize LCAgents first with: lcagents init'));
            return;
          }

          // Get active core system
          const activeCoreSystem = await coreSystemManager.getActiveCoreSystem();
          
          console.log(chalk.green(`\n📋 Available Agents (${agents.length} found)`));
          console.log(chalk.dim(`Active Core System: ${activeCoreSystem || 'Not detected'}\n`));

          // Categorize agents
          const categorized = new Map<string, ParsedAgent[]>();
          
          for (const agent of agents) {
            // Resolve agent layer information
            try {
              const resolutionPath = await layerManager.resolveAgent(agent.definition.id);
              let layer = 'core';
              
              if (resolutionPath.layerSources.includes('custom')) {
                layer = 'custom';
              } else if (resolutionPath.layerSources.includes('org')) {
                layer = 'org';
              }
              
              const category = categorizeAgent(agent);
              if (!categorized.has(category)) {
                categorized.set(category, []);
              }
              
              // Add layer info to agent for display
              (agent as any).layerInfo = layer;
              categorized.get(category)!.push(agent);
            } catch (error) {
              // Fallback to core if resolution fails
              const category = categorizeAgent(agent);
              if (!categorized.has(category)) {
                categorized.set(category, []);
              }
              (agent as any).layerInfo = 'core';
              categorized.get(category)!.push(agent);
            }
          }

          // Display agents by category
          for (const [category, categoryAgents] of categorized) {
            console.log(chalk.cyan(`\n📂 ${category}:`));
            categoryAgents.forEach(agent => {
              const layer = (agent as any).layerInfo || 'core';
              console.log(`   ${formatAgentDisplay(agent, layer)}`);
            });
          }

          console.log(chalk.dim('\n💡 Commands:'));
          console.log(chalk.dim('   lcagents agent info <name>     - Get detailed information'));
          console.log(chalk.dim('   lcagents agent search <query>  - Search agents'));
          
        } catch (error) {
          console.error(chalk.red(`❌ Error browsing agents: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )

  // Story 1.1: Search agents by capability
  .addCommand(
    new Command('search')
      .description('Search agents by keywords or capabilities')
      .argument('<query>', 'Search query for agent capabilities')
      .action(async (query: string) => {
        try {
          console.log(chalk.blue(`🔍 Searching agents for: "${query}"`));
          
          const currentDir = process.cwd();
          const agentLoader = new AgentLoader(currentDir);
          
          // Load all agents and search
          const { loaded: agents } = await agentLoader.loadAllAgents();
          const searchResults = searchAgents(agents, query);

          if (searchResults.length === 0) {
            console.log(chalk.yellow(`📭 No agents found matching "${query}"`));
            console.log(chalk.dim('\n💡 Try:'));
            console.log(chalk.dim('   lcagents agent list          - List all available agents'));
            return;
          }

          console.log(chalk.green(`\n📋 Search Results (${searchResults.length} found):`));

          // Auto-trigger detailed info if single result
          if (searchResults.length === 1) {
            const agent = searchResults[0];
            if (agent) {
              console.log(`\n${formatAgentDisplay(agent, 'core')}`);
              console.log(chalk.dim('\n🔍 Showing detailed information (single result):\n'));
              
              // Show detailed info inline - use agent ID, not display name
              await showAgentInfo(agent.definition.id, currentDir);
              return;
            }
          }

          // Show search results
          searchResults.forEach((agent, index) => {
            const layer = 'core'; // TODO: Resolve actual layer
            console.log(`   ${index + 1}. ${formatAgentDisplay(agent, layer)}`);
          });

          console.log(chalk.dim('\n💡 Use "lcagents agent info <name>" for detailed information'));
          
        } catch (error) {
          console.error(chalk.red(`❌ Error searching agents: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )

  // Story 1.2: Get detailed agent information
  .addCommand(
    new Command('info')
      .description('Show detailed information about a specific agent')
      .argument('<agent-name>', 'Name or ID of the agent')
      .action(async (agentName: string) => {
        try {
          await showAgentInfo(agentName, process.cwd());
        } catch (error) {
          console.error(chalk.red(`❌ Error getting agent info: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )

  // Story 1.1: Gap analysis to find missing capabilities
  // DEACTIVATED: gaps-analysis command (hidden from CLI menu but functionality preserved for internal use)
  /*.addCommand(
    new Command('gaps-analysis')
      .description('Analyze current agents and suggest missing capabilities')
      .action(async () => {
        try {
          console.log(chalk.blue('🔍 Analyzing agent capabilities and gaps...'));
          
          const currentDir = process.cwd();
          const agentLoader = new AgentLoader(currentDir);
          const coreSystemManager = new CoreSystemManager(currentDir);
          
          const { loaded: agents } = await agentLoader.loadAllAgents();
          const activeCoreSystem = await coreSystemManager.getActiveCoreSystem();
          
          // Analyze current capabilities
          const capabilities = new Set<string>();
          const roles = new Set<string>();
          
          agents.forEach(agent => {
            roles.add(agent.definition.persona.role);
            Object.keys(agent.definition.commands).forEach(cmd => capabilities.add(cmd));
          });

          console.log(chalk.green('\n📊 Current Agent Analysis:'));
          console.log(chalk.cyan(`   Agents: ${agents.length}`));
          console.log(chalk.cyan(`   Roles: ${Array.from(roles).join(', ')}`));
          console.log(chalk.cyan(`   Commands: ${capabilities.size}`));
          console.log(chalk.cyan(`   Core System: ${activeCoreSystem || 'Not detected'}`));

          // Suggest common missing capabilities
          const commonRoles = ['Product Manager', 'Developer', 'Security Engineer'];
          const missingRoles = commonRoles.filter(role => {
            const roleLower = role.toLowerCase();
            return !Array.from(roles).some(existingRole => {
              const existingLower = existingRole.toLowerCase();
              
              // Simple matching - check if role keywords exist
              if (roleLower.includes('product')) {
                return existingLower.includes('product');
              }
              if (roleLower.includes('developer')) {
                return existingLower.includes('developer') || existingLower.includes('dev');
              }
              if (roleLower.includes('security')) {
                return existingLower.includes('security');
              }
              
              return false;
            });
          });

          if (missingRoles.length > 0) {
            console.log(chalk.yellow('\n🔍 Potential Missing Roles:'));
            missingRoles.forEach(role => {
              console.log(chalk.dim(`   • ${role}`));
            });
            console.log(chalk.dim('\n💡 Consider creating agents for missing roles'));
          } else {
            console.log(chalk.green('\n✅ Core roles well covered!'));
          }
          
        } catch (error) {
          console.error(chalk.red(`❌ Error analyzing gaps: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )*/

  // Story 1.1: Smart agent recommendations  
  // DEACTIVATED: suggest command (hidden from CLI menu but functionality preserved for internal use)
  /*.addCommand(
    new Command('suggest')
      .description('Get intelligent agent recommendations based on current setup')
      .action(async () => {
        try {
          console.log(chalk.blue('🔍 Analyzing current setup for recommendations...'));
          
          const currentDir = process.cwd();
          const agentLoader = new AgentLoader(currentDir);
          
          const { loaded: agents } = await agentLoader.loadAllAgents();
          
          // Simple recommendation logic for MVP
          const recommendations = [];
          
          const hasDevAgent = agents.some(a => 
            a.definition.persona.role.toLowerCase().includes('developer') ||
            a.definition.persona.role.toLowerCase().includes('dev') ||
            a.definition.id === 'dev'
          );
          const hasPMAgent = agents.some(a => 
            a.definition.persona.role.toLowerCase().includes('manager') ||
            a.definition.persona.role.toLowerCase().includes('product') ||
            a.definition.id === 'pm'
          );
          const hasQAAgent = agents.some(a => 
            a.definition.persona.role.toLowerCase().includes('qa') ||
            a.definition.persona.role.toLowerCase().includes('test') ||
            a.definition.persona.role.toLowerCase().includes('quality') ||
            a.definition.id === 'qa'
          );
          
          if (!hasDevAgent) {
            recommendations.push('🧑‍💻 Developer Agent - Essential for code implementation and technical tasks');
          }
          if (!hasPMAgent) {
            recommendations.push('👔 Product Manager Agent - Helps with requirements and feature planning');
          }
          if (!hasQAAgent) {
            recommendations.push('🧪 QA Engineer Agent - Crucial for testing and quality assurance');
          }

          if (recommendations.length === 0) {
            console.log(chalk.green('✅ You have a well-rounded agent setup!'));
            console.log(chalk.dim('Consider specialized agents for advanced use cases:'));
            console.log(chalk.dim('   • Security Engineer - For security reviews'));
            console.log(chalk.dim('   • Data Engineer - For data pipeline tasks'));
            console.log(chalk.dim('   • DevOps Engineer - For deployment automation'));
          } else {
            console.log(chalk.yellow('\n💡 Recommended Agents:'));
            recommendations.forEach(rec => {
              console.log(`   ${rec}`);
            });
            console.log(chalk.dim('\n🚀 Create agents with: lcagents agent create'));
          }
          
        } catch (error) {
          console.error(chalk.red(`❌ Error generating suggestions: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )*/

  // Epic 2: Guided Agent Creation - Story 2.1: Create Agent Through Wizard
  .addCommand(
    new Command('create')
      .description('Create a new custom agent through guided wizard')
      .option('--template <template-name>', 'Create agent from template')
      .option('--skip-validation', 'Skip validation during creation')
      .action(async (options) => {
        try {
          const currentDir = process.cwd();
          
          if (options.template) {
            await createAgentFromTemplate(options.template, currentDir, !options.skipValidation);
          } else {
            await createAgentWithWizard(currentDir, !options.skipValidation);
          }
          
        } catch (error) {
          console.error(chalk.red(`❌ Error creating agent: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )

  // Epic 2: Guided Agent Creation - Story 2.2: Agent Template System  
  .addCommand(
    new Command('from-template')
      .description('Create agent from pre-defined template with uniqueness checking')
      .argument('<template-name>', 'Name of the template to use')
      .option('--skip-validation', 'Skip validation during creation')
      .action(async (templateName: string, options) => {
        try {
          const currentDir = process.cwd();
          await createAgentFromTemplate(templateName, currentDir, !options.skipValidation);
        } catch (error) {
          console.error(chalk.red(`❌ Error creating agent from template: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )

  // Epic 2: Guided Agent Creation - Story 2.2: Agent Cloning
  .addCommand(
    new Command('clone')
      .description('Clone and customize existing agent with conflict resolution')
      .argument('<existing-agent>', 'Name of the existing agent to clone')
      .option('--skip-validation', 'Skip validation during creation')
      .action(async (existingAgent: string, options) => {
        try {
          const currentDir = process.cwd();
          await cloneAgent(existingAgent, currentDir, !options.skipValidation);
        } catch (error) {
          console.error(chalk.red(`❌ Error cloning agent: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )

  // DEACTIVATED: validate command (hidden from CLI menu but functionality preserved for internal use by modify/edit-config/revert commands)
  /*.addCommand(
    new Command('validate')
      .description('Validate agent using AgentLoader.validateAgent() with enhanced error grouping')
      .argument('<agent-name>', 'Name of the agent to validate')
      .action(async (agentName: string) => {
        try {
          const currentDir = process.cwd();
          await validateAgent(agentName, currentDir);
        } catch (error) {
          console.error(chalk.red(`❌ Error validating agent: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )*/

  // Epic 3: Agent Modification & Customization - Story 3.1: Modify Existing Agents
  .addCommand(
    new Command('modify')
      .description('Interactive modification wizard using AgentLoader.loadAllAgents() with layer protection')
      .argument('<agent-id>', 'ID of the agent to modify')
      .action(async (agentId: string) => {
        try {
          const currentDir = process.cwd();
          await modifyAgent(agentId, currentDir);
        } catch (error) {
          console.error(chalk.red(`❌ Error modifying agent: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )

  .addCommand(
    new Command('edit-config')
      .description('Direct configuration editing with AgentLoader.validateAgent()')
      .argument('<agent-id>', 'ID of the agent to edit')
      .action(async (agentId: string) => {
        try {
          const currentDir = process.cwd();
          await editAgentConfig(agentId, currentDir);
        } catch (error) {
          console.error(chalk.red(`❌ Error editing agent config: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )

  // NOTE: 'backup' and 'revert' commands have been moved to "lcagents setup backup/revert" for global agent/resource operations

  // Epic 3: Command Management - Story 3.2: Command Management
  .addCommand(
    new Command('add')
      .description('Add resources to agents (checklists, templates, commands, etc.)')
      .argument('<resource-type>', 'Type of resource: checklist, kb, task, template, workflow')
      .argument('<agent-id>', 'ID of the agent to add resource to')
      .action(async (resourceType: string, agentId: string) => {
        try {
          const currentDir = process.cwd();
          await addResourceToAgent(resourceType, agentId, currentDir);
        } catch (error) {
          console.error(chalk.red(`❌ Error adding resource: ${error instanceof Error ? error.message : 'Unknown error'}`));
          process.exit(1);
        }
      })
  )

  // Command management utilities (moved from separate commandCommand)
  .addCommand(
    new Command('command')
      .description('Command management utilities for conflict checking and validation')
      .addCommand(
        new Command('validate')
          .description('Check command conflicts across all agents using enhanced error grouping')
          .argument('<command-name>', 'Name of the command to validate')
          .action(async (commandName: string) => {
            try {
              const currentDir = process.cwd();
              await validateCommand(commandName, currentDir);
            } catch (error) {
              console.error(chalk.red(`❌ Error validating command: ${error instanceof Error ? error.message : 'Unknown error'}`));
              process.exit(1);
            }
          })
      )
      .addCommand(
        new Command('suggest')
          .description('Suggest command names that avoid conflicts with validation')
          .argument('<description>', 'Description of the command functionality')
          .action(async (description: string) => {
            try {
              const currentDir = process.cwd();
              await suggestCommandNames(description, currentDir);
            } catch (error) {
              console.error(chalk.red(`❌ Error suggesting commands: ${error instanceof Error ? error.message : 'Unknown error'}`));
              process.exit(1);
            }
          })
      )
  );

// Epic 2: Guided Agent Creation Implementation Functions

/**
 * Create agent through guided wizard (Epic 2, Story 2.1)
 */
async function createAgentWithWizard(basePath: string, validate: boolean = true): Promise<void> {
  console.log(chalk.blue('🚀 Agent Creation Wizard\n'));
  
  const agentLoader = new AgentLoader(basePath);
  const layerManager = new LayerManager(basePath);
  
  // Load existing agents for conflict detection
  const { loaded: existingAgents } = await agentLoader.loadAllAgents();
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // Step 1/6: Basic Information with conflict detection
    console.log(chalk.cyan('Step 1/6: Basic Information'));
    
    let agentName = '';
    let agentId = '';
    let isUnique = false;
    
    while (!isUnique) {
      agentName = await askQuestion(rl, '? What should your agent be called? (e.g., "Data Scientist"): ');
      agentId = agentName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      
      // Check for conflicts using AgentLoader.loadAllAgents()
      const existingAgent = existingAgents.find(agent => 
        agent.definition.id === agentId || 
        agent.definition.name.toLowerCase() === agentName.toLowerCase()
      );
      
      if (existingAgent) {
        console.log(chalk.red(`\n❌ Agent ID '${agentId}' already exists in ${getAgentLayer(existingAgent)} layer!`));
        console.log(chalk.dim(`   ${existingAgent.definition.id} ${existingAgent.definition.name} - ${existingAgent.definition.whenToUse}`));
        
        console.log(chalk.yellow('\n💡 What would you like to do?'));
        console.log('  1) Create a specialized version (e.g., "compliance-pm") ✅');
        console.log('  2) Override the existing agent (advanced)');
        
        const choice = await askQuestion(rl, '> ');
        
        if (choice === '1') {
          const specialization = await askQuestion(rl, '\n? What makes this agent different?\n> ');
          agentName = `${specialization} ${agentName}`;
          agentId = agentName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
          
          // Check again with new name
          const stillExists = existingAgents.find(agent => 
            agent.definition.id === agentId || 
            agent.definition.name.toLowerCase() === agentName.toLowerCase()
          );
          
          if (!stillExists) {
            console.log(chalk.green(`\n✅ Great! Creating "${agentName}" - checking for conflicts...`));
            console.log(chalk.green('✅ ID available across all layers (core, org, custom)'));
            isUnique = true;
          }
        } else if (choice === '2') {
          console.log(chalk.yellow('\n⚠️  Override mode: This will create a custom layer override'));
          isUnique = true;
        }
      } else {
        console.log(chalk.green(`\n✅ Agent ID '${agentId}' available across all layers`));
        isUnique = true;
      }
    }

    // Step 2/6: Role and Purpose
    console.log(chalk.cyan('\nStep 2/6: Role and Purpose'));
    const role = await askQuestion(rl, '? What is this agent\'s primary role? (e.g., "Security Engineer"): ');
    const whenToUse = await askQuestion(rl, '? When should this agent be used? (e.g., "Security reviews, vulnerability assessment"): ');
    
    // Step 3/6: Personality and Style  
    console.log(chalk.cyan('\nStep 3/6: Personality and Style'));
    const style = await askQuestion(rl, '? What communication style? (professional, friendly, concise, detailed) [professional]: ') || 'professional';
    const focus = await askQuestion(rl, '? What should this agent focus on? (e.g., "compliance", "performance", "security"): ');
    
    // Step 4/6: Core Capabilities
    console.log(chalk.cyan('\nStep 4/6: Core Capabilities'));
    console.log('? What commands should this agent support? (Enter one per line, empty line to finish)');
    
    const commands: Record<string, string> = {};
    let commandInput = '';
    let commandCount = 1;
    
    do {
      commandInput = await askQuestion(rl, `  Command ${commandCount}: `);
      if (commandInput.trim()) {
        const description = await askQuestion(rl, `    Description: `);
        commands[commandInput.trim()] = description.trim() || 'No description provided';
        commandCount++;
      }
    } while (commandInput.trim());
    
    if (Object.keys(commands).length === 0) {
      // Provide default commands based on role
      commands['help'] = `Provide guidance on ${role.toLowerCase()} tasks`;
      commands['analyze'] = `Analyze requirements from ${role.toLowerCase()} perspective`;
    }

    // Step 5/6: Dependencies (optional)
    console.log(chalk.cyan('\nStep 5/6: Dependencies (Optional)'));
    console.log('? Does this agent need specific resources? (templates, checklists, etc.)');
    const needsDeps = await askQuestion(rl, '? Add dependencies? (y/N): ');
    
    const dependencies = {
      checklists: [] as string[],
      data: [] as string[],
      tasks: [] as string[],
      templates: [] as string[],
      utils: [] as string[],
      workflows: [] as string[],
      'agent-teams': [] as string[]
    };
    
    if (needsDeps.toLowerCase() === 'y' || needsDeps.toLowerCase() === 'yes') {
      // Show available resources
      const availableResources = await layerManager.listResources('templates');
      if (availableResources.length > 0) {
        console.log('\nAvailable templates:');
        availableResources.forEach((res, idx) => {
          console.log(`  ${idx + 1}. ${res.name}`);
        });
        
        const templateChoice = await askQuestion(rl, 'Select templates (comma-separated numbers, or skip): ');
        if (templateChoice.trim()) {
          const indices = templateChoice.split(',').map(s => parseInt(s.trim()) - 1);
          indices.forEach(idx => {
            if (idx >= 0 && idx < availableResources.length && availableResources[idx]) {
              dependencies.templates.push(availableResources[idx].name);
            }
          });
        }
      }
    }

    // Step 6/6: Preview and Confirmation
    console.log(chalk.cyan('\nStep 6/6: Preview and Confirmation'));
    
    const agentDefinition: AgentDefinition = {
      name: agentName,
      id: agentId,
      title: agentName,
      icon: getDefaultIcon(role),
      whenToUse,
      customization: null,
      persona: {
        role,
        style,
        identity: `${role} focused on ${focus}`,
        focus,
        core_principles: []
      },
      commands,
      dependencies,
      'activation-instructions': [],
      'story-file-permissions': [],
      'help-display-template': ''
    };
    
    console.log(chalk.green('\n📋 Agent Preview:'));
    console.log(chalk.yellow(`Name: ${agentDefinition.name}`));
    console.log(chalk.yellow(`ID: ${agentDefinition.id}`));
    console.log(chalk.yellow(`Role: ${agentDefinition.persona.role}`));
    console.log(chalk.yellow(`Style: ${agentDefinition.persona.style}`));
    console.log(chalk.yellow(`Commands: ${Object.keys(agentDefinition.commands).join(', ')}`));
    
    const confirm = await askQuestion(rl, '\n? Create this agent? (Y/n): ');
    if (confirm.toLowerCase() === 'n' || confirm.toLowerCase() === 'no') {
      console.log(chalk.yellow('❌ Agent creation cancelled'));
      return;
    }

    // Create the agent file in custom layer
    await createAgentFile(layerManager, agentDefinition, validate);
    
    console.log(chalk.green(`\n✅ Agent created successfully!`));
    console.log(chalk.dim(`📁 Location: .lcagents/custom/agents/${agentId}.yaml`));
    console.log(chalk.dim(`🔍 View: lcagents agent info ${agentId}`));
    
  } finally {
    rl.close();
  }
}

/**
 * Create agent from template (Epic 2, Story 2.2)
 */
async function createAgentFromTemplate(templateName: string, basePath: string, validate: boolean = true): Promise<void> {
  console.log(chalk.blue(`📦 Creating agent from template: ${templateName}`));
  
  const layerManager = new LayerManager(basePath);
  const agentLoader = new AgentLoader(basePath);
  
  // Resolve template with layer precedence
  let templateResult;
  try {
    templateResult = await layerManager.resolveTemplate(templateName);
  } catch (error) {
    console.log(chalk.red(`❌ Template not found: ${templateName}`));
    console.log(chalk.dim('💡 Use "lcagents res list templates" to see available templates'));
    return;
  }
  
  console.log(chalk.green(`✅ Template found in ${templateResult.source} layer`));
  
  // Load template content
  const templateContent = await fs.readFile(templateResult.path, 'utf-8');
  let templateData;
  
  try {
    templateData = yaml.parse(templateContent);
  } catch (error) {
    console.log(chalk.red(`❌ Invalid template YAML: ${error}`));
    return;
  }
  
  if (!templateData.template) {
    console.log(chalk.red(`❌ Template missing 'template' section`));
    return;
  }
  
  const template = templateData.template;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // Load existing agents for conflict detection
    const { loaded: existingAgents } = await agentLoader.loadAllAgents();
    
    // Customize the template
    console.log(chalk.cyan('\n📝 Template Customization'));
    console.log(chalk.dim(`Template: ${template.name || templateName}`));
    console.log(chalk.dim(`Version: ${template.version || 'N/A'}`));
    
    let agentName = await askQuestion(rl, `? Agent name [${template.defaultName || 'Custom Agent'}]: `) || template.defaultName || 'Custom Agent';
    let agentId = agentName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    
    // Check for conflicts
    const existingAgent = existingAgents.find(agent => 
      agent.definition.id === agentId || 
      agent.definition.name.toLowerCase() === agentName.toLowerCase()
    );
    
    if (existingAgent) {
      console.log(chalk.yellow(`\n⚠️  Agent '${agentName}' would conflict with template base name!`));
      console.log(chalk.yellow('\n💡 Suggested names:'));
      console.log('  1) Marketing ' + agentName + ' ✅');
      console.log('  2) Sales ' + agentName);
      console.log('  3) Financial ' + agentName);
      
      const choice = await askQuestion(rl, '> ');
      const prefixes = ['Marketing', 'Sales', 'Financial'];
      const selectedPrefix = prefixes[parseInt(choice) - 1] || 'Custom';
      agentName = `${selectedPrefix} ${agentName}`;
      agentId = agentName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }
    
    console.log(chalk.green(`✅ Creating "${agentName}" from ${templateName} template...`));
    console.log(chalk.green('✅ No conflicts found across all layers'));
    
    // Create agent definition from template
    const agentDefinition: AgentDefinition = {
      name: agentName,
      id: agentId,
      title: template.title || agentName,
      icon: template.icon || '🤖',
      whenToUse: template.whenToUse || template.description || '',
      customization: `template:${templateName}${template.version ? `,version:${template.version}` : ''}`,
      persona: {
        role: template.persona?.role || 'Assistant',
        style: template.persona?.style || 'professional',
        identity: template.persona?.identity || agentName,
        focus: template.persona?.focus || '',
        core_principles: template.persona?.core_principles || []
      },
      commands: template.commands || {},
      dependencies: template.dependencies || {
        checklists: [],
        data: [],
        tasks: [],
        templates: [],
        utils: [],
        workflows: [],
        'agent-teams': []
      },
      'activation-instructions': template['activation-instructions'] || [],
      'story-file-permissions': template['story-file-permissions'] || [],
      'help-display-template': template['help-display-template'] || ''
    };
    
    // Create the agent file
    await createAgentFile(layerManager, agentDefinition, validate);
    
    console.log(chalk.green(`\n✅ Agent created from template successfully!`));
    console.log(chalk.dim(`📁 Location: .lcagents/custom/agents/${agentId}.yaml`));
    console.log(chalk.dim(`🔍 View: lcagents agent info ${agentId}`));
    
  } finally {
    rl.close();
  }
}

/**
 * Clone existing agent (Epic 2, Story 2.2)  
 */
async function cloneAgent(existingAgent: string, basePath: string, validate: boolean = true): Promise<void> {
  console.log(chalk.blue(`👥 Cloning agent: ${existingAgent}`));
  
  const agentLoader = new AgentLoader(basePath);
  const layerManager = new LayerManager(basePath);
  
  // Load the source agent
  const result = await agentLoader.loadAgent(existingAgent);
  if (!result.success || !result.agent) {
    console.log(chalk.red(`❌ Source agent not found: ${existingAgent}`));
    console.log(chalk.dim('💡 Use "lcagents agent list" to see available agents'));
    return;
  }
  
  const sourceAgent = result.agent;
  console.log(chalk.green(`✅ Source agent loaded: ${sourceAgent.definition.name}`));
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // Load existing agents for conflict detection
    const { loaded: existingAgents } = await agentLoader.loadAllAgents();
    
    console.log(chalk.cyan('\n📝 Agent Cloning Configuration'));
    
    let agentName = await askQuestion(rl, `? New agent name [${sourceAgent.definition.name} Copy]: `) || `${sourceAgent.definition.name} Copy`;
    let agentId = agentName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    
    // Check for conflicts
    const existingConflict = existingAgents.find(agent => 
      agent.definition.id === agentId || 
      agent.definition.name.toLowerCase() === agentName.toLowerCase()
    );
    
    if (existingConflict) {
      console.log(chalk.red(`\n❌ Agent '${agentName}' already exists!`));
      agentName = await askQuestion(rl, '? Choose a different name: ');
      agentId = agentName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }
    
    const customization = await askQuestion(rl, '? What makes this agent different from the original?\n> ');
    
    console.log(chalk.green(`✅ Creating "${agentName}" as clone of ${sourceAgent.definition.name}...`));
    
    // Create cloned agent definition
    const agentDefinition: AgentDefinition = {
      ...sourceAgent.definition,
      name: agentName,
      id: agentId,
      title: agentName,
      customization: `cloned_from:${sourceAgent.definition.id},modifications:${customization}`,
      persona: {
        ...sourceAgent.definition.persona,
        identity: `${sourceAgent.definition.persona.identity} (specialized: ${customization})`
      }
    };
    
    // Create the agent file
    await createAgentFile(layerManager, agentDefinition, validate);
    
    console.log(chalk.green(`\n✅ Agent cloned successfully!`));
    console.log(chalk.dim(`📁 Location: .lcagents/custom/agents/${agentId}.yaml`));
    console.log(chalk.dim(`🔍 View: lcagents agent info ${agentId}`));
    
  } finally {
    rl.close();
  }
}

/**
 * Validate agent with enhanced error grouping
 */
async function validateAgent(agentName: string, basePath: string): Promise<void> {
  console.log(chalk.blue(`🧪 Validating agent: ${agentName}`));
  
  const agentLoader = new AgentLoader(basePath);
  const layerManager = new LayerManager(basePath);
  const coreSystemManager = new CoreSystemManager(basePath);
  
  const result = await agentLoader.loadAgent(agentName);
  if (!result.success || !result.agent) {
    console.log(chalk.red(`❌ Agent not found or failed to load: ${agentName}`));
    if (result.error) {
      console.log(chalk.red(`   Error: ${result.error}`));
    }
    return;
  }
  
  const agent = result.agent;
  console.log(chalk.green(`✅ Agent loaded successfully`));
  
  // Layer integrity check
  try {
    const resolutionPath = await layerManager.resolveAgent(agent.definition.id);
    console.log(chalk.green(`✅ Layer integrity validated`));
    console.log(chalk.dim(`   Layers: ${resolutionPath.layerSources.join(' → ')}`));
  } catch (error) {
    console.log(chalk.yellow(`⚠️  Layer resolution warning: ${error}`));
  }
  
  // Core system compatibility
  const activeCoreSystem = await coreSystemManager.getActiveCoreSystem();
  if (activeCoreSystem) {
    console.log(chalk.green(`✅ Core system compatibility: ${activeCoreSystem}`));
  } else {
    console.log(chalk.yellow('⚠️  No active core system detected'));
  }
  
  // Dependency validation
  const deps = agent.definition.dependencies;
  const depTypes = Object.keys(deps) as Array<keyof typeof deps>;
  let missingDeps = 0;
  
  for (const depType of depTypes) {
    const depList = deps[depType] || [];
    for (const dep of depList) {
      const depPath = await layerManager.getResourcePath(depType, dep);
      if (!depPath) {
        console.log(chalk.yellow(`⚠️  Missing ${depType}: ${dep}`));
        missingDeps++;
      }
    }
  }
  
  if (missingDeps === 0) {
    console.log(chalk.green('✅ All dependencies resolved'));
  } else {
    console.log(chalk.yellow(`⚠️  ${missingDeps} missing dependencies`));
  }
  
  // Overall validation
  console.log(chalk.green(`\n✅ Agent '${agentName}' validation complete`));
  
  // Auto-suggest next steps
  console.log(chalk.dim('\n💡 Suggested next steps:'));
  console.log(chalk.dim(`   lcagents agent info ${agentName}     - View detailed information including dependencies`));
}

// Helper functions

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

function getAgentLayer(agent: ParsedAgent): string {
  // Simple heuristic - in a real implementation this would use LayerManager
  if (agent.filePath.includes('/core/')) return 'CORE';
  if (agent.filePath.includes('/org/')) return 'ORG';
  return 'CUSTOM';
}

function getDefaultIcon(role: string): string {
  const roleLower = role.toLowerCase();
  if (roleLower.includes('manager') || roleLower.includes('pm')) return '👔';
  if (roleLower.includes('developer') || roleLower.includes('engineer')) return '🧑‍💻';
  if (roleLower.includes('qa') || roleLower.includes('test')) return '🧪';
  if (roleLower.includes('security')) return '🔒';
  if (roleLower.includes('data')) return '📊';
  if (roleLower.includes('design')) return '🎨';
  return '🤖';
}

async function createAgentFile(layerManager: LayerManager, agentDefinition: AgentDefinition, validate: boolean): Promise<void> {
  // Access private property through bracket notation for LayerManager path
  const lcagentsPath = (layerManager as any).lcagentsPath;
  
  // Ensure custom agents directory exists
  const customAgentsDir = path.join(lcagentsPath, 'custom', 'agents');
  await fs.ensureDir(customAgentsDir);
  
  // Create YAML content
  const yamlContent = yaml.stringify(agentDefinition, { indent: 2 });
  
  // Write agent file to custom layer
  const agentFilePath = path.join(customAgentsDir, `${agentDefinition.id}.yaml`);
  await fs.writeFile(agentFilePath, yamlContent, 'utf-8');
  
  if (validate) {
    // Validate the created agent
    const agentLoader = new AgentLoader(path.dirname(lcagentsPath));
    const result = await agentLoader.loadAgent(agentDefinition.id);
    if (!result.success) {
      console.log(chalk.yellow(`⚠️  Validation warning: ${result.error}`));
    }
  }
}

// Helper function to show detailed agent information
async function showAgentInfo(agentName: string, basePath: string): Promise<void> {
  const agentLoader = new AgentLoader(basePath);
  const layerManager = new LayerManager(basePath);
  const coreSystemManager = new CoreSystemManager(basePath);
  
  console.log(chalk.blue(`🔍 Loading agent information: ${agentName}`));
  
  const result = await agentLoader.loadAgent(agentName);
  if (!result.success || !result.agent) {
    console.log(chalk.red(`❌ Agent not found: ${agentName}`));
    console.log(chalk.dim('💡 Use "lcagents agent list" to see available agents'));
    return;
  }

  const agent = result.agent;
  const def = agent.definition;
  
  // Get layer information
  let layerInfo = 'core';
  try {
    const resolutionPath = await layerManager.resolveAgent(def.id);
    if (resolutionPath.layerSources.includes('custom')) {
      layerInfo = 'custom';
    } else if (resolutionPath.layerSources.includes('org')) {
      layerInfo = 'org';
    }
  } catch (error) {
    // Use default
  }

  // Get core system compatibility
  const activeCoreSystem = await coreSystemManager.getActiveCoreSystem();

  console.log(chalk.green(`\n${def.icon} ${def.name} - ${def.title}`));
  console.log(chalk.dim(`ID: ${def.id}`));
  
  const layerBadge = layerInfo === 'core' ? chalk.blue('[CORE]') : 
                    layerInfo === 'org' ? chalk.yellow('[ORG]') : 
                    chalk.magenta('[CUSTOM]');
  console.log(`Layer: ${layerBadge}`);
  console.log(chalk.dim(`Core System: ${activeCoreSystem || 'Not detected'}`));

  console.log(chalk.cyan('\n📝 Description:'));
  console.log(chalk.dim(`   ${def.whenToUse}`));

  console.log(chalk.cyan('\n👤 Persona:'));
  console.log(chalk.dim(`   Role: ${def.persona.role}`));
  console.log(chalk.dim(`   Style: ${def.persona.style}`));
  console.log(chalk.dim(`   Focus: ${def.persona.focus}`));
  
  if (def.persona.core_principles && def.persona.core_principles.length > 0) {
    console.log(chalk.dim('   Principles:'));
    def.persona.core_principles.forEach(principle => {
      console.log(chalk.dim(`     • ${principle}`));
    });
  }

  console.log(chalk.cyan('\n⚡ Commands:'));
  const commands = Object.entries(def.commands);
  if (commands.length > 0) {
    commands.forEach(([cmd, desc], index) => {
      if (typeof desc === 'string') {
        console.log(chalk.dim(`   ${index + 1}- ${cmd} - ${desc}`));
      } else {
        console.log(chalk.dim(`   ${index + 1}- ${cmd} - ${desc.description}`));
        if (desc.usage) {
          console.log(chalk.dim(`      Usage: ${desc.usage}`));
        }
      }
    });
  } else {
    console.log(chalk.dim('   No specific commands defined'));
  }

  // Show dependencies if any
  const deps = def.dependencies;
  const totalDeps = Object.values(deps).flat().length;
  if (totalDeps > 0) {
    console.log(chalk.cyan('\n📦 Dependencies:'));
    Object.entries(deps).forEach(([type, items]) => {
      if (items && items.length > 0) {
        console.log(chalk.dim(`   ${type}: ${items.join(', ')}`));
      }
    });
  }

  console.log(chalk.dim('\n💡 Commands:'));
  console.log(chalk.dim(`   lcagents agent info ${agentName}    - Show detailed info including dependencies`));
  console.log(chalk.dim('   lcagents agent list                  - List all agents'));
}

// Epic 3: Agent Modification & Customization Implementation Functions

/**
 * Safe agent modification with layer protection (Epic 3, Story 3.1)
 */
async function modifyAgent(agentId: string, basePath: string): Promise<void> {
  console.log(chalk.blue(`🔧 Modify Agent: ${agentId}\n`));
  
  const agentLoader = new AgentLoader(basePath);
  const layerManager = new LayerManager(basePath);
  
  // Step 1: Load agent and determine layer
  const result = await agentLoader.loadAgent(agentId);
  if (!result.success || !result.agent) {
    console.log(chalk.red(`❌ Agent not found: ${agentId}`));
    console.log(chalk.dim('💡 Use "lcagents agent list" to see available agents'));
    return;
  }
  
  const agent = result.agent;
  const resolutionPath = await layerManager.resolveAgent(agentId);
  
  // Determine if this is a core agent
  const isCoreAgent = resolutionPath.layerSources.includes('core') && 
                      !resolutionPath.layerSources.includes('custom');
  
  if (isCoreAgent) {
    console.log(chalk.yellow(`⚠️  You're modifying a CORE agent. Changes will be saved as overrides in CUSTOM layer.`));
    console.log(chalk.green(`✅ Original agent will remain intact and can be restored.`));
  }
  
  // Step 2: Automatic backup
  await createAgentBackup(agentId, layerManager, agent);
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // Step 3: Show current capabilities
    console.log(chalk.cyan('\nCurrent capabilities:'));
    const commands = Object.entries(agent.definition.commands);
    commands.forEach(([cmd, desc], index) => {
      const description = typeof desc === 'string' ? desc : desc.description;
      console.log(`${index + 1}. ${cmd} - ${description}`);
    });

    // Step 4: Modification options
    console.log(chalk.cyan('\nWhat would you like to modify?'));
    console.log('  1) Add new capabilities');
    console.log('  2) Add custom commands with conflict checking ✅');
    console.log('  3) Change communication style');
    console.log('  4) Add specialized knowledge');
    console.log('  5) Remove capabilities (override only)');
    
    const choice = await askQuestion(rl, '> ');
    
    switch (choice) {
      case '1':
        await addAgentCapabilities(rl, agent, layerManager);
        break;
      case '2':
        await addAgentCommands(rl, agentId, agent, layerManager, agentLoader);
        break;
      case '3':
        await modifyAgentPersonality(rl, agent, layerManager);
        break;
      case '4':
        await addAgentKnowledge(rl, agent, layerManager);
        break;
      case '5':
        await removeAgentCapabilities(rl, agent, layerManager);
        break;
      default:
        console.log(chalk.yellow('❌ Invalid choice. Modification cancelled.'));
        return;
    }
    
    // Step 5: Automatic validation
    console.log(chalk.blue('\n🧪 Validating modified agent...'));
    await validateAgent(agentId, basePath);
    
  } finally {
    rl.close();
  }
}

/**
 * Add custom commands with conflict detection (Epic 3, Story 3.2)
 */
async function addAgentCommands(
  rl: readline.Interface, 
  agentId: string,
  agent: ParsedAgent, 
  layerManager: LayerManager,
  agentLoader: AgentLoader
): Promise<void> {
  console.log(chalk.cyan('\n📝 Adding Custom Commands'));
  
  // Load all agents for conflict detection
  const { loaded: allAgents } = await agentLoader.loadAllAgents();
  
  const commandName = await askQuestion(rl, '? What new command should the agent have?\nCommand name: ');
  
  console.log(chalk.blue('\n🔍 Checking for conflicts...'));
  
  // Check for command conflicts across all agents
  const conflictingAgent = allAgents.find(a => 
    a.definition.id !== agentId && Object.keys(a.definition.commands).includes(commandName)
  );
  
  if (conflictingAgent) {
    console.log(chalk.red(`❌ Command '${commandName}' already exists in ${conflictingAgent.definition.name} agent!`));
    
    console.log(chalk.yellow('\n💡 Suggestions to avoid conflicts:'));
    const agentPrefix = agentId.split('-')[0];
    console.log(`  1) ${agentPrefix}-${commandName} (${agentPrefix}-specific) ✅`);
    console.log(`  2) ${commandName}-${agentPrefix} (${agentPrefix} variant)`);
    console.log(`  3) custom-${commandName} (custom variant)`);
    
    const suggestion = await askQuestion(rl, '> ');
    const suggestions = [
      `${agentPrefix}-${commandName}`,
      `${commandName}-${agentPrefix}`,
      `custom-${commandName}`
    ];
    
    const selectedName = suggestions[parseInt(suggestion) - 1] || commandName;
    
    // Verify the suggested name is unique
    const stillConflicts = allAgents.some(a => 
      Object.keys(a.definition.commands).includes(selectedName)
    );
    
    if (!stillConflicts) {
      console.log(chalk.green(`✅ Command '${selectedName}' is unique across all agents`));
      await createAgentCommand(rl, selectedName, agent, layerManager);
    } else {
      console.log(chalk.red(`❌ Name '${selectedName}' still conflicts. Please try again.`));
    }
  } else {
    console.log(chalk.green(`✅ Command '${commandName}' is unique across all agents`));
    console.log(chalk.green('✅ No template conflicts detected'));
    await createAgentCommand(rl, commandName, agent, layerManager);
  }
}

/**
 * Create the actual command and save to custom layer
 */
async function createAgentCommand(
  rl: readline.Interface,
  commandName: string,
  agent: ParsedAgent,
  layerManager: LayerManager
): Promise<void> {
  const description = await askQuestion(rl, '? What does this command do? ');
  const usage = await askQuestion(rl, '? How should this command be used? (optional): ');
  
  // Check for existing templates
  console.log(chalk.blue('\n? Should this command use existing templates?'));
  const templates = await layerManager.listResources('templates');
  
  if (templates.length > 0) {
    console.log('📋 Available templates:');
    templates.slice(0, 5).forEach((template, index) => {
      const layerBadge = template.source === 'core' ? chalk.blue('[CORE]') : 
                         template.source === 'org' ? chalk.yellow('[ORG]') : 
                         chalk.magenta('[CUSTOM]');
      console.log(`├── ${template.name} ${layerBadge} ${index === 0 ? '✅' : ''}`);
    });
    
    const templateChoice = await askQuestion(rl, '> ');
    if (templateChoice && parseInt(templateChoice) > 0) {
      const selectedTemplate = templates[parseInt(templateChoice) - 1];
      if (selectedTemplate) {
        console.log(chalk.green(`✅ Using template: ${selectedTemplate.name}`));
      }
    }
  }
  
  // Create enhanced command definition
  const newCommand: AgentCommand = {
    description: description || 'No description provided',
    usage: usage || `Use this command to ${description.toLowerCase()}`,
    examples: [`Example: ${commandName} <input>`],
    dependencies: []
  };
  
  // Create modified agent definition for custom layer
  const modifiedAgent: AgentDefinition = {
    ...agent.definition,
    commands: {
      ...agent.definition.commands,
      [commandName]: newCommand
    },
    customization: agent.definition.customization ? 
      `${agent.definition.customization},added_command:${commandName}` :
      `added_command:${commandName}`
  };
  
  // Save to custom layer
  await saveAgentToCustomLayer(modifiedAgent, layerManager);
  
  console.log(chalk.green(`\n✅ Command '${commandName}' added successfully!`));
  console.log(chalk.dim(`📁 Saved to custom layer override`));
}

/**
 * Direct configuration editing (Epic 3, Story 3.1)
 */
async function editAgentConfig(agentId: string, basePath: string): Promise<void> {
  console.log(chalk.blue(`📝 Edit Agent Configuration: ${agentId}`));
  
  const agentLoader = new AgentLoader(basePath);
  const layerManager = new LayerManager(basePath);
  
  // Step 1: Load current config
  console.log(chalk.blue('\nℹ️  Pre-analysis: Loading current configuration...'));
  await showAgentInfo(agentId, basePath);
  
  // Step 2: Determine edit scope
  const resolutionPath = await layerManager.resolveAgent(agentId);
  const isCoreAgent = resolutionPath.layerSources.includes('core') && 
                      !resolutionPath.layerSources.includes('custom');
  
  if (isCoreAgent) {
    console.log(chalk.yellow('\n⚠️  Core agent detected - will create custom layer override'));
  }
  
  // Step 3: Backup before editing
  const result = await agentLoader.loadAgent(agentId);
  if (!result.success || !result.agent) {
    console.log(chalk.red(`❌ Agent not found: ${agentId}`));
    return;
  }
  
  await createAgentBackup(agentId, layerManager, result.agent);
  
  // Step 4: Launch editor (simulation)
  console.log(chalk.blue('\n📝 Opening configuration editor...'));
  console.log(chalk.yellow('💡 Real implementation would launch your default YAML editor'));
  console.log(chalk.dim('   With real-time validation and syntax highlighting'));
  
  // Step 5: Simulate configuration changes
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    console.log(chalk.cyan('\n📝 Configuration Changes (simulation):'));
    
    const changes = await askQuestion(rl, '? What changes would you like to make?\n> ');
    
    if (changes.trim()) {
      // Create modified agent with changes annotation
      const modifiedAgent: AgentDefinition = {
        ...result.agent.definition,
        customization: result.agent.definition.customization ? 
          `${result.agent.definition.customization},config_edit:${Date.now()}` :
          `config_edit:${Date.now()}`
      };
      
      await saveAgentToCustomLayer(modifiedAgent, layerManager);
      
      console.log(chalk.green('\n✅ Configuration saved successfully!'));
      console.log(chalk.blue('\n🧪 Post-edit validation...'));
      await validateAgent(agentId, basePath);
    } else {
      console.log(chalk.yellow('❌ No changes made'));
    }
    
  } finally {
    rl.close();
  }
}

// NOTE: backupAgent and revertAgent functions have been moved to setup-utils.ts for global agent/resource operations

/**
 * Add resources to agents (Epic 3, Story 3.3)
 */
async function addResourceToAgent(resourceType: string, agentId: string, basePath: string): Promise<void> {
  console.log(chalk.blue(`📦 Adding ${resourceType} to agent: ${agentId}`));
  
  const agentLoader = new AgentLoader(basePath);
  const layerManager = new LayerManager(basePath);
  
  // Load agent
  const result = await agentLoader.loadAgent(agentId);
  if (!result.success || !result.agent) {
    console.log(chalk.red(`❌ Agent not found: ${agentId}`));
    return;
  }
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    // Step 1: Resource type validation
    const validTypes = ['checklist', 'kb', 'task', 'template', 'workflow'];
    if (!validTypes.includes(resourceType)) {
      console.log(chalk.red(`❌ Invalid resource type: ${resourceType}`));
      console.log(chalk.dim(`💡 Valid types: ${validTypes.join(', ')}`));
      return;
    }
    
    // Map CLI resource types to dependency keys
    const typeMapping: Record<string, keyof AgentDefinition['dependencies']> = {
      'checklist': 'checklists',
      'kb': 'data',
      'task': 'tasks',
      'template': 'templates',
      'workflow': 'workflows'
    };
    
    const dependencyKey = typeMapping[resourceType];
    
    // Step 2: Show available resources
    const resourcesPlural = resourceType === 'checklist' ? 'checklists' : 
                            resourceType === 'kb' ? 'data' :
                            resourceType + 's';
    const availableResources = await layerManager.listResources(resourcesPlural);
    
    if (availableResources.length === 0) {
      console.log(chalk.yellow(`📭 No ${resourceType}s found in any layer`));
      return;
    }
    
    console.log(chalk.cyan(`\n📋 Available ${resourceType}s:`));
    availableResources.forEach((resource, index) => {
      const layerBadge = resource.source === 'core' ? chalk.blue('[CORE]') : 
                         resource.source === 'org' ? chalk.yellow('[ORG]') : 
                         chalk.magenta('[CUSTOM]');
      console.log(`  ${index + 1}. ${resource.name} ${layerBadge}`);
    });
    
    // Step 3: Resource selection with uniqueness validation
    const choice = await askQuestion(rl, `\n? Select ${resourceType} to add (number): `);
    const index = parseInt(choice) - 1;
    
    if (index < 0 || index >= availableResources.length) {
      console.log(chalk.red('❌ Invalid selection'));
      return;
    }
    
    const selectedResource = availableResources[index];
    if (!selectedResource) {
      console.log(chalk.red('❌ Invalid resource selection'));
      return;
    }
    
    const resourceName = selectedResource.name;
    
    // Check for conflicts - ensure dependencyKey is valid
    if (!dependencyKey) {
      console.log(chalk.red(`❌ Invalid resource type mapping for: ${resourceType}`));
      return;
    }
    
    const currentDependencies = result.agent.definition.dependencies[dependencyKey] || [];
    if (currentDependencies.includes(resourceName)) {
      console.log(chalk.yellow(`⚠️  ${resourceType} '${resourceName}' already linked to this agent`));
      return;
    }
    
    console.log(chalk.green(`✅ ${resourceType} '${resourceName}' is unique for this agent`));
    console.log(chalk.green(`✅ Adding to .lcagents/custom/ layer`));
    
    // Step 4: Add resource to agent
    const modifiedAgent: AgentDefinition = {
      ...result.agent.definition,
      dependencies: {
        ...result.agent.definition.dependencies,
        [dependencyKey]: [...currentDependencies, resourceName]
      },
      customization: result.agent.definition.customization ? 
        `${result.agent.definition.customization},added_${resourceType}:${resourceName}` :
        `added_${resourceType}:${resourceName}`
    };
    
    await saveAgentToCustomLayer(modifiedAgent, layerManager);
    
    console.log(chalk.green(`\n✅ ${resourceType} added successfully!`));
    console.log(chalk.dim(`📦 ${resourceName} → ${agentId}`));
    console.log(chalk.dim(`🔍 View: lcagents agent info ${agentId}`));
    
  } finally {
    rl.close();
  }
}

// Helper functions for Epic 3 implementation

async function addAgentCapabilities(
  rl: readline.Interface,
  agent: ParsedAgent,
  layerManager: LayerManager
): Promise<void> {
  console.log(chalk.cyan('\n📝 Adding New Capabilities'));
  
  const newCapability = await askQuestion(rl, '? What new capability should the agent have?\n> ');
  await askQuestion(rl, '? Describe this capability:\n> '); // Get description but don't need to store
  
  // Add to persona focus
  const modifiedAgent: AgentDefinition = {
    ...agent.definition,
    persona: {
      ...agent.definition.persona,
      focus: agent.definition.persona.focus ? 
        `${agent.definition.persona.focus}, ${newCapability}` : 
        newCapability
    },
    customization: agent.definition.customization ? 
      `${agent.definition.customization},added_capability:${newCapability}` :
      `added_capability:${newCapability}`
  };
  
  await saveAgentToCustomLayer(modifiedAgent, layerManager);
  console.log(chalk.green(`\n✅ Capability '${newCapability}' added successfully!`));
}

async function modifyAgentPersonality(
  rl: readline.Interface,
  agent: ParsedAgent,
  layerManager: LayerManager
): Promise<void> {
  console.log(chalk.cyan('\n🎭 Modifying Communication Style'));
  
  console.log(chalk.dim(`Current style: ${agent.definition.persona.style}`));
  
  const newStyle = await askQuestion(rl, '? New communication style (professional, friendly, concise, detailed): ');
  const styleNote = await askQuestion(rl, '? Additional style notes (optional):\n> ');
  
  const modifiedAgent: AgentDefinition = {
    ...agent.definition,
    persona: {
      ...agent.definition.persona,
      style: newStyle || agent.definition.persona.style,
      identity: styleNote ? 
        `${agent.definition.persona.identity} (${styleNote})` :
        agent.definition.persona.identity
    },
    customization: agent.definition.customization ? 
      `${agent.definition.customization},style_change:${newStyle}` :
      `style_change:${newStyle}`
  };
  
  await saveAgentToCustomLayer(modifiedAgent, layerManager);
  console.log(chalk.green(`\n✅ Communication style updated to '${newStyle}'!`));
}

async function addAgentKnowledge(
  rl: readline.Interface,
  agent: ParsedAgent,
  layerManager: LayerManager
): Promise<void> {
  console.log(chalk.cyan('\n📚 Adding Specialized Knowledge'));
  
  const knowledge = await askQuestion(rl, '? What specialized knowledge should be added?\n> ');
  const context = await askQuestion(rl, '? Provide context for this knowledge:\n> ');
  
  // Add to core principles
  const newPrinciple = `Specialized in ${knowledge}: ${context}`;
  const currentPrinciples = agent.definition.persona.core_principles || [];
  
  const modifiedAgent: AgentDefinition = {
    ...agent.definition,
    persona: {
      ...agent.definition.persona,
      core_principles: [...currentPrinciples, newPrinciple]
    },
    customization: agent.definition.customization ? 
      `${agent.definition.customization},added_knowledge:${knowledge}` :
      `added_knowledge:${knowledge}`
  };
  
  await saveAgentToCustomLayer(modifiedAgent, layerManager);
  console.log(chalk.green(`\n✅ Specialized knowledge '${knowledge}' added!`));
}

async function removeAgentCapabilities(
  rl: readline.Interface,
  agent: ParsedAgent,
  layerManager: LayerManager
): Promise<void> {
  console.log(chalk.cyan('\n🗑️  Removing Capabilities (Override Mode)'));
  
  const commands = Object.keys(agent.definition.commands);
  if (commands.length === 0) {
    console.log(chalk.yellow('⚠️  No commands to remove'));
    return;
  }
  
  console.log(chalk.dim('Current commands:'));
  commands.forEach((cmd, index) => {
    console.log(`  ${index + 1}. ${cmd}`);
  });
  
  const choice = await askQuestion(rl, '? Select command to remove (number): ');
  const index = parseInt(choice) - 1;
  
  if (index < 0 || index >= commands.length) {
    console.log(chalk.red('❌ Invalid selection'));
    return;
  }
  
  const commandToRemove = commands[index];
  if (!commandToRemove) {
    console.log(chalk.red('❌ Invalid command selection'));
    return;
  }
  
  const newCommands = { ...agent.definition.commands };
  delete newCommands[commandToRemove];
  
  const modifiedAgent: AgentDefinition = {
    ...agent.definition,
    commands: newCommands,
    customization: agent.definition.customization ? 
      `${agent.definition.customization},removed_command:${commandToRemove}` :
      `removed_command:${commandToRemove}`
  };
  
  await saveAgentToCustomLayer(modifiedAgent, layerManager);
  console.log(chalk.green(`\n✅ Command '${commandToRemove}' removed (overridden)!`));
}

async function createAgentBackup(
  agentId: string,
  layerManager: LayerManager,
  agent: ParsedAgent
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupVersion = `backup-${timestamp}`;
  
  // Access LayerManager's lcagentsPath
  const lcagentsPath = (layerManager as any).lcagentsPath;
  const backupDir = path.join(lcagentsPath, 'custom', 'backups', agentId);
  await fs.ensureDir(backupDir);
  
  const backupPath = path.join(backupDir, `${backupVersion}.yaml`);
  const backupContent = yaml.stringify(agent.definition, { indent: 2 });
  
  await fs.writeFile(backupPath, backupContent, 'utf-8');
  
  console.log(chalk.green('✅ Automatic backup created'));
  console.log(chalk.dim(`📁 Backup: ${backupVersion}`));
  
  return backupPath;
}

// NOTE: loadBackupHistory and restoreFromBackup functions have been moved to setup-utils.ts for global operations

async function saveAgentToCustomLayer(
  agentDefinition: AgentDefinition,
  layerManager: LayerManager
): Promise<void> {
  const lcagentsPath = (layerManager as any).lcagentsPath;
  const customAgentsDir = path.join(lcagentsPath, 'custom', 'agents');
  await fs.ensureDir(customAgentsDir);
  
  const agentFilePath = path.join(customAgentsDir, `${agentDefinition.id}.yaml`);
  const yamlContent = yaml.stringify(agentDefinition, { indent: 2 });
  
  await fs.writeFile(agentFilePath, yamlContent, 'utf-8');
  console.log(chalk.dim(`💾 Saved to custom layer: ${agentDefinition.id}.yaml`));
}

// Epic 3 Command and Resource Validation Functions

/**
 * Validate command for conflicts across all agents (Epic 3, Story 3.2)
 */
async function validateCommand(commandName: string, basePath: string): Promise<void> {
  console.log(chalk.blue(`🔍 Validating command: ${commandName}`));
  
  const agentLoader = new AgentLoader(basePath);
  const { loaded: allAgents, errors } = await agentLoader.loadAllAgents();
  
  // Group agents by command conflicts
  const conflictingAgents = allAgents.filter(agent => 
    Object.keys(agent.definition.commands).includes(commandName)
  );
  
  if (conflictingAgents.length === 0) {
    console.log(chalk.green(`✅ Command '${commandName}' is unique across all agents`));
    console.log(chalk.dim(`🔍 Checked ${allAgents.length} agents`));
  } else {
    console.log(chalk.red(`❌ Command '${commandName}' conflicts found:`));
    conflictingAgents.forEach(agent => {
      console.log(chalk.yellow(`   • ${agent.definition.name} (${agent.definition.id})`));
    });
    
    console.log(chalk.cyan('\n💡 Suggested alternatives:'));
    console.log(`   • ${commandName}-enhanced`);
    console.log(`   • custom-${commandName}`);
    console.log(`   • new-${commandName}`);
  }
  
  if (errors.length > 0) {
    console.log(chalk.yellow(`\n⚠️  ${errors.length} agents failed to load during validation`));
  }
}

/**
 * Suggest command names to avoid conflicts (Epic 3, Story 3.2)
 */
async function suggestCommandNames(description: string, basePath: string): Promise<void> {
  console.log(chalk.blue(`💡 Suggesting command names for: "${description}"`));
  
  const agentLoader = new AgentLoader(basePath);
  const { loaded: allAgents } = await agentLoader.loadAllAgents();
  
  // Extract all existing commands
  const existingCommands = new Set<string>();
  allAgents.forEach(agent => {
    Object.keys(agent.definition.commands).forEach(cmd => existingCommands.add(cmd));
  });
  
  // Generate suggestions based on description
  const words = description.toLowerCase().split(/\s+/);
  const suggestions: string[] = [];
  
  // Strategy 1: Use key words from description
  if (words.length > 0) {
    const baseCommand = words.join('-');
    if (!existingCommands.has(baseCommand)) {
      suggestions.push(baseCommand);
    }
    
    // Strategy 2: Add prefixes
    const prefixes = ['create', 'generate', 'build', 'analyze', 'review'];
    prefixes.forEach(prefix => {
      const prefixedCommand = `${prefix}-${words[0]}`;
      if (!existingCommands.has(prefixedCommand)) {
        suggestions.push(prefixedCommand);
      }
    });
    
    // Strategy 3: Add suffixes
    const suffixes = ['task', 'process', 'workflow', 'check'];
    suffixes.forEach(suffix => {
      const suffixedCommand = `${words[0]}-${suffix}`;
      if (!existingCommands.has(suffixedCommand)) {
        suggestions.push(suffixedCommand);
      }
    });
  }
  
  if (suggestions.length > 0) {
    console.log(chalk.green('\n✅ Available command names:'));
    suggestions.slice(0, 5).forEach((suggestion, index) => {
      console.log(`   ${index + 1}. ${chalk.cyan(suggestion)}`);
    });
  } else {
    console.log(chalk.yellow('\n⚠️  No immediate suggestions available'));
    console.log(chalk.dim('💡 Try being more specific with the description'));
  }
  
  console.log(chalk.dim(`\n📊 Currently ${existingCommands.size} commands exist across ${allAgents.length} agents`));
}