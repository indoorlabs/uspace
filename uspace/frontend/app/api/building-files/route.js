import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const jsonDir = path.join(process.cwd(), "..", "backend", "json");
    const files = fs.readdirSync(jsonDir)
      .filter((f) => f.endsWith(".json"))
      .filter((f) => {
        // Only include files that look like building models (have Stories/Spaces)
        try {
          const raw = fs.readFileSync(path.join(jsonDir, f), "utf-8");
          const data = JSON.parse(raw);
          return data.Stories && data.Spaces;
        } catch {
          return false;
        }
      });
    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
