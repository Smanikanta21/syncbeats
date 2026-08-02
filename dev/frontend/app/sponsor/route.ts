import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.redirect('https://github.com/sponsors/Smanikanta21', 307);
}
