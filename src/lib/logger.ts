/**
 * Custom Logger System for Royal Rumble
 * 
 * Provides category-based logging with environment variable configuration.
 * Supports multiple debug modes: SOLANA, UI, GAME, GENERAL
 * 
 * Usage:
 * ```typescript
 * import { logger } from '~/lib/logger';
 * 
 * // General logging
 * logger.info('Application started');
 * logger.warn('Configuration missing');
 * logger.error('Failed to connect', error);
 * 
 * // Category-specific logging
 * logger.solana.debug('Transaction sent:', txSignature);
 * logger.ui.debug('Component mounted:', componentName);
 * logger.game.debug('Player spawned:', playerId);
 * ```
 */

// ============================================================================
// Types & Enums
// ============================================================================

export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

export enum LogCategory {
  GENERAL = 'GENERAL',
  SOLANA = 'SOLANA',
  UI = 'UI',
  GAME = 'GAME',
}

interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  categories: Set<LogCategory>;
  timestamp: boolean;
  stackTrace: boolean;
}

// ============================================================================
// Configuration Parsing
// ============================================================================

/**
 * Parse log level from environment variable
 */
function parseLogLevel(levelStr?: string): LogLevel {
  if (!levelStr) return LogLevel.DEBUG;
  
  const normalized = levelStr.toUpperCase();
  switch (normalized) {
    case 'NONE': return LogLevel.NONE;
    case 'ERROR': return LogLevel.ERROR;
    case 'WARN': return LogLevel.WARN;
    case 'INFO': return LogLevel.INFO;
    case 'DEBUG': return LogLevel.DEBUG;
    default: return LogLevel.DEBUG;
  }
}

/**
 * Parse categories from environment variable
 */
function parseCategories(categoriesStr?: string): Set<LogCategory> {
  if (!categoriesStr || categoriesStr.trim() === '') {
    return new Set<LogCategory>();
  }
  
  const categories = new Set<LogCategory>();
  const parts = categoriesStr.split(',').map(s => s.trim().toUpperCase());
  
  for (const part of parts) {
    if (part === 'SOLANA') categories.add(LogCategory.SOLANA);
    else if (part === 'UI') categories.add(LogCategory.UI);
    else if (part === 'GAME') categories.add(LogCategory.GAME);
    else if (part === 'GENERAL') categories.add(LogCategory.GENERAL);
  }
  
  return categories;
}

/**
 * Parse boolean from environment variable
 */
