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

export function requireSteward(req: Request, res: Response, next: NextFunction) {
  const role = req.session?.role;
  if (!role || role === "member") {
    res.status(403).json({ error: "Access denied", code: "INSUFFICIENT_ROLE" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const role = req.session?.role;
  if (role !== "admin" && role !== "chair") {
    res.status(403).json({ error: "Admin access required", code: "FORBIDDEN" });
    return;
  }
  next();
}
