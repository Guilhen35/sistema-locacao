import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Segunda camada contra CSRF: requisições que alteram dados só aceitam origens conhecidas
export function originCheck(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (SAFE_METHODS.has(req.method) || !origin || allowed.has(origin)) return next();
    res.status(403).json({ statusCode: 403, message: 'Origem não permitida' });
  };
}
