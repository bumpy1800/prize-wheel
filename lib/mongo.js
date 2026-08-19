import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const DB_NAME = 'prize-wheel';

let client;

export const getClient = async () => {
  if (!uri) throw new Error('MONGODB_URI is not set');
  if (client) return client;
  // Serverless: small pool, no idle keep-alive. Client lives outside the handler.
  const next = new MongoClient(uri, {
    maxPoolSize: 5,
    minPoolSize: 0,
    maxIdleTimeMS: 15_000,
  });
  await next.connect();
  client = next;
  return client;
};

export const getCollection = async (name = 'configs') => {
  const c = await getClient();
  return c.db(DB_NAME).collection(name);
};
