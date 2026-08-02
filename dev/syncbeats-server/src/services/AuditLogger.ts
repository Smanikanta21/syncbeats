import prisma from '../db/prisma';

export interface AuditLogOptions {
  action: string;
  details?: string;
  ip?: string;
}

/**
 * AuditLogger: Streams all real-time server events, user activities, 
 * room operations, audio sync events, and system errors directly into 
 * PostgreSQL `admin_audit_logs` table so they display live in the DB Visualizer console.
 */
export class AuditLogger {
  static async log(action: string, details?: string, ip?: string): Promise<void> {
    try {
      const cleanAction = (action || 'INFO').toUpperCase();
      const cleanDetails = details || '';
      const cleanIp = ip || '127.0.0.1';

      // Log to stdout
      console.log(`[AuditLog][${cleanAction}] ${cleanDetails}`);

      await prisma.$executeRawUnsafe(
        `INSERT INTO admin_audit_logs (id, action, details, ip, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
        cleanAction,
        cleanDetails || null,
        cleanIp
      );
    } catch (err: any) {
      // Non-blocking fallback
      console.error(`[AuditLogger Error]:`, err?.message || err);
    }
  }

  static async info(action: string, details?: string, ip?: string): Promise<void> {
    return this.log(action, details, ip);
  }

  static async error(action: string, details?: string, ip?: string): Promise<void> {
    const actionName = action.startsWith('ERROR_') ? action : `ERROR_${action}`;
    return this.log(actionName, details, ip);
  }

  static async warn(action: string, details?: string, ip?: string): Promise<void> {
    const actionName = action.startsWith('WARN_') ? action : `WARN_${action}`;
    return this.log(actionName, details, ip);
  }

  static async security(action: string, details?: string, ip?: string): Promise<void> {
    const actionName = action.startsWith('SECURITY_') ? action : `SECURITY_${action}`;
    return this.log(actionName, details, ip);
  }
}
