import { Plugin, TFile } from 'obsidian';
import { Task, TaskMetadata } from '../models/Task';

/**
 * Integration with the Tasks plugin
 * This class handles the integration with the Tasks plugin
 * to collect and update tasks created with the Tasks syntax
 */
export class TasksPluginIntegration {
  private app: any;
  private tasksPlugin: any;

  constructor(app: any) {
    this.app = app;
  }

  /**
   * Check if the Tasks plugin is available
   * @returns boolean Whether the Tasks plugin is available
   */
  isTasksPluginAvailable(): boolean {
    try {
      // @ts-ignore
      this.tasksPlugin = this.app.plugins.getPlugin('obsidian-tasks-plugin');
      return !!this.tasksPlugin && !!this.tasksPlugin.apiV1;
    } catch (error) {
      console.error('Error checking Tasks plugin availability:', error);
      return false;
    }
  }

  /**
   * Get all tasks from the Tasks plugin
   * @param defaultPriority Default priority if not specified
   * @param defaultTimeEstimate Default time estimate if not specified
   * @returns Promise<Task[]> Array of tasks
   */
  async getTasks(
    defaultPriority: number,
    defaultTimeEstimate: number
  ): Promise<Task[]> {
    if (!this.isTasksPluginAvailable()) {
      return [];
    }

    try {
      // Get all tasks from the Tasks plugin
      if (!this.tasksPlugin || !this.tasksPlugin.apiV1) {
        console.warn('Tasks plugin API is not available');
        return [];
      }

      const tasksApi = this.tasksPlugin.apiV1;
      if (!tasksApi.getTasksInCache) {
        console.warn('Tasks plugin cache API is not available');
        return [];
      }

      const tasksCacheApi = tasksApi.getTasksInCache();

      // Convert Tasks plugin tasks to our Task model
      return tasksCacheApi
        .filter((taskItem: any) => !taskItem.checked) // Only include uncompleted tasks
        .map((taskItem: any) =>
          this.convertTasksPluginTask(
            taskItem,
            defaultPriority,
            defaultTimeEstimate
          )
        );
    } catch (error) {
      console.error('Error getting tasks from Tasks plugin:', error);
      return [];
    }
  }

