import { ResourceType, ResourceResolutionResult } from '../types/Resources';
import { LCAgentsConfig } from '../types/Config';
export declare class ResourceResolver {
    private basePath;
    private config;
    constructor(basePath: string, config: LCAgentsConfig);
    /**
     * Resolve a task file by name
     */
    resolveTask(taskName: string): Promise<ResourceResolutionResult>;
    /**
     * Resolve a template file by name
     */
    resolveTemplate(templateName: string): Promise<ResourceResolutionResult>;
    /**
     * Get metadata for a resource
     */
    getResourceMetadata(resourceType: ResourceType, resourceName: string): Promise<any>;
    /**
     * Resolve a checklist file by name
     */
    resolveChecklist(checklistName: string): Promise<ResourceResolutionResult>;
    /**
     * Resolve a data file by name
     */
    resolveData(dataName: string): Promise<ResourceResolutionResult>;
    /**
     * Resolve a utility file by name
     */
    resolveUtil(utilName: string): Promise<ResourceResolutionResult>;
    /**
     * Resolve a workflow file by name
     */
    resolveWorkflow(workflowName: string): Promise<ResourceResolutionResult>;
    /**
     * Resolve an agent team configuration by name
     */
    resolveAgentTeam(teamName: string): Promise<ResourceResolutionResult>;
    /**
     * Generic resource resolution using .lcagents/{type}/{name} pattern
     */
    resolveResource(type: ResourceType, name: string): Promise<ResourceResolutionResult>;
    /**
     * Get the full path for a resource
     */
    private getResourcePath;
    /**
     * Validate that all expected files exist after installation
     */
    validateAllResources(): Promise<{
        valid: boolean;
        missing: string[];
        errors: string[];
    }>;
    /**
     * List all available resources of a specific type
     */
    listResources(type: ResourceType): Promise<string[]>;
    /**
     * Check file permissions for read/write operations
     */
    checkPermissions(resourcePath: string): Promise<{
        read: boolean;
        write: boolean;
        error?: string;
    }>;
}
//# sourceMappingURL=ResourceResolver.d.ts.map