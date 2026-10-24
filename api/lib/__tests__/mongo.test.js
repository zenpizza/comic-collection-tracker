import { describe, it, expect, vi, beforeEach } from 'vitest'

const instances = []
let failNextConnect = false

vi.mock('mongodb', () => ({
  MongoClient: class {
    constructor(uri, options) {
      this.uri = uri
      this.options = options
      instances.push(this)
    }
    async connect() {
      await new Promise(r => setTimeout(r, 5))
      if (failNextConnect) {
        failNextConnect = false
        throw new Error('connect failed')
      }
      return this
    }
    db(name) {
      return { name, client: this }
    }
  },
}))

process.env.MONGODB_URI = 'mongodb://localhost:27017/comic-test'

async function freshModule() {
  vi.resetModules()
  return import('../mongo.js')
}

describe('connectToDatabase (COM-20)', () => {
  beforeEach(() => {
    instances.length = 0
    failNextConnect = false
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('reuses one client across calls', async () => {
    const { connectToDatabase } = await freshModule()
    const a = await connectToDatabase()
    const b = await connectToDatabase()

    expect(instances).toHaveLength(1)
    expect(a.client).toBe(b.client)
    expect(a.name).toBe('comic-test')
  })

  it('shares one connection attempt between concurrent cold-start calls', async () => {
    const { connectToDatabase } = await freshModule()
    await Promise.all([connectToDatabase(), connectToDatabase(), connectToDatabase()])

    expect(instances).toHaveLength(1)
  })

  it('caps the connection pool size', async () => {
    const { connectToDatabase } = await freshModule()
    await connectToDatabase()

    expect(instances[0].options.maxPoolSize).toBe(10)
  })

  it('retries with a new client after a failed connect', async () => {
    const { connectToDatabase } = await freshModule()
    failNextConnect = true

    await expect(connectToDatabase()).rejects.toThrow('connect failed')
    await expect(connectToDatabase()).resolves.toBeTruthy()
    expect(instances).toHaveLength(2)
  })
})
