export class Logger {
    private static instance: Logger;
    private debugMode: boolean = false;
    
    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    
    setDebugMode(enabled: boolean) {
        this.debugMode = enabled;
    }
    
    debug(message: string, ...args: any[]) {
        if (this.debugMode) {
            console.log(`[TaskScheduler:DEBUG] ${message}`, ...args);
        }
    }
    
    info(message: string, ...args: any[]) {
        console.log(`[TaskScheduler:INFO] ${message}`, ...args);
    }
    
    warn(message: string, ...args: any[]) {
        console.warn(`[TaskScheduler:WARN] ${message}`, ...args);
    }
    
    error(message: string, error?: Error, ...args: any[]) {
        console.error(`[TaskScheduler:ERROR] ${message}`, error, ...args);
    }
}