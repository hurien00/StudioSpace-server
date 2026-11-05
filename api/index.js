import { app, init } from "../index.js";

export default async function handler(req, res) {
  try {
    await init();
    return app(req, res);
  } catch (error) {
    console.error("Failed to initialize server:", error);
    return res.status(500).json({ message: "Server initialization failed" });
  }
}
