import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const models = Prisma.dmmf.datamodel.models;
    
    // Get row count for each model
    const tablesWithCounts = await Promise.all(
      models.map(async (model) => {
        // Find the matching property in the Prisma Client
        // e.g. User -> prisma.user, RoomParticipant -> prisma.roomParticipant
        const prismaKey = model.name.charAt(0).toLowerCase() + model.name.slice(1);
        
        let count = 0;
        try {
          if (prismaKey in prisma) {
            // @ts-expect-error dynamic access
            count = await prisma[prismaKey].count();
          }
        } catch (e) {
          console.warn(`Failed to count table ${model.name}`, e);
        }
        
        return {
          name: model.name,
          dbName: model.dbName || model.name,
          fields: model.fields.map(f => ({
            name: f.name,
            type: f.type,
            kind: f.kind,
            isId: f.isId,
            isRequired: f.isRequired
          })),
          count
        };
      })
    );
    
    return NextResponse.json({ tables: tablesWithCounts });
  } catch (error) {
    console.error('Failed to fetch tables:', error);
    return NextResponse.json({ error: 'Failed to fetch tables' }, { status: 500 });
  }
}
