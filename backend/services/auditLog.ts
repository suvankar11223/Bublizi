/**
 * Security Audit Logging Service (PHASE 3)
 * 
 * Logs all security-relevant events for:
 * - Compliance (SOC 2, GDPR, HIPAA)
 * - Forensic analysis
 * - Incident response
 * - Threat detection
 */

import { redis } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

export type AuditEventType =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.logout'
  | 'auth.token.refresh'
  | 'auth.token.revoke'
  | 'auth.password.change'
  | 'auth.password.reset'
  | 'access.denied'
  | 'access.granted'
  | 'data.read'
  | 'data.create'
  | 'data.update'
  | 'data.delete'
  | 'security.ip.blocked'
  | 'security.suspicious.activity'
  | 'security.rate.limit.exceeded'
  | 'admin.user.created'
  | 'admin.user.deleted'
  | 'admin.permission.changed';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  timestamp: string;
  userId?: string;
  userEmail?: string;
  ip: string;
  userAgent?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export class AuditLogger {
  private readonly RETENTION_DAYS = 90; // Keep logs for 90 days

  /**
   * Log security event
   */
  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    try {
      const auditEvent: AuditEvent = {
        ...event,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      };

      // Store in Redis with timestamp as key
      const key = `audit:log:${Date.now()}:${auditEvent.id}`;
      await redis.set(key, JSON.stringify(auditEvent), { 
        ex: this.RETENTION_DAYS * 24 * 60 * 60 
      });

      // Also log to application logger for immediate visibility
      logger.info('Security audit event', auditEvent);

      // For critical events, also store in a separate high-priority log
      if (this.isCriticalEvent(event.type)) {
        await this.logCriticalEvent(auditEvent);
      }
    } catch (error: any) {
      // Never fail the request due to audit logging failure
      logger.error('Failed to log audit event', {
        error: error.message,
        event,
      });
    }
  }

  /**
   * Log authentication event
   */
  async logAuth(
    type: Extract<AuditEventType, `auth.${string}`>,
    userId: string | undefined,
    userEmail: string | undefined,
    ip: string,
    success: boolean,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      type,
      userId,
      userEmail,
      ip,
      action: type.replace('auth.', ''),
      success,
      metadata,
    });
  }

  /**
   * Log access control event
   */
  async logAccess(
    userId: string,
    userEmail: string,
    ip: string,
    resource: string,
    resourceId: string,
    action: 'read' | 'create' | 'update' | 'delete',
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    await this.log({
      type: success ? 'access.granted' : 'access.denied',
      userId,
      userEmail,
      ip,
      action,
      resource,
      resourceId,
      success,
      errorMessage,
    });
  }

  /**
   * Log data operation
   */
  async logDataOperation(
    userId: string,
    userEmail: string,
    ip: string,
    operation: 'read' | 'create' | 'update' | 'delete',
    resource: string,
    resourceId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      type: `data.${operation}` as AuditEventType,
      userId,
      userEmail,
      ip,
      action: operation,
      resource,
      resourceId,
      success: true,
      metadata,
    });
  }

  /**
   * Log security event
   */
  async logSecurity(
    type: Extract<AuditEventType, `security.${string}`>,
    ip: string,
    action: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.log({
      type,
      ip,
      action,
      success: false, // Security events are typically failures
      metadata,
    });
  }

  /**
   * Query audit log
   */
  async query(options: {
    startTime?: number;
    endTime?: number;
    userId?: string;
    type?: AuditEventType;
    limit?: number;
  }): Promise<AuditEvent[]> {
    try {
      // Note: This is a simplified implementation
      // For production with high volume, consider using a proper time-series database
      // or maintaining an index in Redis
      
      logger.warn('Audit log query not fully implemented', { options });
      return [];
    } catch (error: any) {
      logger.error('Failed to query audit log', {
        error: error.message,
        options,
      });
      return [];
    }
  }

  /**
   * Get audit statistics
   */
  async getStats(timeRange: number = 24 * 60 * 60 * 1000): Promise<{
    totalEvents: number;
    successfulLogins: number;
    failedLogins: number;
    accessDenied: number;
    suspiciousActivity: number;
  }> {
    try {
      const startTime = Date.now() - timeRange;
      const events = await this.query({ startTime, limit: 10000 });

      return {
        totalEvents: events.length,
        successfulLogins: events.filter(e => e.type === 'auth.login.success').length,
        failedLogins: events.filter(e => e.type === 'auth.login.failure').length,
        accessDenied: events.filter(e => e.type === 'access.denied').length,
        suspiciousActivity: events.filter(e => e.type === 'security.suspicious.activity').length,
      };
    } catch (error: any) {
      logger.error('Failed to get audit stats', {
        error: error.message,
      });
      return {
        totalEvents: 0,
        successfulLogins: 0,
        failedLogins: 0,
        accessDenied: 0,
        suspiciousActivity: 0,
      };
    }
  }

  /**
   * Check if event is critical
   */
  private isCriticalEvent(type: AuditEventType): boolean {
    const criticalEvents: AuditEventType[] = [
      'security.ip.blocked',
      'security.suspicious.activity',
      'admin.user.deleted',
      'admin.permission.changed',
      'auth.password.reset',
    ];
    return criticalEvents.includes(type);
  }

  /**
   * Log critical event to separate storage
   */
  private async logCriticalEvent(event: AuditEvent): Promise<void> {
    try {
      const key = `audit:critical:${Date.now()}:${event.id}`;
      await redis.set(key, JSON.stringify(event), { 
        ex: this.RETENTION_DAYS * 24 * 60 * 60 
      });

      // TODO: Send alert to admin
      logger.warn('Critical security event', event);
    } catch (error: any) {
      logger.error('Failed to log critical event', {
        error: error.message,
        event,
      });
    }
  }

  /**
   * Export audit log for compliance
   */
  async export(startTime: number, endTime: number): Promise<string> {
    try {
      // Note: Export would require scanning Redis keys
      // For production, consider maintaining an index or using a proper database
      logger.warn('Audit log export not fully implemented');
      return '[]';
    } catch (error: any) {
      logger.error('Failed to export audit log', {
        error: error.message,
      });
      return '[]';
    }
  }

  /**
   * Clean up old audit logs
   */
  async cleanup(): Promise<void> {
    try {
      // Note: Cleanup would require scanning Redis keys
      // For production, consider using Redis TTL on individual keys (already implemented)
      // or a background job with proper key scanning
      
      logger.info('Audit log cleanup - using TTL-based expiry');
    } catch (error: any) {
      logger.error('Failed to cleanup audit log', {
        error: error.message,
      });
    }
  }
}

// Singleton instance
export const auditLogger = new AuditLogger();
