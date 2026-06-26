/**
 * Lazy account creation — the first authenticated request from a Clerk
 * userId upserts an account record. No webhook required.
 */
export async function getOrCreateAccount(db, { userId, email }) {
  const collection = db.collection('accounts')

  const result = await collection.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        email,
        createdAt: new Date().toISOString(),
      },
    },
    { upsert: true, returnDocument: 'after' }
  )

  return result.value ?? result
}
