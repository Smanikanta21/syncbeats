import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const binPath = path.join(process.cwd(), 'data', 'deleted_records.json');
    let records = [];
    
    try {
      const fileData = await fs.readFile(binPath, 'utf-8');
      records = JSON.parse(fileData);
    } catch (e) {
      // If file doesn't exist, we just return empty array
      records = [];
    }
    
    // Sort by most recently deleted first
    records.sort((a: any, b: any) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
    
    return NextResponse.json({ records });
  } catch (error) {
    console.error('Failed to fetch deleted records:', error);
    return NextResponse.json({ error: 'Failed to fetch deleted records', details: String(error) }, { status: 500 });
  }
}
