#!/usr/bin/env node

/**
 * Cleanup script to remove any stray memory database files created during testing
 */

import fs from 'fs';
import path from 'path';

function cleanupMemoryFiles() {
  try {
    // Get current directory files
    const files = fs.readdirSync('.');
    
    // Find memory database files
    const memoryFiles = files.filter(file => 
      file.startsWith(':memory:') || 
      file.includes('memory') && (file.endsWith('.db') || file.endsWith('-wal') || file.endsWith('-shm'))
    );
    
    // Remove memory files
    let removedCount = 0;
    for (const file of memoryFiles) {
      try {
        fs.unlinkSync(file);
        removedCount++;
        console.log(`Removed: ${file}`);
      } catch (err) {
        console.warn(`Failed to remove ${file}:`, err.message);
      }
    }
    
    if (removedCount > 0) {
      console.log(`✅ Cleaned up ${removedCount} memory database files`);
    } else {
      console.log('✅ No memory database files found to clean up');
    }
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

// Run cleanup
cleanupMemoryFiles();