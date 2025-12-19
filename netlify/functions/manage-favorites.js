const { neon } = require('@netlify/neon');

exports.handler = async (event, context) => {
    // Il database URL viene preso automaticamente dalle variabili d'ambiente di Netlify
    const sql = neon(process.env.NET_DATABASE_URL || process.env.NETLIFY_DATABASE_URL);

    // Verifichiamo se l'utente è loggato tramite Netlify Identity
    const user = context.clientContext && context.clientContext.user;

    try {
        if (event.httpMethod === 'POST') {
            if (!user) return { statusCode: 401, body: "Effettua il login" };

            const { action, item_id, media_type, poster_path } = JSON.parse(event.body);

            if (action === 'add') {
                await sql`
                INSERT INTO favorites (user_email, item_id, media_type, poster_path)
                VALUES (${user.email}, ${item_id}, ${media_type}, ${poster_path})
                ON CONFLICT (user_email, item_id) DO NOTHING`;
                return { statusCode: 200, body: JSON.stringify({ message: "Aggiunto" }) };
            }

            if (action === 'remove') {
                await sql`DELETE FROM favorites WHERE user_email = ${user.email} AND item_id = ${item_id}`;
                return { statusCode: 200, body: JSON.stringify({ message: "Rimosso" }) };
            }
        }

        if (event.httpMethod === 'GET') {
            if (!user) return { statusCode: 200, body: JSON.stringify([]) };

            const favs = await sql`SELECT * FROM favorites WHERE user_email = ${user.email} ORDER BY created_at DESC`;
            return { statusCode: 200, body: JSON.stringify(favs) };
        }

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
