import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { Role, User } from "@prisma/client";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { ApiError } from "./errors.js";

const cookieName = "beachranker_session";
const tokenMaxAgeSeconds = 60 * 60 * 24 * 30;

export type AuthUser = Pick<User, "id" | "email" | "displayName" | "role" | "active">;

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

type TokenPayload = {
  sub: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function setAuthCookie(res: Response, userId: string) {
  const token = createSessionToken(userId);

  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: tokenMaxAgeSeconds * 1000
  });
}

export function createSessionToken(userId: string) {
  return jwt.sign({ sub: userId } satisfies TokenPayload, config.jwtSecret, {
    expiresIn: tokenMaxAgeSeconds
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(cookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

function getToken(req: Request) {
  const cookieToken = req.cookies?.[cookieName];
  if (cookieToken) {
    return cookieToken;
  }

  const authorization = req.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return null;
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = getToken(req);
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, displayName: true, role: true, active: true }
    });

    if (user?.active) {
      req.user = user;
    }
  } catch {
    // Ignore invalid tokens; authenticated routes will return 401.
  }

  return next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required"));
  }

  return next();
}

export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required"));
    }

    if (req.user.role !== role) {
      return next(new ApiError(403, "You do not have permission to perform this action"));
    }

    return next();
  };
}
