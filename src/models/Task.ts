import { TFile } from 'obsidian';

export interface TaskMetadata {
    priority: number; // 1-5, 1 being highest
    timeEstimate: number; // in minutes
    deadline?: Date;
    scheduledTime?: Date;
    completed: boolean;
    source: TFile; // The file where the task is located
    lineNumber: number; // Line number in the file
    tags: string[]; // Additional tags for filtering and categorization
    category?: string; // Optional category for grouping tasks
    recurrence?: string; // Optional recurrence pattern (daily, weekly, monthly)
    lastModified: Date; // When the task was last modified
}

export class Task {
    id: string;
    description: string;
    metadata: TaskMetadata;

    constructor(description: string, metadata: TaskMetadata) {
        this.id = Math.random().toString(36).substring(2, 15);
        this.description = description;
        this.metadata = {
            ...metadata,
            tags: metadata.tags || [],
            lastModified: metadata.lastModified || new Date()
        };
    }

    /**
     * Parse a task from a line of text
     * @param line The line of text to parse
     * @param file The file where the task is located
     * @param lineNumber The line number in the file
     * @param defaultPriority Default priority if not specified
     * @param defaultTimeEstimate Default time estimate if not specified
     * @returns A new Task object
     */
    static fromLine(line: string, file: TFile, lineNumber: number, defaultPriority: number, defaultTimeEstimate: number): Task | null {
        // Basic task regex for standalone mode
        const taskRegex = /^\s*-\s*\[\s*([x ])?\s*\]\s*(.+)$/i;
        const match = line.match(taskRegex);

        if (!match) return null;

        const completed = match[1]?.toLowerCase() === 'x';
        let description = match[2].trim();

        // Extract metadata from description
        let priority = defaultPriority;
        let timeEstimate = defaultTimeEstimate;
        let deadline: Date | undefined = undefined;
        let category: string | undefined = undefined;
        let recurrence: string | undefined = undefined;
        const tags: string[] = [];

        // Priority tag: #p1 to #p5
        const priorityMatch = description.match(/#p([1-5])\b/);
        if (priorityMatch) {
            priority = parseInt(priorityMatch[1]);
            description = description.replace(priorityMatch[0], '').trim();
        }

        // Time estimate tag: #time/30m or #time/2h
        const timeMatch = description.match(/#time\/([0-9]+)([mh])\b/);
        if (timeMatch) {
            const value = parseInt(timeMatch[1]);
            const unit = timeMatch[2];
            timeEstimate = unit === 'h' ? value * 60 : value;
            description = description.replace(timeMatch[0], '').trim();
        }

        // Deadline tag: #due/YYYY-MM-DD
        const deadlineMatch = description.match(/#due\/([0-9]{4}-[0-9]{2}-[0-9]{2})\b/);
        if (deadlineMatch) {
            deadline = new Date(deadlineMatch[1]);
            description = description.replace(deadlineMatch[0], '').trim();
        }
        
        // Category tag: #category/work
        const categoryMatch = description.match(/#category\/([\w-]+)\b/);
        if (categoryMatch) {
            category = categoryMatch[1];
            description = description.replace(categoryMatch[0], '').trim();
        }
        
        // Recurrence tag: #recur/daily, #recur/weekly, #recur/monthly
        const recurrenceMatch = description.match(/#recur\/(daily|weekly|monthly|yearly)\b/);
        if (recurrenceMatch) {
            recurrence = recurrenceMatch[1];
            description = description.replace(recurrenceMatch[0], '').trim();
        }
        
        // Extract all other tags
        const tagRegex = /#([\w-]+)\b/g;
        let tagMatch;
        while ((tagMatch = tagRegex.exec(description)) !== null) {
            // Don't include the tags we've already processed
            if (!['p1', 'p2', 'p3', 'p4', 'p5'].includes(tagMatch[1]) && 
                !tagMatch[0].startsWith('#time/') && 
                !tagMatch[0].startsWith('#due/') && 
                !tagMatch[0].startsWith('#category/') && 
                !tagMatch[0].startsWith('#recur/')) {
                tags.push(tagMatch[1]);
            }
        }

        return new Task(description, {
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
        });
    }

    /**
     * Convert the task back to a line of text
     * @returns The task as a line of text
     */
    toLine(): string {
        const checkbox = this.metadata.completed ? '[x]' : '[ ]';
        let line = `- ${checkbox} ${this.description}`;

        // Add metadata tags
        line += ` #p${this.metadata.priority}`;
        
        line += ` #time/${this.metadata.timeEstimate >= 60 
            ? `${Math.floor(this.metadata.timeEstimate / 60)}h` 
            : `${this.metadata.timeEstimate}m`}`;

        if (this.metadata.deadline) {
            const dateStr = this.metadata.deadline.toISOString().split('T')[0];
            line += ` #due/${dateStr}`;
        }
        
        if (this.metadata.category) {
            line += ` #category/${this.metadata.category}`;
        }
        
        if (this.metadata.recurrence) {
            line += ` #recur/${this.metadata.recurrence}`;
        }
        
        // Add all other tags
        for (const tag of this.metadata.tags) {
            line += ` #${tag}`;
        }

        if (this.metadata.scheduledTime) {
            const dateStr = this.metadata.scheduledTime.toISOString().split('T')[0];
            const timeStr = this.metadata.scheduledTime.toISOString().split('T')[1].substring(0, 5);
            line += ` #scheduled/${dateStr}T${timeStr}`;
        }

        return line;
    }
    
    /**
     * Check if the task is overdue
     * @returns boolean Whether the task is overdue
     */
    isOverdue(): boolean {
        if (!this.metadata.deadline) return false;
        return new Date() > this.metadata.deadline;
    }
    
    /**
     * Check if the task is due soon (within the next 48 hours)
     * @returns boolean Whether the task is due soon
     */
    isDueSoon(): boolean {
        if (!this.metadata.deadline) return false;
        
        const now = new Date();
        const twoDaysFromNow = new Date(now);
        twoDaysFromNow.setHours(now.getHours() + 48);
        
        return this.metadata.deadline > now && this.metadata.deadline <= twoDaysFromNow;
    }
    
    /**
     * Create a recurring instance of this task
     * @returns Task A new task with updated deadline based on recurrence pattern
     */
    createRecurringInstance(): Task | null {
        if (!this.metadata.recurrence || !this.metadata.deadline) return null;
        
        const newTask = new Task(this.description, { ...this.metadata, completed: false });
        const newDeadline = new Date(this.metadata.deadline);
        
        // Calculate new deadline based on recurrence pattern
        switch (this.metadata.recurrence) {
            case 'daily':
                newDeadline.setDate(newDeadline.getDate() + 1);
                break;
            case 'weekly':
                newDeadline.setDate(newDeadline.getDate() + 7);
                break;
            case 'monthly':
                newDeadline.setMonth(newDeadline.getMonth() + 1);
                break;
            case 'yearly':
                newDeadline.setFullYear(newDeadline.getFullYear() + 1);
                break;
            default:
                return null;
        }
        
        newTask.metadata.deadline = newDeadline;
        newTask.metadata.scheduledTime = undefined; // Clear scheduled time for new instance
        newTask.metadata.lastModified = new Date();
        
        return newTask;
    }
}