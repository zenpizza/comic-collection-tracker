#!/usr/bin/env node
/**
 * Detailed MongoDB Connection Diagnostics
 */

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import dns from 'dns';
import { promisify } from 'util';

dotenv.config({ path: '.env.local' });

const resolveSrv = promisify(dns.resolveSrv);
const resolve4 = promisify(dns.resolve4);

console.log('🔍 Detailed MongoDB Connection Diagnostics\n');

// Extract cluster hostname
const uri = process.env.MONGODB_URI;
const match = uri.match(/mongodb\+srv:\/\/[^@]+@([^/?]+)/);
const clusterHost = match ? match[1] : null;

console.log('1️⃣ DNS Resolution Test');
console.log('═'.repeat(50));
if (clusterHost) {
  console.log('Cluster hostname:', clusterHost);
  
  try {
    // Test SRV record resolution
    console.log('\n📡 Testing SRV record...');
    const srvRecords = await resolveSrv(`_mongodb._tcp.${clusterHost}`);
    console.log('✅ SRV records found:', srvRecords.length);
    srvRecords.forEach((record, i) => {
      console.log(`   ${i + 1}. ${record.name}:${record.port} (priority: ${record.priority})`);
    });
    
    // Test A record resolution for first SRV target
    if (srvRecords.length > 0) {
      console.log('\n📡 Testing A record for first target...');
      const firstTarget = srvRecords[0].name;
      const aRecords = await resolve4(firstTarget);
      console.log('✅ IP addresses:', aRecords.join(', '));
    }
  } catch (error) {
    console.log('❌ DNS resolution failed:', error.message);
    console.log('\n💡 This could indicate:');
    console.log('   - Network connectivity issues');
    console.log('   - DNS server problems');
    console.log('   - VPN/proxy interference');
  }
}

console.log('\n2️⃣ MongoDB Driver Test');
console.log('═'.repeat(50));
try {
  const pkg = await import('mongodb/package.json', { with: { type: 'json' } });
  console.log('MongoDB driver version:', pkg.default.version);
} catch {
  console.log('MongoDB driver version: (unable to detect)');
}

console.log('\n3️⃣ Connection Attempt with Verbose Logging');
console.log('═'.repeat(50));

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
  socketTimeoutMS: 15000,
  // Enable monitoring
  monitorCommands: true,
});

// Add event listeners for debugging
client.on('serverOpening', (event) => {
  console.log('🔌 Opening connection to:', event.address);
});

client.on('serverClosed', (event) => {
  console.log('🔌 Connection closed:', event.address);
});

client.on('serverDescriptionChanged', (event) => {
  console.log('📊 Server state changed:', event.address, '->', event.newDescription.type);
});

client.on('topologyDescriptionChanged', (event) => {
  console.log('🗺️  Topology changed:', event.newDescription.type);
});

try {
  console.log('⏳ Attempting connection...\n');
  await client.connect();
  console.log('\n✅ Connection successful!');
  
  const db = client.db('comic-collection');
  const adminDb = client.db().admin();
  
  // Test a simple operation
  const serverStatus = await adminDb.serverStatus();
  console.log('✅ Server version:', serverStatus.version);
  console.log('✅ Server uptime:', Math.floor(serverStatus.uptime / 60), 'minutes');
  
  const collections = await db.listCollections().toArray();
  console.log('✅ Collections:', collections.map(c => c.name).join(', '));
  
} catch (error) {
  console.log('\n❌ Connection failed!');
  console.log('\nError details:');
  console.log('  Name:', error.name);
  console.log('  Message:', error.message);
  console.log('  Code:', error.code);
  
  if (error.reason) {
    console.log('\nTopology state:');
    console.log('  Type:', error.reason.type);
    console.log('  Servers:', error.reason.servers.size);
    
    for (const [address, server] of error.reason.servers) {
      console.log(`\n  Server: ${address}`);
      console.log(`    Type: ${server.type}`);
      console.log(`    Error: ${server.error?.message || 'none'}`);
    }
  }
  
  console.log('\n💡 Troubleshooting steps:');
  console.log('  1. Check if you can access MongoDB Atlas dashboard');
  console.log('  2. Try connecting from a different network');
  console.log('  3. Check for VPN/proxy that might block MongoDB ports');
  console.log('  4. Verify firewall settings (MongoDB uses port 27017)');
  console.log('  5. Try using a different DNS server (e.g., 8.8.8.8)');
  
} finally {
  await client.close();
}

console.log('\n' + '═'.repeat(50));
