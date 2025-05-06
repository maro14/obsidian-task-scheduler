import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import { Scheduler, TimeSlot } from '../services/Scheduler';
import { Task } from '../models/Task';

export const SCHEDULER_VIEW_TYPE = 'task-scheduler-view';

export class SchedulerView extends ItemView {
  private scheduler: Scheduler;
  private scheduledTasks: Task[] = [];
  private timeSlots: TimeSlot[] = [];

  constructor(leaf: WorkspaceLeaf, scheduler: Scheduler) {
    super(leaf);
    this.scheduler = scheduler;
  }

  getViewType(): string {
    return SCHEDULER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Task Scheduler';
  }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    // Collect and schedule tasks
    const tasks = await this.scheduler.collectTasks();
    this.scheduledTasks = this.scheduler.scheduleTasks(tasks, new Date());
    this.timeSlots = this.scheduler.generateTimeSlots(new Date(), 7); // Show a week

    // Render the view
    this.renderView();
  }

  private renderView(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('task-scheduler-container');

    this.renderCalendarView(container);
    this.renderTaskList(container);
  }

  /**
   * Render an individual task item
   * @param taskList The task list element
   * @param task The task to render
   */
  private renderTaskItem(taskList: HTMLElement, task: Task): void {
    const taskItem = taskList.createEl('li', {
      cls: 'task-scheduler-task-item'
    });

    // Add classes for special states
    if (task.isOverdue()) {
      taskItem.addClass('task-overdue');
    } else if (task.isDueSoon()) {
      taskItem.addClass('task-due-soon');
    }

    if (task.metadata.category) {
      taskItem.addClass(`category-${task.metadata.category}`);
    }

    // Create checkbox
    const checkbox = taskItem.createEl('input', {
      type: 'checkbox',
      attr: { checked: task.metadata.completed ? 'checked' : '' }
    });
    checkbox.addEventListener('change', async () => {
      task.metadata.completed = checkbox.checked;
      // Update the task in its source file
      await this.scheduler.completeTask(task.id);

      // If task has recurrence and was completed, create next instance
      if (checkbox.checked && task.metadata.recurrence) {
        const newTask = task.createRecurringInstance();
        if (newTask) {
          // Add the new recurring task
          // This would typically call a method on the scheduler
          new Notice('Created next recurring task');
          await this.refresh();
        }
      }
    });

    // Create task description
    const description = taskItem.createEl('span', {
      cls: 'task-scheduler-task-description',
      text: task.description
    });

    // Create task metadata
    const metadata = taskItem.createEl('div', {
      cls: 'task-scheduler-task-metadata'
    });

    // Priority
    const priorityEl = metadata.createEl('span', {
      cls: `task-scheduler-priority priority-${task.metadata.priority}`,
      text: `P${task.metadata.priority}`
    });

    // Time estimate
    const timeEstimateEl = metadata.createEl('span', {
      cls: 'task-scheduler-time-estimate',
      text: `${task.metadata.timeEstimate}m`
    });

    // Deadline if exists
    if (task.metadata.deadline) {
      const deadlineEl = metadata.createEl('span', {
        cls: 'task-scheduler-deadline',
        text: `Due: ${task.metadata.deadline.toLocaleDateString()}`
      });

      // Add overdue or due soon indicator
      if (task.isOverdue()) {
        deadlineEl.addClass('overdue');
        deadlineEl.setText(
          `Overdue: ${task.metadata.deadline.toLocaleDateString()}`
        );
      } else if (task.isDueSoon()) {
        deadlineEl.addClass('due-soon');
      }
    }

    // Scheduled time
    if (task.metadata.scheduledTime) {
      const scheduledTimeEl = metadata.createEl('span', {
        cls: 'task-scheduler-scheduled-time',
        text: `Scheduled: ${task.metadata.scheduledTime.toLocaleString()}`
      });
    }

    // Category if exists
    if (task.metadata.category) {
      metadata.createEl('span', {
        cls: 'task-scheduler-category',
        text: `Category: ${task.metadata.category}`
      });
    }

    // Recurrence if exists
    if (task.metadata.recurrence) {
      metadata.createEl('span', {
        cls: 'task-scheduler-recurrence',
        text: `Repeats: ${task.metadata.recurrence}`
      });
    }

    // Tags
    if (task.metadata.tags.length > 0) {
      const tagsEl = metadata.createEl('div', { cls: 'task-scheduler-tags' });
      for (const tag of task.metadata.tags) {
        tagsEl.createEl('span', {
          cls: 'task-scheduler-tag',
          text: `#${tag}`
        });
      }
    }

    // Action buttons
    const actionsEl = taskItem.createEl('div', {
      cls: 'task-scheduler-task-actions'
    });

    // Reschedule button
    const rescheduleBtn = actionsEl.createEl('button', {
      cls: 'task-scheduler-reschedule-btn',
      attr: { 'aria-label': 'Reschedule task' }
    });
    setIcon(rescheduleBtn, 'calendar-plus');
    rescheduleBtn.addEventListener('click', async () => {
      // Show a date picker or some UI to select a new date
      // For now, just reschedule to tomorrow as an example
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0); // 9 AM

      await this.scheduler.rescheduleTask(task.id, tomorrow);
      new Notice('Task rescheduled');
      await this.refresh();
    });

    // Open source file button
    const openSourceBtn = actionsEl.createEl('button', {
      cls: 'task-scheduler-open-source-btn',
      attr: { 'aria-label': 'Open source file' }
    });
    setIcon(openSourceBtn, 'file-text');
    openSourceBtn.addEventListener('click', () => {
      // Open the source file at the task's line
      this.app.workspace.openLinkText(
        '',
        task.metadata.source.path,
        true // Create if not exists
      );
    });
  }

  /**
   * Render statistics about scheduled tasks
   */
  private async renderStatistics(container: HTMLElement): Promise<void> {
    const stats = await this.scheduler.getScheduleStatistics();

    const statsContainer = container.createEl('div', {
      cls: 'task-scheduler-statistics'
    });

    const statsHeader = statsContainer.createEl('h3', {
      text: 'Schedule Statistics'
    });

    const statsList = statsContainer.createEl('div', { cls: 'stats-list' });

    // Total tasks
    const totalTasksEl = statsList.createEl('div', { cls: 'stat-item' });
    totalTasksEl.createEl('span', { cls: 'stat-label', text: 'Total Tasks:' });
    totalTasksEl.createEl('span', {
      cls: 'stat-value',
      text: `${stats.totalTasks}`
    });

    // Scheduled tasks
    const scheduledTasksEl = statsList.createEl('div', { cls: 'stat-item' });
    scheduledTasksEl.createEl('span', {
      cls: 'stat-label',
      text: 'Scheduled:'
    });
    scheduledTasksEl.createEl('span', {
      cls: 'stat-value',
      text: `${stats.scheduledTasks}`
    });

    // Completed tasks
    const completedTasksEl = statsList.createEl('div', { cls: 'stat-item' });
    completedTasksEl.createEl('span', {
      cls: 'stat-label',
      text: 'Completed:'
    });
    completedTasksEl.createEl('span', {
      cls: 'stat-value',
      text: `${stats.completedTasks}`
    });

    // Upcoming deadlines
    const upcomingDeadlinesEl = statsList.createEl('div', { cls: 'stat-item' });
    upcomingDeadlinesEl.createEl('span', {
      cls: 'stat-label',
      text: 'Upcoming Deadlines:'
    });
    upcomingDeadlinesEl.createEl('span', {
      cls: 'stat-value' + (stats.upcomingDeadlines > 0 ? ' warning' : ''),
      text: `${stats.upcomingDeadlines}`
    });

    // Overdue tasks
    const overdueTasksEl = statsList.createEl('div', { cls: 'stat-item' });
    overdueTasksEl.createEl('span', { cls: 'stat-label', text: 'Overdue:' });
    overdueTasksEl.createEl('span', {
      cls: 'stat-value' + (stats.overdueTasks > 0 ? ' error' : ''),
      text: `${stats.overdueTasks}`
    });
  }

  private renderCalendarView(container: HTMLElement): void {
    const calendarContainer = container.createEl('div', {
      cls: 'task-scheduler-calendar'
    });

    // Group slots by day
    const slotsByDay = new Map<string, TimeSlot[]>();

    for (const slot of this.timeSlots) {
      const dateStr = slot.startTime.toISOString().split('T')[0];
      if (!slotsByDay.has(dateStr)) {
        slotsByDay.set(dateStr, []);
      }
      slotsByDay.get(dateStr)?.push(slot);
    }

    // Create day headers
    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday'
    ];
    for (let i = 0; i < 7; i++) {
      calendarContainer.createEl('div', {
        cls: 'task-scheduler-day-header',
        text: dayNames[i]
      });
    }

    // Create day columns
    for (const [dateStr, slots] of slotsByDay.entries()) {
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay();

      const dayEl = calendarContainer.createEl('div', {
        cls: 'task-scheduler-day'
      });
      dayEl.style.gridColumn = `${dayOfWeek + 1}`;

      // Add date
      dayEl.createEl('div', {
        cls: 'task-scheduler-date',
        text: date.toLocaleDateString()
      });

      // Add slots
      for (const slot of slots) {
        const slotEl = dayEl.createEl('div', { cls: 'task-scheduler-slot' });

        // Format time
        const startTime = slot.startTime.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });
        const endTime = slot.endTime.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit'
        });

        slotEl.createEl('div', {
          cls: 'task-scheduler-slot-time',
          text: `${startTime} - ${endTime}`
        });

        // Add task if assigned
        if (slot.task) {
          const taskEl = slotEl.createEl('div', {
            cls: `task-scheduler-slot-task priority-${slot.task.metadata.priority}`,
            text: slot.task.description
          });

          // Add priority indicator
          taskEl.createEl('span', {
            cls: `task-scheduler-priority priority-${slot.task.metadata.priority}`,
            text: `P${slot.task.metadata.priority}`
          });

          // Add deadline indicator if task is overdue or due soon
          if (slot.task.isOverdue()) {
            taskEl.addClass('overdue');
          } else if (slot.task.isDueSoon()) {
            taskEl.addClass('due-soon');
          }

          // Make the task draggable for rescheduling
          taskEl.setAttribute('draggable', 'true');
          taskEl.dataset.taskId = slot.task.id;

          // Add drag event listeners
          taskEl.addEventListener('dragstart', e => {
            e.dataTransfer?.setData('text/plain', slot.task!.id);
          });
        }
      }
    }
  } // <-- Add this closing brace to end renderCalendarView

  private renderTaskList(container: HTMLElement): void {
    const taskListContainer = container.createEl('div', {
      cls: 'task-scheduler-task-list'
    });
    taskListContainer.createEl('h3', { text: 'Scheduled Tasks' });

    // Create filter controls
    const filterContainer = taskListContainer.createEl('div', {
      cls: 'task-scheduler-filters'
    });

    // Category filter
    const categoryFilter = filterContainer.createEl('select', {
      cls: 'task-scheduler-category-filter'
    });
    categoryFilter.createEl('option', { text: 'All Categories', value: 'all' });

    // Get unique categories
    const categories = new Set<string>();
    this.scheduledTasks.forEach(task => {
      if (task.metadata.category) {
        categories.add(task.metadata.category);
      }
    });

    // Add category options
    categories.forEach(category => {
      categoryFilter.createEl('option', { text: category, value: category });
    });

    // Tag filter
    const tagFilter = filterContainer.createEl('select', {
      cls: 'task-scheduler-tag-filter'
    });
    tagFilter.createEl('option', { text: 'All Tags', value: 'all' });

    // Get unique tags
    const tags = new Set<string>();
    this.scheduledTasks.forEach(task => {
      task.metadata.tags.forEach(tag => tags.add(tag));
    });

    // Add tag options
    tags.forEach(tag => {
      tagFilter.createEl('option', { text: tag, value: tag });
    });

    // Create task list
    const taskList = taskListContainer.createEl('ul');

    if (this.scheduledTasks.length === 0) {
      taskList.createEl('li', { text: 'No tasks scheduled' });
      return;
    }

    // Sort tasks by scheduled time
    const sortedTasks = [...this.scheduledTasks].sort((a, b) => {
      if (!a.metadata.scheduledTime || !b.metadata.scheduledTime) return 0;
      return (
        a.metadata.scheduledTime.getTime() - b.metadata.scheduledTime.getTime()
      );
    });

    // Filter and render tasks
    const renderFilteredTasks = () => {
      // Clear existing tasks
      taskList.empty();

      // Get filter values
      const selectedCategory = categoryFilter.value;
      const selectedTag = tagFilter.value;

      // Filter tasks
      const filteredTasks = sortedTasks.filter(task => {
        // Category filter
        if (
          selectedCategory !== 'all' &&
          task.metadata.category !== selectedCategory
        ) {
          return false;
        }

        // Tag filter
        if (
          selectedTag !== 'all' &&
          !task.metadata.tags.includes(selectedTag)
        ) {
          return false;
        }

        return true;
      });

      if (filteredTasks.length === 0) {
        taskList.createEl('li', {
          text: 'No tasks match the selected filters'
        });
        return;
      }

      // Render filtered tasks
      for (const task of filteredTasks) {
        this.renderTaskItem(taskList, task);
      }
    };

    // Add event listeners to filters
    categoryFilter.addEventListener('change', renderFilteredTasks);
    tagFilter.addEventListener('change', renderFilteredTasks);

    // Initial render
    renderFilteredTasks();
  }
}