  /**
   * Convert a Tasks plugin task to our Task model
   * 
   * This method handles the complex mapping between the Tasks plugin's task format
   * and our internal Task model. It extracts and transforms metadata from the
   * Tasks plugin's proprietary format into our standardized format.
   * 
   * The conversion process:
   * 1. Extracts basic task information (description, file, line number, completion status)
   * 2. Maps Tasks plugin priority levels to our numeric scale (1-5)
   * 3. Extracts time estimates from custom tags in the description
   * 4. Maps due dates to our deadline field
   * 5. Extracts tags, categories, and recurrence patterns
   * 
   * Edge cases handled:
   * - Missing files are handled with appropriate error logging
   * - Missing metadata uses provided defaults
   * - Invalid or missing fields are gracefully handled
   * - Provides fallback task creation if conversion fails
   * 
   * @param taskItem The Tasks plugin task item
   * @param defaultPriority Default priority if not specified
   * @param defaultTimeEstimate Default time estimate if not specified
   * @returns Task Our Task model
   */
  private convertTasksPluginTask(
      taskItem: any,
      defaultPriority: number,
      defaultTimeEstimate: number
  ): Task {
      try {
        // Extract data from the Tasks plugin task
        const description = taskItem.description || '';
  
        // Safely get the file, handling cases where the file might not exist
        const file = this.app.vault.getAbstractFileByPath(taskItem.path) as TFile;
        if (!file) {
          console.warn(`File not found for task: ${description}`);
          throw new Error('File not found for task');
        }
  
        const lineNumber = taskItem.line !== undefined ? taskItem.line : 0;
        const completed = !!taskItem.checked;
  
        // Extract priority
        let priority = defaultPriority;
        if (taskItem.priority) {
          // Tasks plugin uses high, medium, low, none
          switch (taskItem.priority) {
            case 'high':
              priority = 1;
              break;
            case 'medium':
              priority = 2;
              break;
            case 'low':
              priority = 4;
              break;
            case 'none':
              priority = 5;
              break;
          }
        }
  
        // Extract time estimate if available
        let timeEstimate = defaultTimeEstimate;
        // Tasks plugin doesn't have a built-in time estimate field
        // We can look for our custom format in the description
        const timeMatch = description.match(/#time\/([0-9]+)([mh])\b/);
        if (timeMatch) {
          const value = parseInt(timeMatch[1]);
          const unit = timeMatch[2];
          timeEstimate = unit === 'h' ? value * 60 : value;
        }
  
        // Extract deadline from due date
        let deadline: Date | undefined = undefined;
        if (taskItem.due) {
          deadline = new Date(taskItem.due);
        }
  
        // Extract tags from the task
        const tags: string[] = [];
        if (taskItem.tags && Array.isArray(taskItem.tags)) {
          tags.push(...taskItem.tags);
        }
  
        // Extract category from tags or description
        let category: string | undefined = undefined;
        const categoryMatch = description.match(/#category\/(\w+)\b/);
        if (categoryMatch) {
          category = categoryMatch[1];
        }
  
        // Extract recurrence pattern
        let recurrence: string | undefined = undefined;
        if (taskItem.recurrence) {
          recurrence = taskItem.recurrence;
        } else {
          // Try to extract from description
          const recurrenceMatch = description.match(
            /#recur\/(daily|weekly|monthly|yearly)\b/
          );
          if (recurrenceMatch) {
            recurrence = recurrenceMatch[1];
          }
        }
  
        // Create task metadata
        const metadata: TaskMetadata = {
          priority,
          timeEstimate,
          deadline,
          completed,
          source: file,
          lineNumber,
          scheduledTime: undefined,
          tags,
          category,
          recurrence,
          lastModified: new Date()
        };
  
        return new Task(description, metadata);
      } catch (error) {
        console.error('Error converting Tasks plugin task:', error);
        // Create a fallback task with minimal information
        const fallbackDescription = taskItem.description || 'Unknown task';
        const fallbackFile = this.app.workspace.getActiveFile() as TFile;
  
        const fallbackMetadata: TaskMetadata = {
          priority: defaultPriority,
          timeEstimate: defaultTimeEstimate,
          completed: false,
          source: fallbackFile,
          lineNumber: 0,
          scheduledTime: undefined,
          tags: [],
          lastModified: new Date(),
        };
  
        return new Task(fallbackDescription, fallbackMetadata);
      }
    }

  /**
   * Update a task in the Tasks plugin
   * @param task The task to update
   * @returns Promise<boolean> Whether the task was successfully updated
   */
  async updateTask(task: Task): Promise<boolean> {
    if (!this.isTasksPluginAvailable()) {
      return false;
    }

    try {
      // Get the task from the Tasks plugin
      const tasksApi = this.tasksPlugin.apiV1;
      const tasksCacheApi = tasksApi.getTasksInCache();

      // Find the task in the Tasks plugin cache
      const taskItem = tasksCacheApi.find(
        (t: any) =>
          t.path === task.metadata.source.path &&
          t.line === task.metadata.lineNumber
      );

      if (!taskItem) {
        console.warn('Task not found in Tasks plugin cache');
        return false;
      }

      // Update the task in the file
      const file = task.metadata.source;
      const content = await this.app.vault.read(file);
      const lines = content.split('\n');

      // Replace the line with our task format
      lines[task.metadata.lineNumber] = task.toLine();

      // Write the updated content back to the file
      await this.app.vault.modify(file, lines.join('\n'));
      return true;
    } catch (error) {
      console.error('Error updating task in Tasks plugin:', error);
      return false;
    }
  }

  /**
   * Create a new task in the Tasks plugin
   * @param task The task to create
   * @param targetFile The file to create the task in (optional, uses default Tasks location if not specified)
   * @returns Promise<boolean> Whether the task was successfully created
   */
  async createTask(task: Task, targetFile?: TFile): Promise<boolean> {
    if (!this.isTasksPluginAvailable()) {
      return false;
    }

    try {
      // If no target file is specified, use the default Tasks location
      if (!targetFile) {
        // Try to get the default Tasks location from settings
        const tasksSettings = this.tasksPlugin.settings;
        if (
          tasksSettings &&
          tasksSettings.globalFilter &&
          tasksSettings.globalFilter.sourcePath
        ) {
          const defaultTasksPath = tasksSettings.globalFilter.sourcePath;
          targetFile = this.app.vault.getAbstractFileByPath(
            defaultTasksPath
          ) as TFile;
        }

        // If still no target file, use the active file
        if (!targetFile) {
          const activeFile = this.app.workspace.getActiveFile();
          if (activeFile && activeFile.extension === 'md') {
            targetFile = activeFile;
          } else {
            console.warn('No suitable target file found for creating task');
            return false;
          }
        }
      }

      // Read the file content
      const content = await this.app.vault.read(targetFile);
      const lines = content.split('\n');

      // Add the task to the end of the file
      lines.push(task.toLine());

      // Write the updated content back to the file
      await this.app.vault.modify(targetFile, lines.join('\n'));

      // Update the task's source and line number
      if (targetFile) {
        task.metadata.source = targetFile;
        task.metadata.lineNumber = lines.length - 1;
      }

      return true;
    } catch (error) {
      console.error('Error creating task in Tasks plugin:', error);
      return false;
    }
  }
}
