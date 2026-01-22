import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';
import { MemberRole } from '../generated/prisma';
import { verifyJWT } from '../routes/auth';

export interface AuthenticatedRequest extends Request {
  wallet?: string;
  org?: {
    id: string;
    orgIdHex: string;
    role: MemberRole;
  };
}

export async function requireWallet(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);
  const payload = await verifyJWT(token);

  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Check if session exists in database
  const session = await prisma.session.findUnique({
    where: { jwtToken: token },
  });

  if (!session || session.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  req.wallet = payload.wallet;
  next();
}

export function requireOrg(allowedRoles: MemberRole[] = [MemberRole.OWNER, MemberRole.ADMIN]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const wallet = req.wallet;
    const orgId = req.params.orgId;

    if (!wallet) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!orgId) {
      return res.status(400).json({ error: 'Missing orgId parameter' });
    }

    const org = await prisma.org.findUnique({
      where: { id: orgId },
      include: {
        members: {
          where: { wallet },
        },
      },
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const isOwner = org.ownerWallet === wallet;
    const membership = org.members[0];

    let role: MemberRole;
    if (isOwner) {
      role = MemberRole.OWNER;
    } else if (membership) {
      role = membership.role;
    } else {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    req.org = {
      id: org.id,
      orgIdHex: org.orgIdHex,
      role,
    };

    next();
  };
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return requireOrg([MemberRole.OWNER, MemberRole.ADMIN])(req, res, next);
}

export function requireViewer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.VIEWER, MemberRole.AUDITOR])(
    req,
    res,
    next
  );
}

export function requireAuditor(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  return requireOrg([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.AUDITOR])(req, res, next);
}
