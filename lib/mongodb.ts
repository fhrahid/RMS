import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var _mongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache =
  global._mongooseCache ?? (global._mongooseCache = { conn: null, promise: null });

export async function connectDB() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error(
      "MONGODB_URI is not set. Add it to the environment (Vercel → Settings → Environment Variables, or .env.local locally)."
    );
  }
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose.connect(MONGODB_URI, {
      dbName: process.env.MONGODB_DB || "roster",
      // Serverless-friendly: connections churn between invocations, so fail
      // fast instead of hanging and free idle sockets promptly.
      serverSelectionTimeoutMS: 10000,
      maxIdleTimeMS: 30000,
    });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}
