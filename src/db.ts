import { SQL } from "bun";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");

export const sql = new SQL({ url, max: 10, idleTimeout: 30 });
export const TZ = "Europe/Warsaw";
