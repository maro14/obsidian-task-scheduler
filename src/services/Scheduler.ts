import { TFile, Vault } from 'obsidian';
import { Task, TaskMetadata } from '../models/Task';
import { TasksPluginIntegration } from '../integrations/TasksPluginIntegration';

export interface TimeSlot {
    startTime: Date;
    endTime: Date;
    task?: Task;
}

export interface SchedulerSettings {
    workingHoursStart: string; // format: 'HH:MM'
    workingHoursEnd: string; // format: 'HH:MM'
    workingDays: number[]; // 0 = Sunday, 1 = Monday, etc.
    defaultPriority: number;
    defaultTimeEstimate: number; // in minutes
    integrationMode: string; // 'standalone' or 'tasks-plugin'
}

export class Scheduler {
    private settings: SchedulerSettings;
    private vault: Vault;
    private app: any;
    private tasksIntegration: TasksPluginIntegration | null = null;

    constructor(vault: Vault, settings: SchedulerSettings, app?: any) {
        this.vault = vault;
        this.settings = settings;
        this.app = app;
        
        // Initialize Tasks plugin integration if needed
        if (app && settings.integrationMode === 'tasks-plugin') {
            this.tasksIntegration = new TasksPluginIntegration(app);
        }
    }

    /**
     * Collect all tasks from the vault
     * @returns Promise<Task[]> Array of tasks
     */
    async collectTasks(): Promise<Task[]> {
        // If using Tasks plugin integration and it's available
        if (this.settings.integrationMode === 'tasks-plugin' && this.tasksIntegration) {
            if (this.tasksIntegration.isTasksPluginAvailable()) {
                return await this.tasksIntegration.getTasks(
                    this.settings.defaultPriority,
                    this.settings.defaultTimeEstimate
                );
            } else {
                console.warn('Tasks plugin is not available. Falling back to standalone mode.');
            }
        }
        
        // Standalone mode or fallback if Tasks plugin is not available
        const tasks: Task[] = [];
        const markdownFiles = this.vault.getMarkdownFiles();

        for (const file of markdownFiles) {
            const content = await this.vault.cachedRead(file);
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const task = Task.fromLine(
                    lines[i], 
                    file, 
                    i, 
                    this.settings.defaultPriority, 
                    this.settings.defaultTimeEstimate
                );

                if (task && !task.metadata.completed) {
                    tasks.push(task);
                }
            }
        }

