export class SettingsValidator {
    static validateSettings(settings: TaskSchedulerSettings): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        // Validate time format
        if (!this.isValidTimeFormat(settings.workingHoursStart)) {
            errors.push('Invalid working hours start format');
        }
        
        if (!this.isValidTimeFormat(settings.workingHoursEnd)) {
            errors.push('Invalid working hours end format');
        }
        
        // Validate priority range
        if (settings.defaultPriority < 1 || settings.defaultPriority > 5) {
            errors.push('Default priority must be between 1 and 5');
        }
        
        // Validate time estimate
        if (settings.defaultTimeEstimate <= 0 || settings.defaultTimeEstimate > 1440) {
            errors.push('Default time estimate must be between 1 and 1440 minutes');
        }
        
        return { valid: errors.length === 0, errors };
    }
    
    private static isValidTimeFormat(time: string): boolean {
        return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
    }
}