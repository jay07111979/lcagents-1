import * as fs from 'fs-extra';
import * as path from 'path';
import { ResourceType, ResourceResolutionResult } from '../types/Resources';
import { LCAgentsConfig } from '../types/Config';

export class ResourceResolver {
  private basePath: string;
  private config: LCAgentsConfig;

  constructor(basePath: string, config: LCAgentsConfig) {
    this.basePath = basePath;
    this.config = config;
  }

  /**
   * Resolve a task file by name
   */
  async resolveTask(taskName: string): Promise<ResourceResolutionResult> {
    return this.resolveResource('tasks', taskName);
  }

  /**
   * Resolve a template file by name
   */
  async resolveTemplate(templateName: string): Promise<ResourceResolutionResult> {
    return this.resolveResource('templates', templateName);
  }

  /**
   * Get metadata for a resource
   */
  async getResourceMetadata(resourceType: ResourceType, resourceName: string): Promise<any> {
    const metadataPath = path.join(this.basePath, '.lcagents', 'metadata', resourceType, `${resourceName}.json`);
    if (await fs.pathExists(metadataPath)) {
      return fs.readJson(metadataPath);
    }
    return null;
  }

  /**
   * Resolve a checklist file by name
   */
  async resolveChecklist(checklistName: string): Promise<ResourceResolutionResult> {
    return this.resolveResource('checklists', checklistName);
  }

  /**
   * Resolve a data file by name
   */
  async resolveData(dataName: string): Promise<ResourceResolutionResult> {
    return this.resolveResource('data', dataName);
  }

  /**
   * Resolve a utility file by name
   */
  async resolveUtil(utilName: string): Promise<ResourceResolutionResult> {
    return this.resolveResource('utils', utilName);
  }

  /**
   * Resolve a workflow file by name
   */
  async resolveWorkflow(workflowName: string): Promise<ResourceResolutionResult> {
    return this.resolveResource('workflows', workflowName);
  }

  /**
   * Resolve an agent team configuration by name
   */
  async resolveAgentTeam(teamName: string): Promise<ResourceResolutionResult> {
    return this.resolveResource('agent-teams', teamName);
  }

  /**
   * Generic resource resolution using .lcagents/{type}/{name} pattern
   */
  async resolveResource(type: ResourceType, name: string): Promise<ResourceResolutionResult> {
    try {
      const resourcePath = this.getResourcePath(type, name);
      
      // Check if file exists
      const exists = await fs.pathExists(resourcePath);
      if (!exists) {
        return {
          found: false,
          error: `Resource not found: ${type}/${name} at ${resourcePath}`
        };
      }

      // Validate file is readable
      try {
        await fs.access(resourcePath, fs.constants.R_OK);
      } catch (error) {
        return {
          found: false,
          error: `Resource not readable: ${type}/${name} - ${error}`
        };
      }

      // Read file content
      const content = await fs.readFile(resourcePath, 'utf-8');
      
      return {
        found: true,
        path: resourcePath,
        content
      };
    } catch (error) {
      return {
        found: false,
        error: `Error resolving resource ${type}/${name}: ${error}`
      };
    }
  }

  /**
   * Get the full path for a resource
   */
  private getResourcePath(type: ResourceType, name: string): string {
    const typeDir = this.config.paths?.[type] || `.lcagents/${type}`;
    return path.join(this.basePath, typeDir, name);
  }

  /**
   * Validate that all expected files exist after installation
   */
  async validateAllResources(): Promise<{ valid: boolean; missing: string[]; errors: string[] }> {
    const missing: string[] = [];
    const errors: string[] = [];

    const resourceTypes: ResourceType[] = [
      'agents', 'tasks', 'templates', 'checklists', 
      'data', 'utils', 'workflows', 'agent-teams'
    ];

    for (const type of resourceTypes) {
      const typeDir = this.getResourcePath(type, '');
      
      try {
        const exists = await fs.pathExists(typeDir);
        if (!exists) {
          missing.push(`${type} directory`);
          continue;
        }

        // Check if directory is readable
        try {
          await fs.access(typeDir, fs.constants.R_OK);
        } catch (error) {
          errors.push(`Cannot read ${type} directory: ${error}`);
        }
      } catch (error) {
        errors.push(`Error checking ${type} directory: ${error}`);
      }
    }

    return {
      valid: missing.length === 0 && errors.length === 0,
      missing,
      errors
    };
  }

  /**
   * List all available resources of a specific type
   */
  async listResources(type: ResourceType): Promise<string[]> {
    try {
      const typeDir = this.getResourcePath(type, '');
      const exists = await fs.pathExists(typeDir);
      
      if (!exists) {
        return [];
      }

      const files = await fs.readdir(typeDir);
      return files.filter((file: string) => !file.startsWith('.'));
    } catch (error) {
      console.error(`Error listing ${type} resources:`, error);
      return [];
    }
  }

  /**
   * Check file permissions for read/write operations
   */
  async checkPermissions(resourcePath: string): Promise<{ read: boolean; write: boolean; error?: string }> {
    try {
      let read = false;
      let write = false;

      try {
        await fs.access(resourcePath, fs.constants.R_OK);
        read = true;
      } catch {
        // Read permission not available
      }

      try {
        await fs.access(resourcePath, fs.constants.W_OK);
        write = true;
      } catch {
        // Write permission not available
      }

      return { read, write };
    } catch (error) {
      return {
        read: false,
        write: false,
        error: `Error checking permissions: ${error}`
      };
    }
  }
}