        return tasks;
    }

    /**
     * Generate available time slots based on working hours and days
     * @param startDate The start date for scheduling
     * @param daysToSchedule Number of days to schedule ahead
     * @returns TimeSlot[] Array of available time slots
     */
    generateTimeSlots(startDate: Date, daysToSchedule: number): TimeSlot[] {
        const slots: TimeSlot[] = [];
        const currentDate = new Date(startDate);
        
        // Reset time to start of day
        currentDate.setHours(0, 0, 0, 0);
        
        for (let day = 0; day < daysToSchedule; day++) {
            // Check if current day is a working day
            if (this.settings.workingDays.includes(currentDate.getDay())) {
                // Parse working hours
                const [startHour, startMinute] = this.settings.workingHoursStart.split(':').map(Number);
                const [endHour, endMinute] = this.settings.workingHoursEnd.split(':').map(Number);
                
                // Create start and end times for the day
                const dayStart = new Date(currentDate);
                dayStart.setHours(startHour, startMinute, 0, 0);
                
                const dayEnd = new Date(currentDate);
                dayEnd.setHours(endHour, endMinute, 0, 0);
                
                // Create 30-minute slots throughout the working day
                const slotDuration = 30; // minutes
                let slotStart = new Date(dayStart);
                
                while (slotStart < dayEnd) {
                    const slotEnd = new Date(slotStart);
                    slotEnd.setMinutes(slotStart.getMinutes() + slotDuration);
                    
                    if (slotEnd <= dayEnd) {
                        slots.push({
                            startTime: new Date(slotStart),
                            endTime: new Date(slotEnd)
                        });
                    }
                    
                    // Move to next slot
                    slotStart = new Date(slotEnd);
                }
            }
            
            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return slots;
    }

    /**
     * Schedule tasks into available time slots
     * @param tasks Array of tasks to schedule
     * @param startDate The start date for scheduling
     * @param daysToSchedule Number of days to schedule ahead
     * @returns Task[] Array of scheduled tasks
     */
    scheduleTasks(tasks: Task[], startDate: Date, daysToSchedule: number = 14): Task[] {
        // Sort tasks by priority (higher priority first) and deadline
        const sortedTasks = [...tasks].sort((a, b) => {
            // First check for urgent deadlines (within 48 hours)
            const now = new Date();
            const urgentThreshold = 48 * 60 * 60 * 1000; // 48 hours in milliseconds
            
            const aIsUrgent = a.metadata.deadline && 
                (a.metadata.deadline.getTime() - now.getTime() < urgentThreshold);
            const bIsUrgent = b.metadata.deadline && 
                (b.metadata.deadline.getTime() - now.getTime() < urgentThreshold);
                
            if (aIsUrgent && !bIsUrgent) return -1;
            if (!aIsUrgent && bIsUrgent) return 1;
            
            // Then sort by priority (lower number = higher priority)
            if (a.metadata.priority !== b.metadata.priority) {
                return a.metadata.priority - b.metadata.priority;
            }
            
            // Then sort by deadline if both have deadlines
            if (a.metadata.deadline && b.metadata.deadline) {
                return a.metadata.deadline.getTime() - b.metadata.deadline.getTime();
            }
            
            // Tasks with deadlines come before tasks without deadlines
            if (a.metadata.deadline && !b.metadata.deadline) return -1;
            if (!a.metadata.deadline && b.metadata.deadline) return 1;
            
            // Finally sort by time estimate (shorter tasks first)
            return a.metadata.timeEstimate - b.metadata.timeEstimate;
        });
        
        // Generate available time slots
        const availableSlots = this.generateTimeSlots(startDate, daysToSchedule);
        
        // Assign tasks to slots
        for (const task of sortedTasks) {
            // For tasks with deadlines, try to schedule them before the deadline
            if (task.metadata.deadline) {
                const deadlineSlots = availableSlots.filter(slot => 
                    slot.task === undefined && 
                    slot.endTime <= task.metadata.deadline!);
                
                if (deadlineSlots.length > 0) {
                    // Find slots that can fit the task before the deadline
                    const slotsNeeded = Math.ceil(task.metadata.timeEstimate / 30);
                    let consecutiveDeadlineSlots: TimeSlot[] = [];
                    let lastDeadlineSlotTime: Date | null = null;
                    
                    for (let i = 0; i < deadlineSlots.length; i++) {
                        const slot = deadlineSlots[i];
                        
                        // Check if this slot is consecutive with the last one
                        if (lastDeadlineSlotTime && slot.startTime.getTime() !== lastDeadlineSlotTime.getTime()) {
                            // Not consecutive, reset the collection
                            consecutiveDeadlineSlots = [];
                        }
                        
                        // Add this slot to our consecutive collection
                        consecutiveDeadlineSlots.push(slot);
                        lastDeadlineSlotTime = slot.endTime;
                        
                        // If we have enough slots, assign the task
                        if (consecutiveDeadlineSlots.length >= slotsNeeded) {
                            // Assign task to these slots
                            for (let j = 0; j < slotsNeeded; j++) {
                                consecutiveDeadlineSlots[j].task = task;
                            }
                            
                            // Set the scheduled time for the task
                            task.metadata.scheduledTime = new Date(consecutiveDeadlineSlots[0].startTime);
                            
                            break;
                        }
                    }
                    
                    // If task was scheduled, continue to the next task
                    if (task.metadata.scheduledTime !== undefined) {
                        continue;
                    }
                }
            }
            
            // Calculate how many slots this task needs
            const slotsNeeded = Math.ceil(task.metadata.timeEstimate / 30);
            
            // Find consecutive available slots
            let consecutiveSlots: TimeSlot[] = [];
            let lastSlotTime: Date | null = null;
            
            // Try to find enough consecutive slots
            for (let i = 0; i < availableSlots.length; i++) {
                const slot = availableSlots[i];
                
                // Skip slots that are already assigned
                if (slot.task) continue;
                
                // Check if this slot is consecutive with the last one
                if (lastSlotTime && slot.startTime.getTime() !== lastSlotTime.getTime()) {
                    // Not consecutive, reset the collection
                    consecutiveSlots = [];
                }
                
                // Add this slot to our consecutive collection
                consecutiveSlots.push(slot);
                lastSlotTime = slot.endTime;
                
                // If we have enough slots, assign the task
                if (consecutiveSlots.length >= slotsNeeded) {
                    // Assign task to these slots
                    for (let j = 0; j < slotsNeeded; j++) {
                        consecutiveSlots[j].task = task;
                    }
                    
                    // Set the scheduled time for the task
                    task.metadata.scheduledTime = new Date(consecutiveSlots[0].startTime);
                    
                    // Remove used slots from available slots
                    for (let j = 0; j < slotsNeeded; j++) {
                        const index = availableSlots.indexOf(consecutiveSlots[j]);
                        if (index > -1) {
                            availableSlots[index].task = task;
                        }
                    }
                    
                    break; // Move to the next task
                }
            }
        }
        
        return sortedTasks;
    }

    /**
     * Update task in the file
     * @param task The task to update
     * @returns Promise<boolean> Whether the update was successful
     */
    async updateTaskInFile(task: Task): Promise<boolean> {
        // If using Tasks plugin integration and it's available
        if (this.settings.integrationMode === 'tasks-plugin' && this.tasksIntegration) {
            if (this.tasksIntegration.isTasksPluginAvailable()) {
                return await this.tasksIntegration.updateTask(task);
            }
        }
        
        // Standalone mode or fallback
        try {
            const file = task.metadata.source;
            const content = await this.vault.cachedRead(file);
            const lines = content.split('\n');
            
            // Update the line with the task
            if (task.metadata.lineNumber < lines.length) {
                lines[task.metadata.lineNumber] = task.toLine();
                await this.vault.modify(file, lines.join('\n'));
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error updating task in file:', error);
            return false;
        }
    }
    
    /**
     * Mark a task as completed
     * @param taskId The ID of the task to mark as completed
     * @returns Promise<boolean> Whether the task was successfully marked as completed
     */
    async completeTask(taskId: string): Promise<boolean> {
        const tasks = await this.collectTasks();
        const task = tasks.find(t => t.id === taskId);
        
        if (!task) return false;
        
        // Mark the task as completed
        task.metadata.completed = true;
        
        // Update the task in its source file
        return await this.updateTaskInFile(task);
    }
    
    /**
     * Get statistics about scheduled tasks
     * @returns Promise<object> Statistics about scheduled tasks
     */
    async getScheduleStatistics(): Promise<{ 
        totalTasks: number, 
        scheduledTasks: number, 
        completedTasks: number,
        upcomingDeadlines: number,
        overdueTasks: number
    }> {
        const allTasks = await this.collectTasks();
        const scheduledTasks = allTasks.filter(task => task.metadata.scheduledTime !== undefined);
        const now = new Date();
        
        // Count tasks with upcoming deadlines (within the next 3 days)
        const upcomingDeadlineThreshold = new Date(now);
        upcomingDeadlineThreshold.setDate(now.getDate() + 3);
        
        const upcomingDeadlines = allTasks.filter(task => 
            task.metadata.deadline && 
            task.metadata.deadline > now && 
            task.metadata.deadline <= upcomingDeadlineThreshold
        ).length;
        
        // Count overdue tasks
        const overdueTasks = allTasks.filter(task => 
            task.metadata.deadline && 
            task.metadata.deadline < now && 
            !task.metadata.completed
        ).length;
        
        return {
            totalTasks: allTasks.length,
            scheduledTasks: scheduledTasks.length,
            completedTasks: allTasks.filter(task => task.metadata.completed).length,
            upcomingDeadlines,
            overdueTasks
        };
    }

    /**
     * Schedule all tasks and update them in their files
     * @returns Promise<number> Number of tasks scheduled
     */
    async scheduleAllTasks(): Promise<number> {
        try {
            // Collect all tasks
            const tasks = await this.collectTasks();
            
            // Schedule tasks
            const scheduledTasks = this.scheduleTasks(tasks, new Date());
            
            // Update tasks in files
            let updatedCount = 0;
            for (const task of scheduledTasks) {
                if (task.metadata.scheduledTime) {
                    const success = await this.updateTaskInFile(task);
                    if (success) updatedCount++;
                }
            }
            
            return updatedCount;
        } catch (error) {
            console.error('Error scheduling tasks:', error);
            return 0;
        }
    }
    
    /**
     * Reschedule a specific task
     * @param taskId The ID of the task to reschedule
     * @param newTime The new scheduled time for the task
     * @returns Promise<boolean> Whether the task was successfully rescheduled
     */
    async rescheduleTask(taskId: string, newTime: Date): Promise<boolean> {
        const tasks = await this.collectTasks();
        const task = tasks.find(t => t.id === taskId);
        
        if (!task) return false;
        
        // Update the scheduled time
        task.metadata.scheduledTime = newTime;
        
        // Update the task in its source file
        return await this.updateTaskInFile(task);
    }
    
    /**
     * Get tasks scheduled for a specific day
     * @param date The date to get tasks for
     * @returns Promise<Task[]> Array of tasks scheduled for the specified day
     */
    async getTasksForDay(date: Date): Promise<Task[]> {
        const tasks = await this.collectTasks();
        const scheduledTasks = tasks.filter(task => {
            if (!task.metadata.scheduledTime) return false;
            
            const taskDate = new Date(task.metadata.scheduledTime);
            return taskDate.getFullYear() === date.getFullYear() &&
                   taskDate.getMonth() === date.getMonth() &&
                   taskDate.getDate() === date.getDate();
        });
        
        return scheduledTasks;
    }
}