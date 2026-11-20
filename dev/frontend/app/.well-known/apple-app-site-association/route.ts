// Allows the native Mac client's secure Google browser flow to return to SyncBeats.
export function GET() {
  return Response.json(
    { webcredentials: { apps: ["WK3Q328X6P.Syncbeats.Syncbeats"] } },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
