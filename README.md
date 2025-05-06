# Obsidian Task Scheduler

A plugin for [Obsidian](https://obsidian.md) that automatically schedules tasks based on priority, deadlines, and time estimates.

## Features

- Automatically schedule tasks based on priority, deadlines, and time estimates
- Integrate with the existing Tasks plugin or use as a standalone task management system
- Configure working hours and days to optimize your schedule
- Visual calendar view for scheduled tasks
- Customizable priority levels and time estimates

## Installation

### From Obsidian

1. Open Settings in Obsidian
2. Go to Community Plugins and disable Safe Mode
3. Click Browse and search for "Task Scheduler"
4. Install the plugin and enable it

### Manual Installation

1. Download the latest release from the GitHub repository
2. Extract the files into your Obsidian vault's `.obsidian/plugins/obsidian-task-scheduler` folder
3. Restart Obsidian
4. Enable the plugin in Settings > Community Plugins

## Usage

### Basic Usage

1. Create tasks in your notes using the standard Markdown checkbox syntax: `- [ ] Task description`
2. Add metadata to your tasks:
   - Priority: `#p1` to `#p5` (1 being highest)
   - Time estimate: `#time/30m` or `#time/2h`
   - Deadline: `#due/2023-12-31`
3. Click the Task Scheduler icon in the ribbon or use the command "Schedule Tasks"
4. Your tasks will be automatically scheduled based on your settings

### Integration with Tasks Plugin

If you're using the Tasks plugin, Task Scheduler can integrate with it to schedule tasks created with the Tasks syntax. Enable this option in the settings.

## Configuration

The plugin can be configured in the Settings tab:

- **Integration Mode**: Choose between standalone mode or integration with the Tasks plugin
- **Default Priority**: Set the default priority for tasks without specified priority
- **Default Time Estimate**: Set the default time estimate for tasks without specified estimates
- **Working Hours**: Configure your working hours to schedule tasks within
- **Working Days**: Select which days of the week you work on

## Development

### Building the plugin

1. Clone this repository
2. Install dependencies with `npm install`
3. Build the plugin with `npm run dev` to start compilation in watch mode

## License

This project is licensed under the MIT License - see the LICENSE file for details.