export interface ResourceManifest {
  version: string;
  totalFiles: number;
  categories: {
    agents: ResourceCategory;
    tasks: ResourceCategory;
    templates: ResourceCategory;
    checklists: ResourceCategory;
    data: ResourceCategory;
    utils: ResourceCategory;
    workflows: ResourceCategory;
    'agent-teams': ResourceCategory;
  };
  checksum: string;
  generatedAt: string;
}

export interface ResourceCategory {
  count: number;
  files: ResourceFile[];
}

export interface ResourceFile {
  name: string;
  size: number;
  checksum: string;
  lastModified: string;
}

export interface ResourceWithSource {
  name: string;
  path: string;
  source: 'core' | 'org' | 'custom';
}

export interface ResourceResolutionResult {
  found: boolean;
  path?: string;
  content?: string;
  error?: string;
}

export interface ResourceValidator {
  validate(filePath: string, content: string): ResourceValidationResult;
}

export interface ResourceValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: Record<string, unknown>;
}

export type ResourceType = 
  | 'agents' 
  | 'tasks' 
  | 'templates' 
  | 'checklists' 
  | 'data' 
  | 'utils' 
  | 'workflows' 
  | 'agent-teams';

export interface ResourcePaths {
  source: string;
  target: string;
  type: ResourceType;
}
