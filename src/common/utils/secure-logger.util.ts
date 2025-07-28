import { Logger } from '@nestjs/common';

/**
 * Secure logger utility that sanitizes sensitive data from logs
 */
export class SecureLogger extends Logger {
  private static readonly SENSITIVE_KEYS = [
    'authorization',
    'x-api-key',
    'x-goog-api-key',
    'api-key',
    'token',
    'password',
    'secret',
    'key',
  ];

  private static readonly SENSITIVE_PATTERNS = [
    /sk-[a-zA-Z0-9-]+/g, // OpenAI API keys
    /Bearer\s+[a-zA-Z0-9-._~+/]+=*/g, // Bearer tokens
    /[a-zA-Z0-9-._~+/]{20,}=*/g, // Long base64-like strings
  ];

  /**
   * Sanitize an object by removing or masking sensitive data
   */
  private static sanitizeObject(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => SecureLogger.sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      // Check if key contains sensitive terms
      const isSensitiveKey = SecureLogger.SENSITIVE_KEYS.some(
        sensitiveKey => lowerKey.includes(sensitiveKey)
      );

      if (isSensitiveKey) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        // Check if value contains sensitive patterns
        let sanitizedValue = value;
        SecureLogger.SENSITIVE_PATTERNS.forEach(pattern => {
          sanitizedValue = sanitizedValue.replace(pattern, '[REDACTED]');
        });
        sanitized[key] = sanitizedValue;
      } else if (typeof value === 'object') {
        sanitized[key] = SecureLogger.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Log error with sanitized data
   */
  error(message: string, context?: any) {
    const sanitizedContext = SecureLogger.sanitizeObject(context);
    super.error(message, sanitizedContext);
  }

  /**
   * Log debug with sanitized data
   */
  debug(message: string, context?: any) {
    const sanitizedContext = SecureLogger.sanitizeObject(context);
    super.debug(message, sanitizedContext);
  }

  /**
   * Log warn with sanitized data
   */
  warn(message: string, context?: any) {
    const sanitizedContext = SecureLogger.sanitizeObject(context);
    super.warn(message, sanitizedContext);
  }

  /**
   * Log info with sanitized data
   */
  log(message: string, context?: any) {
    const sanitizedContext = SecureLogger.sanitizeObject(context);
    super.log(message, sanitizedContext);
  }

  /**
   * Log verbose with sanitized data
   */
  verbose(message: string, context?: any) {
    const sanitizedContext = SecureLogger.sanitizeObject(context);
    super.verbose(message, sanitizedContext);
  }
} 