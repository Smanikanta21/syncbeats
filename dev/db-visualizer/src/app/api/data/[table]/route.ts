import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

function getPrismaModel(tableParam: string) {
  let model = Prisma.dmmf.datamodel.models.find(
    m => m.name.toLowerCase() === tableParam.toLowerCase()
  );
  
  if (!model) {
    model = Prisma.dmmf.datamodel.models.find(
      m => m.name === tableParam
    );
  }
  
  if (!model) return null;
  
  let prismaKey = model.name.charAt(0).toLowerCase() + model.name.slice(1);
  if (!(prismaKey in prisma)) {
    prismaKey = model.name; 
  }
  
  return { model, prismaKey };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  try {
    const tableParam = (await params).table;
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    
    const dbInfo = getPrismaModel(tableParam);
    if (!dbInfo || !(dbInfo.prismaKey in prisma)) {
      return NextResponse.json({ error: 'Table or Prisma delegate not found' }, { status: 404 });
    }
    
    // @ts-expect-error dynamic access
    const data = await prisma[dbInfo.prismaKey].findMany({
      orderBy: dbInfo.model.fields.find(f => f.name === 'id') ? { id: 'desc' } : undefined
    });
    
    const serializedData = data.map((row: any) => {
      const newRow = { ...row };
      for (const key in newRow) {
        if (typeof newRow[key] === 'bigint') {
          newRow[key] = newRow[key].toString();
        }
      }
      return newRow;
    });

    return NextResponse.json({ 
      data: serializedData,
      meta: {
        page,
        limit,
        // @ts-expect-error dynamic access
        total: await prisma[dbInfo.prismaKey].count()
      }
    });
  } catch (error) {
    console.error('Failed to fetch data:', error);
    return NextResponse.json({ error: 'Failed to fetch data', details: String(error) }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  try {
    const tableParam = (await params).table;
    const body = await request.json();
    const { id, data } = body;
    
    if (!id || !data) {
      return NextResponse.json({ error: 'Missing id or data' }, { status: 400 });
    }
    
    const dbInfo = getPrismaModel(tableParam);
    if (!dbInfo || !(dbInfo.prismaKey in prisma)) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Convert stringified booleans/numbers if needed based on model schema
    const cleanData: any = {};
    for (const key in data) {
      const field = dbInfo.model.fields.find(f => f.name === key);
      if (field) {
        if (field.type === 'Int' && typeof data[key] === 'string') {
          cleanData[key] = parseInt(data[key], 10);
        } else if (field.type === 'Float' && typeof data[key] === 'string') {
          cleanData[key] = parseFloat(data[key]);
        } else if (field.type === 'Boolean' && typeof data[key] === 'string') {
          cleanData[key] = data[key] === 'true';
        } else {
          cleanData[key] = data[key];
        }
      }
    }
    
    // @ts-expect-error dynamic access
    const result = await prisma[dbInfo.prismaKey].update({
      where: { id },
      data: cleanData
    });
    
    // Stringify bigints
    for (const key in result) {
      if (typeof result[key] === 'bigint') {
        result[key] = result[key].toString();
      }
    }
    
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Failed to update data:', error);
    return NextResponse.json({ error: 'Failed to update data', details: String(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  try {
    const tableParam = (await params).table;
    const body = await request.json();
    const { ids } = body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Missing or empty ids array' }, { status: 400 });
    }
    
    const dbInfo = getPrismaModel(tableParam);
    if (!dbInfo || !(dbInfo.prismaKey in prisma)) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }
    
    // Fetch records to save them to the recycle bin
    // @ts-expect-error dynamic access
    const recordsToDelete = await prisma[dbInfo.prismaKey].findMany({
      where: { id: { in: ids } }
    });
    
    if (recordsToDelete.length > 0) {
      const binPath = path.join(process.cwd(), 'data', 'deleted_records.json');
      await fs.mkdir(path.dirname(binPath), { recursive: true });
      
      let existing = [];
      try {
        const fileData = await fs.readFile(binPath, 'utf-8');
        existing = JSON.parse(fileData);
      } catch (e) {
        // File doesn't exist or is invalid
      }
      
      const now = new Date().toISOString();
      const newEntries = recordsToDelete.map((record: any) => {
        const clone = { ...record };
        for (const key in clone) {
          if (typeof clone[key] === 'bigint') {
            clone[key] = clone[key].toString();
          }
        }
        return {
          deletedAt: now,
          tableName: dbInfo.model.name,
          data: clone
        };
      });
      
      await fs.writeFile(binPath, JSON.stringify([...existing, ...newEntries], null, 2));
    }
    
    // Perform actual deletion
    // @ts-expect-error dynamic access
    const result = await prisma[dbInfo.prismaKey].deleteMany({
      where: { id: { in: ids } }
    });
    
    return NextResponse.json({ success: true, deletedCount: result.count });
  } catch (error) {
    console.error('Failed to delete data:', error);
    return NextResponse.json({ error: 'Failed to delete data', details: String(error) }, { status: 500 });
  }
}
