// MongoDB initialization script for local development
// This runs automatically when the Docker container is first created

db = db.getSiblingDB('comic-collection');

// Create collections
db.createCollection('comics');
db.createCollection('cover_images');

// Create indexes for performance
db.comics.createIndex({ series: 1, issueNumber: 1 });
db.comics.createIndex({ publisher: 1 });
db.comics.createIndex({ year: 1 });
db.cover_images.createIndex({ comicId: 1 });

print('✅ Database initialized with collections and indexes');
