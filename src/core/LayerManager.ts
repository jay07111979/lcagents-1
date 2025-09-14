import * as fs from 'fs-extra';
import * as path from 'path';
import { 
  LayerType, 
  AgentResolutionPath,
} from '../types/CoreSystem';
import { ResourceWithSource } from '../types/Resources';
import { CoreSystemManager } from './CoreSystemManager';

export class LayerManager {
  private readonly lcagentsPath: string;
  private readonly coreSystemManager: CoreSystemManager;

  constructor(basePath: string) {
    this.lcagentsPath = path.join(basePath, '.lcagents');
    this.coreSystemManager = new CoreSystemManager(basePath);
  }

  /**
   * Resolve agent with layer precedence
   */
  async resolveAgent(agentId: string, coreSystem?: string): Promise<AgentResolutionPath> {
    const activeCore = coreSystem || await this.coreSystemManager.getActiveCoreSystem() || 'bmad-core';
    
    const activeCoreSystem = await this.coreSystemManager.getActiveCoreSystem();
    if (!activeCoreSystem) {
      return { 
        agentId, 
        coreSystem: '', 
        corePath: '', 
        finalPath: '', 
        layerSources: [] 
      };
    }
    
    const corePath = path.join(this.lcagentsPath, 'core', `.${activeCoreSystem}`, 'agents', `${agentId}.md`);
    const orgOverridePath = path.join(this.lcagentsPath, 'org', 'agents', 'overrides', `${agentId}.yaml`);
    const customOverridePath = path.join(this.lcagentsPath, 'custom', 'agents', 'overrides', `${agentId}.yaml`);
    
    const layerSources: LayerType[] = ['core'];
    let finalPath = corePath;

    // Check if org override exists
    if (await fs.pathExists(orgOverridePath)) {
      layerSources.push('org');
    }

    // Check if custom override exists  
    if (await fs.pathExists(customOverridePath)) {
      layerSources.push('custom');
    }
    
    return {
      agentId,
      coreSystem: activeCore,
      corePath,
      finalPath,
      layerSources
    };
  }

  /**
   * List all available agents
   */
  async listAgents(): Promise<string[]> {
    const activeCore = await this.coreSystemManager.getActiveCoreSystem();
    if (!activeCore) {
      return [];
    }

    const agentsPath = path.join(this.lcagentsPath, 'core', `.${activeCore}`, 'agents');
    if (!await fs.pathExists(agentsPath)) {
      return [];
    }

    const files = await fs.readdir(agentsPath);
    return files
      .filter(file => file.endsWith('.md'))
      .map(file => file.replace('.md', ''));
  }

  /**
   * Load an agent by name
   */
  async loadAgent(agentName: string): Promise<any> {
    const agentPath = await this.resolveAgent(agentName);
    if (!await fs.pathExists(agentPath.corePath)) {
      throw new Error(`Agent ${agentName} not found`);
    }
    
    const agentContent = await fs.readFile(agentPath.corePath, 'utf-8');
    return {
      name: agentName,
      content: agentContent,
      path: agentPath
    };
  }

  /**
   * Save an agent
   */
  async saveAgent(agent: any): Promise<void> {
    if (!agent.path || !agent.path.corePath) {
      throw new Error('Invalid agent object - missing path information');
    }

    const dirPath = path.dirname(agent.path.corePath);
    await fs.ensureDir(dirPath);
    await fs.writeFile(agent.path.corePath, agent.content);
  }

  /**
   * List all resources of a specific type
   */
  async listResources(resourceType: string): Promise<ResourceWithSource[]> {
    const activeCore = await this.coreSystemManager.getActiveCoreSystem();
    if (!activeCore) {
      return [];
    }

    const allResources: Array<{ name: string; path: string; source: 'core' | 'org' | 'custom' }> = [];

    // Check core layer
    const coreResourcePath = path.join(this.lcagentsPath, 'core', `.${activeCore}`, resourceType);
    if (await fs.pathExists(coreResourcePath)) {
      const coreFiles = await fs.readdir(coreResourcePath);
      allResources.push(...coreFiles.map(file => ({
        name: file,
        path: path.join(coreResourcePath, file),
        source: 'core' as const
      })));
    }

    // Check org layer
    const orgResourcePath = path.join(this.lcagentsPath, 'org', resourceType);
    if (await fs.pathExists(orgResourcePath)) {
      const orgFiles = await fs.readdir(orgResourcePath);
      allResources.push(...orgFiles.map(file => ({
        name: file,
        path: path.join(orgResourcePath, file),
        source: 'org' as const
      })));
    }

    // Check custom layer
    const customResourcePath = path.join(this.lcagentsPath, 'custom', resourceType);
    if (await fs.pathExists(customResourcePath)) {
      const customFiles = await fs.readdir(customResourcePath);
      allResources.push(...customFiles.map(file => ({
        name: file,
        path: path.join(customResourcePath, file),
        source: 'custom' as const
      })));
    }

    return allResources;
  }

