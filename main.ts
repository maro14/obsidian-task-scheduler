import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { Scheduler, SchedulerSettings as SchedulerServiceSettings } from './src/services/Scheduler';
import { SchedulerView, SCHEDULER_VIEW_TYPE } from './src/ui/SchedulerView';
import { TasksPluginIntegration } from './src/integrations/TasksPluginIntegration';

interface TaskSchedulerSettings extends SchedulerServiceSettings {
	integrationMode: string; // 'standalone' or 'tasks-plugin'
}

const DEFAULT_SETTINGS: TaskSchedulerSettings = {
	integrationMode: 'standalone',
	defaultPriority: 3, // 1-5 scale, 1 being highest
	defaultTimeEstimate: 30,
	workingHoursStart: '09:00',
	workingHoursEnd: '17:00',
	workingDays: [1, 2, 3, 4, 5] // Monday to Friday
}

export default class TaskSchedulerPlugin extends Plugin {
	settings: TaskSchedulerSettings;
	private scheduler: Scheduler;

	async onload() {
		await this.loadSettings();

		// Initialize the scheduler service
		this.scheduler = new Scheduler(this.app.vault, this.settings, this.app);

		// Register the scheduler view type
		this.registerView(
			SCHEDULER_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new SchedulerView(leaf, this.scheduler)
		);

		// Add a ribbon icon to open the scheduler view
		this.addRibbonIcon('calendar-clock', 'Task Scheduler', async () => {
			await this.activateView();
		});
		
		// Add a status bar item
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Task Scheduler');

		// Add commands
		this.addCommand({
			id: 'open-task-scheduler',
			name: 'Open Task Scheduler View',
			callback: async () => {
				await this.activateView();
			}
		});

		this.addCommand({
			id: 'schedule-tasks',
			name: 'Schedule All Tasks',
			callback: async () => {
				await this.scheduleAllTasks();
			}
		});

		// Add settings tab
		this.addSettingTab(new TaskSchedulerSettingTab(this.app, this));
	}

	onunload() {
		// Deregister the view
		this.app.workspace.detachLeavesOfType(SCHEDULER_VIEW_TYPE);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update the scheduler with new settings
		if (this.scheduler) {
			this.scheduler = new Scheduler(this.app.vault, this.settings, this.app);
		}
	}

	// Activate the scheduler view
	async activateView() {
		const { workspace } = this.app;

		// Check if view is already open
		const existingLeaves = workspace.getLeavesOfType(SCHEDULER_VIEW_TYPE);
		if (existingLeaves.length > 0) {
			workspace.revealLeaf(existingLeaves[0]);
			return;
		}

		// Open the view in a new leaf
		const leaf = workspace.getLeaf('split', 'vertical');
		await leaf.setViewState({
			type: SCHEDULER_VIEW_TYPE,
			active: true,
		});

		// Focus the new leaf
		workspace.revealLeaf(leaf);
	}

	// Core functionality for scheduling tasks
	async scheduleAllTasks() {
		new Notice('Scheduling tasks based on your settings...');
		
		try {
			const tasksScheduled = await this.scheduler.scheduleAllTasks();
			new Notice(`Successfully scheduled ${tasksScheduled} tasks.`);
			
			// Refresh the view if it's open
			const leaves = this.app.workspace.getLeavesOfType(SCHEDULER_VIEW_TYPE);
			for (const leaf of leaves) {
				const view = leaf.view as SchedulerView;
				await view.refresh();
			}
		} catch (error) {
			console.error('Error scheduling tasks:', error);
			new Notice('Error scheduling tasks. Check the console for details.');
		}
	}
}

class TaskSchedulerSettingTab extends PluginSettingTab {
	plugin: TaskSchedulerPlugin;

	constructor(app: App, plugin: TaskSchedulerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Task Scheduler Settings'});

		new Setting(containerEl)
			.setName('Integration Mode')
			.setDesc('Choose whether to integrate with the Tasks plugin or use standalone mode')
			.addDropdown(dropdown => dropdown
				.addOption('standalone', 'Standalone')
				.addOption('tasks-plugin', 'Integrate with Tasks Plugin')
				.setValue(this.plugin.settings.integrationMode)
				.onChange(async (value) => {
					this.plugin.settings.integrationMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Priority')
			.setDesc('Set the default priority for tasks without specified priority (1-5, 1 being highest)')
			.addSlider(slider => slider
				.setLimits(1, 5, 1)
				.setValue(this.plugin.settings.defaultPriority)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.defaultPriority = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Time Estimate')
			.setDesc('Set the default time estimate in minutes for tasks without specified estimates')
			.addText(text => text
				.setValue(String(this.plugin.settings.defaultTimeEstimate))
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.defaultTimeEstimate = numValue;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Working Hours Start')
			.setDesc('Set the start of your working hours (format: HH:MM)')
			.addText(text => text
				.setValue(this.plugin.settings.workingHoursStart)
				.onChange(async (value) => {
					// Simple validation for time format
					if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
						this.plugin.settings.workingHoursStart = value;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Working Hours End')
			.setDesc('Set the end of your working hours (format: HH:MM)')
			.addText(text => text
				.setValue(this.plugin.settings.workingHoursEnd)
				.onChange(async (value) => {
					// Simple validation for time format
					if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
						this.plugin.settings.workingHoursEnd = value;
						await this.plugin.saveSettings();
					}
				}));

		// Working days selection
		const workingDaysSetting = new Setting(containerEl)
			.setName('Working Days')
			.setDesc('Select which days of the week you work on');

		const daysContainer = containerEl.createEl('div', { cls: 'task-scheduler-settings-working-days' });
		const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		
		// Create a checkbox for each day of the week
		dayNames.forEach((dayName, index) => {
			const dayContainer = daysContainer.createEl('div', { cls: 'task-scheduler-day-checkbox' });
			
			const checkbox = dayContainer.createEl('input', {
				type: 'checkbox',
				attr: {
					id: `working-day-${index}`,
					checked: this.plugin.settings.workingDays.includes(index)
				}
			});
			
			dayContainer.createEl('label', {
				text: dayName,
				attr: {
					for: `working-day-${index}`
				}
			});
			
			checkbox.addEventListener('change', async () => {
				const workingDays = this.plugin.settings.workingDays;
				
				if (checkbox.checked && !workingDays.includes(index)) {
					workingDays.push(index);
				} else if (!checkbox.checked && workingDays.includes(index)) {
					const dayIndex = workingDays.indexOf(index);
					if (dayIndex > -1) {
						workingDays.splice(dayIndex, 1);
					}
				}
				
				// Sort the days numerically
				this.plugin.settings.workingDays.sort((a, b) => a - b);
				await this.plugin.saveSettings();
			});
		});
	}
}