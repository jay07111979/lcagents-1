import { Command } from 'commander';
import chalk from 'chalk';
import { SafeDeleteManager, DeleteOptions } from '../../core/SafeDeleteManager';
import { ResourceType } from '../../types/Resources';

export const deleteCommand = new Command('delete')
    .description('Safely delete a resource with dependency checking and automatic backup')
    .argument('<type>', 'Resource type (checklists, templates, data, tasks, workflows, utils)')
    .argument('<name>', 'Resource name')
    .option('--force', 'Force deletion even if dependencies exist')
    .option('--update-deps', 'Update dependencies after deletion')
    .option('--skip-backup', 'Skip creating backup (not recommended)')
    .action(async (type: string, name: string, options: Partial<DeleteOptions>) => {
        try {
            // Validate resource type
            const validTypes = ['checklists', 'templates', 'data', 'tasks', 'workflows', 'utils'];
            if (!validTypes.includes(type)) {
                console.log(chalk.red(`❌ Invalid resource type: ${type}`));
                console.log(chalk.yellow(`💡 Valid types: ${validTypes.join(', ')}`));
                return;
            }

            console.log(chalk.blue(`🗑️  Preparing to delete ${type}/${name}...`));

            const currentDir = process.cwd();
            const safeDelete = new SafeDeleteManager(currentDir);

            // Check dependencies first without deleting
            const dependencyCheck = await safeDelete.checkDependencies(name, type as ResourceType);

            // Show warning if dependencies exist
            if (dependencyCheck.hasActive && !options.force) {
                console.log(chalk.yellow('\n⚠️  Resource has dependencies:'));
                dependencyCheck.dependencies.forEach(dep => {
                    console.log(chalk.yellow(`   • ${dep.type}: ${dep.name}`));
                });
                console.log(chalk.yellow('\nUse --force to delete anyway'));
                console.log(chalk.yellow('Use --update-deps to update dependencies automatically'));
                return;
            }

            // Show warning if skipping backup
            if (options.skipBackup) {
                console.log(chalk.yellow('\n⚠️  Warning: Proceeding without backup'));
                console.log(chalk.yellow('This is not recommended and may result in unrecoverable data loss'));
            }

            // Proceed with deletion
            const deleteOptions: Partial<DeleteOptions> = {};
            if (typeof options.force !== 'undefined') deleteOptions.force = options.force;
            if (typeof options.updateDeps !== 'undefined') deleteOptions.updateDeps = options.updateDeps;
            if (typeof options.skipBackup !== 'undefined') deleteOptions.skipBackup = options.skipBackup;
            
            await safeDelete.safeDelete(name, type as ResourceType, deleteOptions);

            console.log(chalk.green('\n✅ Resource deleted successfully'));
            
            if (!options.skipBackup) {
                console.log(chalk.dim('\n💡 Backup created in .lcagents/backups'));
                console.log(chalk.dim('   To restore, use: lcagents res restore <backup-name>'));
            }

        } catch (error) {
            if (error instanceof Error) {
                console.log(chalk.red(`\n❌ Error: ${error.message}`));
                if (error.message.includes('core system')) {
                    console.log(chalk.yellow('\n💡 Core system resources cannot be deleted'));
                    console.log(chalk.yellow('   They are protected to maintain system integrity'));
                }
            } else {
                console.log(chalk.red('\n❌ An unknown error occurred'));
            }
            process.exit(1);
        }
    });