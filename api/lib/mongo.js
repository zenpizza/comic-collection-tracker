/**
 * Shared MongoDB connection
 *
 * Every API module gets its database through connectToDatabase() so a
 * serverless instance holds one MongoClient (one connection pool), reused
 * across warm invocations. Functions that load several modules — e.g. the
 * image endpoints, which also import db-image-storage.js — previously opened
 * a separate client per module.
 */

import { MongoClient } from 'mongodb'
import { getMongoDBUri, getDatabaseName } from '../config.js'

// The driver default (100) is sized for long-lived servers. Each warm
// serverless instance needs only a handful, and Atlas caps total connections.
const MAX_POOL_SIZE = 10

let clientPromise = null

export async function connectToDatabase() {
  if (!clientPromise) {
    // Cache the promise, not the client, so concurrent cold-start requests
    // share one connection attempt instead of each creating a client.
    const client = new MongoClient(getMongoDBUri(), { maxPoolSize: MAX_POOL_SIZE })
    clientPromise = client.connect().catch(error => {
      clientPromise = null // allow the next request to retry
      console.error('MongoDB connection error:', error)
      throw error
    })
  }

  const client = await clientPromise
  return client.db(getDatabaseName())
}