  /**
   * Get the path to a resource
   */
  async getResourcePath(resourceType: string, resourceName: string): Promise<string | null> {
    const activeCore = await this.coreSystemManager.getActiveCoreSystem();
    if (!activeCore) {
      return null;
    }

    const resourcePath = path.join(this.lcagentsPath, 'core', `.${activeCore}`, resourceType, resourceName);
    return await fs.pathExists(resourcePath) ? resourcePath : null;
  }

  /**
   * Resolve a template path with layer precedence
   */
  async resolveTemplate(templateName: string): Promise<ResourceWithSource> {
    const activeCore = await this.coreSystemManager.getActiveCoreSystem();
    if (!activeCore) {
      throw new Error('No active core system found');
    }

    // Check layers in order of precedence: custom -> org -> core
    const layers: Array<'custom' | 'org' | 'core'> = ['custom', 'org', 'core'];
    for (const layer of layers) {
      let templatePath: string;
      if (layer === 'core') {
        templatePath = path.join(this.lcagentsPath, layer, `.${activeCore}`, 'templates', templateName);
      } else {
        templatePath = path.join(this.lcagentsPath, layer, 'templates', templateName);
      }

      if (await fs.pathExists(templatePath)) {
        return {
          name: templateName,
          path: templatePath,
          source: layer
        };
      }
    }

    throw new Error(`Template ${templateName} not found in any layer`);
  }

  /**
   * Read a resource content
   */
  async readResource(resourceType: string, resourceName: string): Promise<string> {
    const resourcePath = await this.getResourcePath(resourceType, resourceName);
    if (!resourcePath) {
      throw new Error(`Resource ${resourceName} of type ${resourceType} not found`);
    }
    return await fs.readFile(resourcePath, 'utf-8');
  }

  /**
   * Migrate from flat structure to layered structure
   */
  async migrateFromFlatStructure(coreSystemName: string): Promise<void> {
    const flatPath = this.lcagentsPath;
    const newCorePath = path.join(this.lcagentsPath, 'core', `.${coreSystemName}`);

    // Create new structure
    await fs.ensureDir(newCorePath);

    // Move existing files if they exist
    const resourceTypes = ['agents', 'tasks', 'templates', 'workflows', 'utils', 'data'];
    
    for (const type of resourceTypes) {
      const oldPath = path.join(flatPath, type);
      const newPath = path.join(newCorePath, type);
      
      if (await fs.pathExists(oldPath)) {
        await fs.move(oldPath, newPath, { overwrite: true });
      } else {
        await fs.ensureDir(newPath);
      }
    }
  }

  /**
   * Create layered structure
   */
  async createLayeredStructure(): Promise<void> {
    const layers = ['core', 'org', 'custom'];
    const resourceTypes = ['agents', 'tasks', 'templates', 'workflows', 'utils', 'data'];

    for (const layer of layers) {
      const layerPath = path.join(this.lcagentsPath, layer);
      await fs.ensureDir(layerPath);

      for (const type of resourceTypes) {
        await fs.ensureDir(path.join(layerPath, type));
        if (layer !== 'core') {
          await fs.ensureDir(path.join(layerPath, type, 'overrides'));
        }
      }
    }
  }

  /**
   * Create virtual resolution system structure
   */
  async createVirtualResolutionSystem(coreSystemName: string): Promise<void> {
    const vrPath = path.join(this.lcagentsPath, 'virtual');
    await fs.ensureDir(vrPath);

    const coreSystemPath = path.join(this.lcagentsPath, 'core', `.${coreSystemName}`);
    if (!await fs.pathExists(coreSystemPath)) {
      throw new Error(`Core system ${coreSystemName} not found`);
    }

    const resourceTypes = ['agents', 'tasks', 'templates', 'workflows', 'utils', 'data'];
    for (const type of resourceTypes) {
      const typePath = path.join(vrPath, type);
      await fs.ensureDir(typePath);
    }
  }
}