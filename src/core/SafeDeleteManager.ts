import * as fs from 'fs-extra';
import * as path from 'path';
import { ResourceResolver } from './ResourceResolver';
import { LayerManager } from './LayerManager';
import { ResourceType } from '../types/Resources';
import { CoreSystemManager } from './CoreSystemManager';
import { LCAgentsConfig } from '../types/Config';

export interface DeleteOptions {
    force?: boolean;
    updateDeps?: boolean;
    skipBackup?: boolean;
}

interface ResourceDependency {
    type: 'agent' | 'resource';
    name: string;
    path: string;
}

interface DependencyCheckResult {
    hasActive: boolean;
    dependencies: ResourceDependency[];
    isCore: boolean;
}

interface BackupMetadata {
    timestamp: string;
    resourceName: string;
    resourceType: string;
    dependencies: ResourceDependency[];
    originalPath: string;
}

export class SafeDeleteManager {
    private readonly backupDir = '.lcagents/backups';
    private readonly basePath: string;
    private resourceResolver!: ResourceResolver;
    private layerManager!: LayerManager;

    constructor(basePath: string) {
        this.basePath = basePath;
        this.initialize();
    }

    private async initialize(): Promise<void> {
        const coreSystemManager = new CoreSystemManager(this.basePath);
        const activeCore = await coreSystemManager.getActiveCoreConfig();
        if (!activeCore) {
            throw new Error('No active core configuration found');
        }
        const config = {
            version: '1.0.0',  // Default version
            name: 'lcagents',  // Default name
            description: 'Local LCAgents Configuration',
            core: activeCore
        } as LCAgentsConfig;
        this.resourceResolver = new ResourceResolver(this.basePath, config);
        this.layerManager = new LayerManager(this.basePath);
        await this.ensureBackupDir();
    }

    private async ensureBackupDir(): Promise<void> {
        await fs.ensureDir(this.backupDir);
    }

    /**
     * Check if a resource is part of the core system
     */
    private async isCoreResource(resourcePath: string): Promise<boolean> {
        return resourcePath.includes('.lcagents/core/');
    }

    /**
     * Create a backup of the resource and its metadata
     */
    private async createBackup(
        resourceName: string,
        resourceType: ResourceType,
        dependencies: ResourceDependency[]
    ): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `${resourceName}-${timestamp}`;
        const backupPath = path.join(this.backupDir, backupName);

        // Get the original resource path
        const originalPath = await this.layerManager.getResourcePath(resourceType, resourceName);
        if (!originalPath) {
            throw new Error(`Resource not found: ${resourceName}`);
        }

        // Create backup metadata
        const metadata: BackupMetadata = {
            timestamp,
            resourceName,
            resourceType,
            dependencies,
            originalPath
        };

        // Create backup directory and copy resource
        await fs.ensureDir(backupPath);
        await fs.copy(originalPath, path.join(backupPath, path.basename(originalPath)));
        await fs.writeJSON(path.join(backupPath, 'metadata.json'), metadata, { spaces: 2 });

