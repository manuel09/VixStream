const { neon } = require('@netlify/neon');

const sql = neon();

let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) {
    // "favorites" potrebbe non esistere: la creiamo al volo (e aggiungiamo le
    // colonne mancanti nel caso la tabella esista già senza created_at/poster_path)
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS favorites (
        user_email TEXT NOT NULL,
        item_id TEXT NOT NULL,
        media_type TEXT NOT NULL DEFAULT 'movie',
        poster_path TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_email, item_id)
      )`
      .then(() => sql`ALTER TABLE favorites ALTER COLUMN user_email TYPE TEXT`)
      .then(() => sql`ALTER TABLE favorites ADD COLUMN IF NOT EXISTS poster_path TEXT`)
      .then(() => sql`ALTER TABLE favorites ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()`)
      .then(() => sql`ALTER TABLE favorites ADD COLUMN IF NOT EXISTS title TEXT`);
  }
  return schemaReady;
}

const json = (statusCode, body) => ({
  statusCode,
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' }
});

exports.handler = async (event, context) => {
  const user = context.clientContext && context.clientContext.user;

  try {
    if (event.httpMethod === 'GET') {
      if (!user) return json(200, []);

      await ensureSchema();
      const favs = await sql`
        SELECT user_email, item_id, media_type, poster_path, created_at, title
        FROM favorites
        WHERE user_email = ${user.email}
        ORDER BY created_at DESC`;
      return json(200, favs);
    }

    if (event.httpMethod === 'POST') {
      if (!user) return json(401, { error: 'Effettua il login' });

      const { action, item_id, media_type, poster_path, title } = JSON.parse(event.body || '{}');
      if (!action || item_id == null) return json(400, { error: 'Dati mancanti: action e item_id richiesti' });

      await ensureSchema();

      if (action === 'add') {
        await sql`
          INSERT INTO favorites (user_email, item_id, media_type, poster_path, title)
          VALUES (${user.email}, ${String(item_id)}, ${media_type || 'movie'}, ${poster_path || null}, ${title || null})
          ON CONFLICT (user_email, item_id) DO UPDATE SET
            media_type = EXCLUDED.media_type,
            poster_path = EXCLUDED.poster_path,
            title = EXCLUDED.title,
            created_at = now()`;
        return json(200, { message: 'Aggiunto' });
      }

      if (action === 'remove') {
        await sql`DELETE FROM favorites WHERE user_email = ${user.email} AND item_id = ${String(item_id)}`;
        return json(200, { message: 'Rimosso' });
      }

      return json(400, { error: 'Azione non riconosciuta' });
    }

    return json(405, { error: 'Metodo non consentito' });
  } catch (error) {
    return json(500, { error: error.message });
  }
};