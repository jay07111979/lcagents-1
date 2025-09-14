import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import { SafeDeleteManager } from '../../core/SafeDeleteManager';

export const restoreCommand = new Command('restore')
    .description('Restore a previously deleted resource from backup')
    .argument('<backup-name>', 'Name of the backup to restore')
    .action(async (backupName: string) => {
        try {
            const currentDir = process.cwd();
            const safeDelete = new SafeDeleteManager(currentDir);
            const backupDir = path.join(currentDir, '.lcagents/backups');

            // Check if backup exists
            const backupPath = path.join(backupDir, backupName);
            if (!await fs.pathExists(backupPath)) {
                console.log(chalk.red(`❌ Backup not found: ${backupName}`));
                console.log(chalk.yellow('\n💡 Available backups:'));
                const backups = await fs.readdir(backupDir);
                backups.forEach(backup => {
                    console.log(chalk.yellow(`   • ${backup}`));
                });
                return;
            }

            console.log(chalk.blue(`🔄 Restoring backup: ${backupName}...`));

            // Restore the backup
            await safeDelete.restoreBackup(backupPath);

            console.log(chalk.green('\n✅ Resource restored successfully'));

        } catch (error) {
            if (error instanceof Error) {
                console.log(chalk.red(`\n❌ Error: ${error.message}`));
            } else {
                console.log(chalk.red('\n❌ An unknown error occurred'));
            }
            process.exit(1);
        }
    });