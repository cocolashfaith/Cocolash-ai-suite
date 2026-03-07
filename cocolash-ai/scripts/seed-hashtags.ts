import { HASHTAG_SEED_DATA } from "../lib/constants/hashtags";

const PROJECT_ID = "exkdmmxbrsgefpciyqkz";
const API_TOKEN = "sbp_3aca1e8d10d4ab2156b169c548a1eee304ba7222";

function escapeSQL(str: string): string {
  return str.replace(/'/g, "''");
}

async function seed() {
  console.log(`Seeding ${HASHTAG_SEED_DATA.length} hashtags...`);

  const values = HASHTAG_SEED_DATA.map((h) => {
    const platformArray = `ARRAY[${h.platforms.map((p) => `'${p}'`).join(",")}]::VARCHAR(20)[]`;
    return `(
      '${escapeSQL(h.tag)}',
      '${escapeSQL(h.category)}',
      ${h.sub_category ? `'${escapeSQL(h.sub_category)}'` : "NULL"},
      ${platformArray},
      ${h.popularity_score},
      ${h.is_branded}
    )`;
  }).join(",\n");

  const sql = `
    INSERT INTO hashtags (tag, category, sub_category, platform, popularity_score, is_branded)
    VALUES ${values}
    ON CONFLICT (tag) DO UPDATE SET
      category = EXCLUDED.category,
      sub_category = EXCLUDED.sub_category,
      platform = EXCLUDED.platform,
      popularity_score = EXCLUDED.popularity_score,
      is_branded = EXCLUDED.is_branded,
      updated_at = NOW();
  `;

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (res.status === 201 || res.status === 200) {
    console.log(`✅ Successfully seeded ${HASHTAG_SEED_DATA.length} hashtags`);
  } else {
    const body = await res.text();
    console.error(`❌ Failed to seed: ${res.status}`, body);
    process.exit(1);
  }

  const countRes = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "SELECT COUNT(*) as total FROM hashtags" }),
    }
  );
  const countData = await countRes.json();
  console.log(`📊 Total hashtags in database: ${countData[0]?.total}`);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
