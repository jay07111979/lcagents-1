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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceResolver = void 0;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
class ResourceResolver {
    constructor(basePath, config) {
        this.basePath = basePath;
        this.config = config;
    }
    /**
     * Resolve a task file by name
     */
    async resolveTask(taskName) {
        return this.resolveResource('tasks', taskName);
    }
    /**
     * Resolve a template file by name
     */
    async resolveTemplate(templateName) {
        return this.resolveResource('templates', templateName);
    }
    /**
     * Get metadata for a resource
     */
    async getResourceMetadata(resourceType, resourceName) {
        const metadataPath = path.join(this.basePath, '.lcagents', 'metadata', resourceType, `${resourceName}.json`);
        if (await fs.pathExists(metadataPath)) {
            return fs.readJson(metadataPath);
        }
        return null;
    }
    /**
     * Resolve a checklist file by name
     */
    async resolveChecklist(checklistName) {
        return this.resolveResource('checklists', checklistName);
    }
    /**
     * Resolve a data file by name
     */
    async resolveData(dataName) {
        return this.resolveResource('data', dataName);
    }
    /**
     * Resolve a utility file by name
     */
    async resolveUtil(utilName) {
        return this.resolveResource('utils', utilName);
    }
    /**
     * Resolve a workflow file by name
     */
    async resolveWorkflow(workflowName) {
        return this.resolveResource('workflows', workflowName);
    }
    /**
     * Resolve an agent team configuration by name
     */
    async resolveAgentTeam(teamName) {
        return this.resolveResource('agent-teams', teamName);
    }
    /**
     * Generic resource resolution using .lcagents/{type}/{name} pattern
     */
    async resolveResource(type, name) {
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
            }
            catch (error) {
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
        }
        catch (error) {
            return {
                found: false,
                error: `Error resolving resource ${type}/${name}: ${error}`
            };
        }
    }
    /**
     * Get the full path for a resource
     */
    getResourcePath(type, name) {
        const typeDir = this.config.paths?.[type] || `.lcagents/${type}`;
        return path.join(this.basePath, typeDir, name);
    }
    /**
     * Validate that all expected files exist after installation
     */
    async validateAllResources() {
        const missing = [];
        const errors = [];
        const resourceTypes = [
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
                }
                catch (error) {
                    errors.push(`Cannot read ${type} directory: ${error}`);
                }
            }
            catch (error) {
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
    async listResources(type) {
        try {
            const typeDir = this.getResourcePath(type, '');
            const exists = await fs.pathExists(typeDir);
            if (!exists) {
                return [];
            }
            const files = await fs.readdir(typeDir);
            return files.filter((file) => !file.startsWith('.'));
        }
        catch (error) {
            console.error(`Error listing ${type} resources:`, error);
            return [];
        }
    }
    /**
     * Check file permissions for read/write operations
     */
    async checkPermissions(resourcePath) {
        try {
            let read = false;
            let write = false;
            try {
                await fs.access(resourcePath, fs.constants.R_OK);
                read = true;
            }
            catch {
                // Read permission not available
            }
            try {
                await fs.access(resourcePath, fs.constants.W_OK);
                write = true;
            }
            catch {
                // Write permission not available
            }
            return { read, write };
        }
        catch (error) {
            return {
                read: false,
                write: false,
                error: `Error checking permissions: ${error}`
            };
        }
    }
}
exports.ResourceResolver = ResourceResolver;
//# sourceMappingURL=ResourceResolver.js.map