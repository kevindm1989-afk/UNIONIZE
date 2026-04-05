import type { Request, Response, NextFunction } from "express";

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.session.role === "admin") return next();
    if (!req.session.permissions?.includes(permission)) {
      res.status(403).json({ error: "Access denied", requiredPermission: permission });
      return;
    }
    next();
  };
}
