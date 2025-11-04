import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

export interface UserWithContext extends SelectUser {
  activeCompanyId: string;
  activeRole: "admin" | "office" | "ops" | "viewer";
  isSuperAdminBool: boolean;
}

declare global {
  namespace Express {
    interface User extends UserWithContext {}
    interface SessionData {
      activeCompanyId?: string;
    }
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable must be set");
  }

  const isProduction = process.env.NODE_ENV === "production";
  
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
    name: "greenscape.sid",
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user || !(await comparePasswords(password, user.passwordHash))) {
            return done(null, false);
          }

          const isSuperAdminBool = user.isSuperAdmin === "true";
          let activeCompanyId: string;
          let activeRole: "admin" | "office" | "ops" | "viewer";

          if (isSuperAdminBool) {
            if (!user.defaultCompanyId) {
              return done(new Error("Super admin must have a default company"));
            }
            activeCompanyId = user.defaultCompanyId;
            activeRole = "admin";
          } else {
            const companyMemberships = await storage.getCompanyUsersByUserId(user.id);
            const activeMemberships = companyMemberships.filter(m => m.status === "active");
            
            if (activeMemberships.length === 0) {
              return done(new Error("User has no active company memberships"));
            }
            
            const activeMembership = activeMemberships[0];
            activeCompanyId = activeMembership.companyId;
            activeRole = activeMembership.role as "admin" | "office" | "ops" | "viewer";
          }

          const userWithContext: UserWithContext = {
            ...user,
            activeCompanyId,
            activeRole,
            isSuperAdminBool,
          };

          return done(null, userWithContext);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUserById(id);
      if (!user) {
        return done(null, false);
      }

      const isSuperAdminBool = user.isSuperAdmin === "true";
      
      let activeCompanyId: string;
      let activeRole: "admin" | "office" | "ops" | "viewer";

      if (isSuperAdminBool) {
        if (!user.defaultCompanyId) {
          return done(new Error("Super admin must have a default company"));
        }
        activeCompanyId = user.defaultCompanyId;
        activeRole = "admin";
      } else {
        const companyMemberships = await storage.getCompanyUsersByUserId(id);
        const activeMemberships = companyMemberships.filter(m => m.status === "active");
        
        if (activeMemberships.length === 0) {
          return done(new Error("User has no active company memberships"));
        }
        
        const activeMembership = activeMemberships[0];
        activeCompanyId = activeMembership.companyId;
        activeRole = activeMembership.role as "admin" | "office" | "ops" | "viewer";
      }

      const userWithContext: UserWithContext = {
        ...user,
        activeCompanyId,
        activeRole,
        isSuperAdminBool,
      };

      done(null, userWithContext);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByEmail(req.body.email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }

      const user = await storage.createUser({
        ...req.body,
        passwordHash: await hashPassword(req.body.password),
      });

      const isSuperAdminBool = user.isSuperAdmin === "true";
      let activeCompanyId: string;
      let activeRole: "admin" | "office" | "ops" | "viewer";

      if (isSuperAdminBool) {
        if (!user.defaultCompanyId) {
          return res.status(400).json({ message: "Super admin must have a default company" });
        }
        activeCompanyId = user.defaultCompanyId;
        activeRole = "admin";
      } else {
        const companyMemberships = await storage.getCompanyUsersByUserId(user.id);
        const activeMemberships = companyMemberships.filter(m => m.status === "active");
        
        if (activeMemberships.length === 0) {
          return res.status(400).json({ message: "User has no active company memberships" });
        }
        
        const activeMembership = activeMemberships[0];
        activeCompanyId = activeMembership.companyId;
        activeRole = activeMembership.role as "admin" | "office" | "ops" | "viewer";
      }

      const userWithContext: UserWithContext = {
        ...user,
        activeCompanyId,
        activeRole,
        isSuperAdminBool,
      };

      req.login(userWithContext, (err) => {
        if (err) return next(err);
        const { passwordHash, ...userWithoutPassword } = userWithContext;
        res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: Error, user: UserWithContext, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      req.login(user, (err) => {
        if (err) return next(err);
        const { passwordHash, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const user = req.user as UserWithContext;
    let activeCompany = null;
    
    if (user.activeCompanyId) {
      activeCompany = await storage.getCompanyById(user.activeCompanyId);
    }
    
    const { passwordHash, ...userWithoutPassword } = user;
    res.json({
      ...userWithoutPassword,
      activeCompany,
    });
  });

  app.post("/api/user/switch-company", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const user = req.user as UserWithContext;
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    const isSuperAdmin = user.isSuperAdmin === "true";
    
    if (!isSuperAdmin) {
      const membership = await storage.getCompanyUser(user.id, companyId);
      if (!membership) {
        return res.status(403).json({ message: "You do not have access to this company" });
      }
      if (membership.status !== "active") {
        return res.status(403).json({ message: "Your membership is not active" });
      }
    }

    const company = await storage.getCompanyById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    const updatedUser = await storage.getUserById(user.id);
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    let activeRole: "admin" | "office" | "ops" | "viewer" = "admin";
    if (!isSuperAdmin) {
      const membership = await storage.getCompanyUser(user.id, companyId);
      if (membership && membership.status === "active") {
        activeRole = membership.role as "admin" | "office" | "ops" | "viewer";
      }
    }

    const userWithContext: UserWithContext = {
      ...updatedUser,
      activeCompanyId: companyId,
      activeRole,
      isSuperAdminBool: isSuperAdmin,
    };

    req.login(userWithContext, (err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to switch company" });
      }
      
      const { passwordHash, ...userWithoutPassword } = userWithContext;
      res.json({
        ...userWithoutPassword,
        activeCompany: company,
      });
    });
  });
}
