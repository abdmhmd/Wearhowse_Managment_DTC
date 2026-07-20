import { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      lang?: 'ar' | 'en';
    }
  }
}

export function languageMiddleware(req: Request, _res: Response, next: NextFunction) {
  const queryLang = req.query.lang as string | undefined;
  if (queryLang === 'ar' || queryLang === 'en') {
    req.lang = queryLang;
    next();
    return;
  }

  const acceptLanguage = req.headers['accept-language'] || '';
  if (acceptLanguage.startsWith('ar')) {
    req.lang = 'ar';
  } else {
    req.lang = 'en';
  }
  next();
}