        return backupPath;
    }

    /**
     * Check for dependencies on a resource
     */
    public async checkDependencies(
        resourceName: string,
        resourceType: ResourceType
    ): Promise<DependencyCheckResult> {
        const dependencies: ResourceDependency[] = [];
        const resourcePath = await this.layerManager.getResourcePath(resourceType, resourceName);

        if (!resourcePath) {
            throw new Error(`Resource not found: ${resourceName}`);
        }

        const isCore = await this.isCoreResource(resourcePath);

        // Check agent dependencies
        const agents = await this.layerManager.listAgents();
        for (const agentName of agents) {
            try {
                const agent = await this.layerManager.loadAgent(agentName);
                const agentDeps = agent.dependencies || {};
                // Check all dependency arrays for resource name
                const allDeps = Object.values(agentDeps);
                if (allDeps.some(deps => Array.isArray(deps) && deps.includes(resourceName))) {
                    dependencies.push({
                        type: 'agent',
                        name: agentName,
                        path: agent.path.corePath
                    });
                }
            } catch (error) {
                console.warn(`Failed to check dependencies for agent ${agentName}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        // Check resource dependencies
        const resources = await this.layerManager.listResources(resourceType);
        for (const resource of resources) {
            // Skip checking the resource against itself
            if (resource.name === resourceName) continue;

            const metadata = await this.resourceResolver.getResourceMetadata(resourceType, resource.name);
            if (metadata?.dependencies?.includes(resourceName)) {
                dependencies.push({
                    type: 'resource',
                    name: resource.name,
                    path: resource.path
                });
            }
        }

        return {
            hasActive: dependencies.length > 0,
            dependencies,
            isCore
        };
    }

    /**
     * Restore a backup
     */
    public async restoreBackup(backupPath: string): Promise<void> {
        const metadataPath = path.join(backupPath, 'metadata.json');
        if (!await fs.pathExists(metadataPath)) {
            throw new Error('Invalid backup: metadata not found');
        }

        const metadata: BackupMetadata = await fs.readJSON(metadataPath);
        const originalPath = metadata.originalPath;

        // Verify the original path is valid
        const parentDir = path.dirname(originalPath);
        if (!await fs.pathExists(parentDir)) {
            throw new Error('Original resource location no longer exists');
        }

        // Restore the resource
        const backupFile = path.join(backupPath, path.basename(metadata.originalPath));
        await fs.copy(backupFile, originalPath);
    }

    /**
     * Safely delete a resource with all checks and backups
     */
    public async safeDelete(
        resourceName: string,
        resourceType: ResourceType,
        options: Partial<DeleteOptions> = {}
    ): Promise<void> {
        const defaultOptions: DeleteOptions = {
            force: false,
            updateDeps: false,
            skipBackup: false
        };
        const fullOptions: DeleteOptions = { ...defaultOptions, ...options };
        // 1. Check dependencies
        const dependencyCheck = await this.checkDependencies(resourceName, resourceType);

        // 2. Validate core system
        if (dependencyCheck.isCore) {
            throw new Error(
                'Cannot delete core system resources. These resources are immutable.'
            );
        }

        // 3. Check for active dependencies
        if (dependencyCheck.hasActive && !fullOptions.force) {
            const depList = dependencyCheck.dependencies
                .map(d => `${d.type} ${d.name}`)
                .join(', ');
            throw new Error(
                `Resource has active dependencies: ${depList}. Use --force to override.`
            );
        }

        // 4. Create backup unless explicitly skipped
        let backupPath: string | undefined;
        if (!fullOptions.skipBackup) {
            backupPath = await this.createBackup(
                resourceName,
                resourceType,
                dependencyCheck.dependencies
            );
        }

        try {
            // 5. Get resource path
            const resourcePath = await this.layerManager.getResourcePath(resourceType, resourceName);
            if (!resourcePath) {
                throw new Error(`Resource not found: ${resourceName}`);
            }

            // 6. Delete the resource
            await fs.remove(resourcePath);

            // 7. Update dependencies if requested
            if (fullOptions.updateDeps) {
                await this.updateDependencies(resourceName, dependencyCheck.dependencies);
            }

        } catch (error) {
            // 8. Restore from backup if something goes wrong
            if (backupPath) {
                await this.restoreBackup(backupPath);
            }
            throw error;
        }
    }

    /**
     * Update dependencies after resource deletion
     */
    private async updateDependencies(
        resourceName: string,
        dependencies: ResourceDependency[]
    ): Promise<void> {
        for (const dep of dependencies) {
            if (dep.type === 'agent') {
                // Update agent dependencies
                const agent = await this.layerManager.loadAgent(dep.name);
                if (agent) {
                    // Remove the resource from all dependency arrays
                    Object.values(agent.definition.dependencies || {}).forEach(deps => {
                        if (Array.isArray(deps)) {
                            const index = deps.indexOf(resourceName);
                            if (index > -1) {
                                deps.splice(index, 1);
                            }
                        }
                    });
                    await this.layerManager.saveAgent(agent);
                }
            }
            // Resource dependencies are handled similarly if needed
        }
    }
}