function parseBoolean(value?: string, defaultValue: boolean = false): boolean {
  if (!value) return defaultValue;
  const normalized = value.toLowerCase().trim();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

/**
 * Load configuration from environment variables
 */
function loadConfig(): LoggerConfig {
  return {
    enabled: parseBoolean(import.meta.env.VITE_LOGGER_ENABLED, true),
    level: parseLogLevel(import.meta.env.VITE_LOG_LEVEL),
    categories: parseCategories(import.meta.env.VITE_LOG_CATEGORIES),
    timestamp: parseBoolean(import.meta.env.VITE_LOG_TIMESTAMP, false),
    stackTrace: parseBoolean(import.meta.env.VITE_LOG_STACK_TRACE, false),
  };
}

// ============================================================================
// Color Schemes (Browser Console)
// ============================================================================

const COLORS = {
  ERROR: '#ff4444',
  WARN: '#ffaa00',
  INFO: '#4488ff',
  DEBUG: '#888888',
  SOLANA: '#14F195', // Solana green
  UI: '#9945FF', // Purple
  GAME: '#FF6B6B', // Red
  GENERAL: '#666666',
  TIMESTAMP: '#999999',
};

// ============================================================================
// Category Logger
// ============================================================================

/**
 * Category-specific logger
 */
class CategoryLogger {
  constructor(
    private category: LogCategory,
    private config: LoggerConfig,
    private parentLogger: Logger
  ) {}

  /**
   * Check if this category is enabled
   */
  private isEnabled(): boolean {
    if (!this.config.enabled) return false;
    if (this.config.categories.size === 0) return true; // No filter = all enabled
    return this.config.categories.has(this.category);
  }

  /**
   * Format message with category prefix and optional timestamp
   */
  private formatMessage(message: string): string {
    const parts: string[] = [];
    
    if (this.config.timestamp) {
      const now = new Date();
      const timestamp = now.toISOString().split('T')[1].split('.')[0];
      parts.push(`[${timestamp}]`);
    }
    
    parts.push(`[${this.category}]`);
    parts.push(message);
    
    return parts.join(' ');
  }

  /**
   * Get color for this category
   */
  private getCategoryColor(): string {
    switch (this.category) {
      case LogCategory.SOLANA: return COLORS.SOLANA;
      case LogCategory.UI: return COLORS.UI;
      case LogCategory.GAME: return COLORS.GAME;
      case LogCategory.GENERAL: return COLORS.GENERAL;
      default: return COLORS.DEBUG;
    }
  }

  /**
   * Log with styling
   */
  private log(level: LogLevel, levelName: string, color: string, args: any[]): void {
    if (!this.isEnabled()) return;
    if (this.config.level < level) return;

    const categoryColor = this.getCategoryColor();
    const message = typeof args[0] === 'string' ? args[0] : '';
    const rest = typeof args[0] === 'string' ? args.slice(1) : args;

    const formattedMsg = this.formatMessage(message);
    
    // Use styled console output
    console.log(
      `%c${formattedMsg}`,
      `color: ${categoryColor}; font-weight: bold;`,
      ...rest
    );
  }

  debug(...args: any[]): void {
    this.log(LogLevel.DEBUG, 'DEBUG', COLORS.DEBUG, args);
  }

  info(...args: any[]): void {
    this.log(LogLevel.INFO, 'INFO', COLORS.INFO, args);
  }

  warn(...args: any[]): void {
    this.log(LogLevel.WARN, 'WARN', COLORS.WARN, args);
  }

  error(...args: any[]): void {
    this.log(LogLevel.ERROR, 'ERROR', COLORS.ERROR, args);
    
    // Add stack trace for errors if enabled
    if (this.config.stackTrace && args.some(arg => arg instanceof Error)) {
      const error = args.find(arg => arg instanceof Error);
      if (error) {
        console.error(error.stack);
      }
    }
  }

  /**
   * Group related logs
   */
  group(label: string): void {
    if (!this.isEnabled()) return;
    console.group(this.formatMessage(label));
  }

  groupCollapsed(label: string): void {
    if (!this.isEnabled()) return;
    console.groupCollapsed(this.formatMessage(label));
  }

  groupEnd(): void {
    if (!this.isEnabled()) return;
    console.groupEnd();
  }

  /**
   * Performance timing
   */
  time(label: string): void {
    if (!this.isEnabled()) return;
    console.time(this.formatMessage(label));
  }

  timeEnd(label: string): void {
    if (!this.isEnabled()) return;
    console.timeEnd(this.formatMessage(label));
  }

  /**
   * Display data as table
   */
  table(data: any): void {
    if (!this.isEnabled()) return;
    if (this.config.level < LogLevel.DEBUG) return;
    console.table(data);
  }

  /**
   * Conditional debug logging
   */
  debugIf(condition: boolean, ...args: any[]): void {
    if (condition) {
      this.debug(...args);
    }
  }
}

// ============================================================================
// Main Logger
// ============================================================================

/**
 * Main logger class (singleton)
 */
class Logger {
  private static instance: Logger;
  private config: LoggerConfig;

  // Category-specific loggers
  public readonly solana: CategoryLogger;
  public readonly ui: CategoryLogger;
  public readonly game: CategoryLogger;

  private constructor() {
    this.config = loadConfig();
    
    // Initialize category loggers
    this.solana = new CategoryLogger(LogCategory.SOLANA, this.config, this);
    this.ui = new CategoryLogger(LogCategory.UI, this.config, this);
    this.game = new CategoryLogger(LogCategory.GAME, this.config, this);
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Reload configuration (useful for testing or hot reload)
   */
  public reloadConfig(): void {
    this.config = loadConfig();
  }

  /**
   * Check if logger is enabled
   */
  public isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if debug level is enabled
   */
  public isDebugEnabled(): boolean {
    return this.config.enabled && this.config.level >= LogLevel.DEBUG;
  }

  /**
   * Get current log level
   */
  public getLogLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Get active categories
   */
  public getCategories(): Set<LogCategory> {
    return new Set(this.config.categories);
  }

  /**
   * Format message with optional timestamp
   */
  private formatMessage(message: string): string {
    if (this.config.timestamp) {
      const now = new Date();
      const timestamp = now.toISOString().split('T')[1].split('.')[0];
      return `[${timestamp}] ${message}`;
    }
    return message;
  }

  /**
   * General logging methods (always respect log level, not category filter)
   */
  
  debug(...args: any[]): void {
    if (!this.config.enabled) return;
    if (this.config.level < LogLevel.DEBUG) return;
    
    const message = typeof args[0] === 'string' ? args[0] : '';
    const rest = typeof args[0] === 'string' ? args.slice(1) : args;
    
    console.log(
      `%c${this.formatMessage(message)}`,
      `color: ${COLORS.DEBUG};`,
      ...rest
    );
  }

  info(...args: any[]): void {
    if (!this.config.enabled) return;
    if (this.config.level < LogLevel.INFO) return;
    
    const message = typeof args[0] === 'string' ? args[0] : '';
    const rest = typeof args[0] === 'string' ? args.slice(1) : args;
    
    console.log(
      `%c${this.formatMessage(message)}`,
      `color: ${COLORS.INFO};`,
      ...rest
    );
  }

  warn(...args: any[]): void {
    if (!this.config.enabled) return;
    if (this.config.level < LogLevel.WARN) return;
    
    const message = typeof args[0] === 'string' ? args[0] : '';
    const rest = typeof args[0] === 'string' ? args.slice(1) : args;
    
    console.warn(
      `%c${this.formatMessage(message)}`,
      `color: ${COLORS.WARN};`,
      ...rest
    );
  }

  error(...args: any[]): void {
    if (!this.config.enabled) return;
    if (this.config.level < LogLevel.ERROR) return;
    
    const message = typeof args[0] === 'string' ? args[0] : '';
    const rest = typeof args[0] === 'string' ? args.slice(1) : args;
    
    console.error(
      `%c${this.formatMessage(message)}`,
      `color: ${COLORS.ERROR};`,
      ...rest
    );

    // Add stack trace for errors if enabled
    if (this.config.stackTrace && args.some(arg => arg instanceof Error)) {
      const error = args.find(arg => arg instanceof Error);
      if (error) {
        console.error(error.stack);
      }
    }
  }

  /**
   * General grouping methods
   */
  
  group(label: string): void {
    if (!this.config.enabled) return;
    console.group(this.formatMessage(label));
  }

  groupCollapsed(label: string): void {
    if (!this.config.enabled) return;
    console.groupCollapsed(this.formatMessage(label));
  }

  groupEnd(): void {
    if (!this.config.enabled) return;
    console.groupEnd();
  }

  /**
   * Performance timing (general)
   */
  
  time(label: string): void {
    if (!this.config.enabled) return;
    console.time(this.formatMessage(label));
  }

  timeEnd(label: string): void {
    if (!this.config.enabled) return;
    console.timeEnd(this.formatMessage(label));
  }

  /**
   * Display data as table (general)
   */
  table(data: any): void {
    if (!this.config.enabled) return;
    if (this.config.level < LogLevel.DEBUG) return;
    console.table(data);
  }
}

// ============================================================================
// Export
// ============================================================================

/**
 * Singleton logger instance
 */
export const logger = Logger.getInstance();

// Also export class for testing
export { Logger };
