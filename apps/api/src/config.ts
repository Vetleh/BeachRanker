import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET ?? "development-only-secret"
};

if (process.env.NODE_ENV === "production" && config.jwtSecret === "development-only-secret") {
  throw new Error("JWT_SECRET must be set in production");
}
