import { Response } from 'express';

export function sendError(res: Response, err: any, defaultMessage: string = 'Internal Server Error', status: number = 500) {
  const isProduction = process.env.NODE_ENV === 'production';
  const message = isProduction ? defaultMessage : (err?.message || defaultMessage);
  
  // Log the detailed error on the server always
  if (err) {
    console.error(`[Error] ${defaultMessage}:`, err);
  }
  
  res.status(status).json({ error: message });
}
