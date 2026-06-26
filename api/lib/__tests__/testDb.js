import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient } from 'mongodb'

export async function startTestDb() {
  const mongod = await MongoMemoryServer.create()
  const client = new MongoClient(mongod.getUri())
  await client.connect()
  const db = client.db('test')

  return {
    db,
    async stop() {
      await client.close()
      await mongod.stop()
    },
  }
}
