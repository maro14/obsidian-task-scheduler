export const SCHEDULER_CONSTANTS = {
    PRIORITY: {
        MIN: 1,
        MAX: 5,
        DEFAULT: 3
    },
    TIME_ESTIMATE: {
        DEFAULT_MINUTES: 30,
        MAX_MINUTES: 1440 // 24 hours
    },
    WORKING_HOURS: {
        DEFAULT_START: '09:00',
        DEFAULT_END: '17:00'
    },
    WORKING_DAYS: {
        WEEKDAYS: [1, 2, 3, 4, 5] // Monday to Friday
    },
    SCHEDULING: {
        DEFAULT_DAYS_AHEAD: 14,
        CALENDAR_VIEW_DAYS: 7
    }
} as const;