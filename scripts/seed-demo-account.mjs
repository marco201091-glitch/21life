import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || 'demo@phyrexianarena.local';
const DEMO_USERNAME = 'demo';

function loadEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        return [key, value];
      })
      .filter(([key]) => key),
  );
}

function normalizeGuestName(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const SCRYFALL_HEADERS = {
  Accept: 'application/json',
  'User-Agent': '21Life/9.1 (https://app.21life.win)',
};

function extractScryfallImage(card) {
  if (card?.image_uris?.art_crop) return card.image_uris.art_crop;
  if (card?.card_faces?.[0]?.image_uris?.art_crop) return card.card_faces[0].image_uris.art_crop;
  if (card?.id) {
    return `https://cards.scryfall.io/display/front/${card.id[0]}/${card.id[1]}/${card.id}.webp`;
  }
  return card?.image_uris?.large || card?.image_uris?.normal || null;
}

async function fetchCommanderImage(commanderName) {
  if (process.env.DEMO_SKIP_REMOTE_IMAGES === 'true') return null;
  const queryText = commanderName.trim().replace(/"/g, '');
  if (!queryText) return null;

  const attempts = [
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(queryText)}`,
    `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(queryText)}`,
  ];

  for (const url of attempts) {
    const response = await fetch(url, { headers: SCRYFALL_HEADERS });
    if (!response.ok) continue;
    const card = await response.json();
    const imageUrl = extractScryfallImage(card);
    if (imageUrl) return imageUrl;
  }

  return null;
}

async function withCommanderImage(deck) {
  return { ...deck, commander_image: await fetchCommanderImage(deck.commander) };
}

async function findDemoUserId(admin, email) {
  const normalizedEmail = email.trim().toLowerCase();
  let page = 1;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;

    const match = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (match) return match;

    if (data.users.length < 200) break;
    page += 1;
  }

  return null;
}

async function wipeDemoUserData(admin, demoUserId) {
  await admin.from('groups').delete().eq('created_by', demoUserId);
  await admin.from('decks').delete().eq('user_id', demoUserId);
  await admin.from('group_members').delete().eq('user_id', demoUserId);

  const { data: avatarFiles } = await admin.storage.from('avatars').list(demoUserId);
  if (avatarFiles?.length) {
    await admin.storage.from('avatars').remove(avatarFiles.map((file) => `${demoUserId}/${file.name}`));
  }

  await admin.from('profiles').update({ display_name: 'Demo Player' }).eq('id', demoUserId);
}

async function seedDemoTemplate(admin, demoUserId) {
  const { data: arena, error: arenaError } = await admin
    .from('groups')
    .insert({
      name: 'Playgroup Demo',
      description: 'Sandbox di prova: crea partite, mazzi e ospiti. I dati vengono resettati periodicamente.',
      created_by: demoUserId,
      is_public: true,
    })
    .select('id, invite_code')
    .single();

  if (arenaError || !arena) throw arenaError ?? new Error('Failed to create demo arena');

  await admin.from('decks').insert(await Promise.all([
    withCommanderImage({
      user_id: demoUserId,
      group_id: null,
      name: 'Superfriends',
      commander: 'Atraxa, Praetors\' Voice',
      color_identity: ['W', 'U', 'B', 'G'],
      bracket: '3',
    }),
    withCommanderImage({
      user_id: demoUserId,
      group_id: null,
      name: 'Vampiri',
      commander: 'Edgar Markov',
      color_identity: ['W', 'B', 'R'],
      bracket: '3',
    }),
  ]));

  const { data: arenaDeck, error: arenaDeckError } = await admin
    .from('decks')
    .insert(await withCommanderImage({
      user_id: demoUserId,
      group_id: arena.id,
      name: 'Tokens & Taxes',
      commander: 'Grand Arbiter Augustin IV',
      color_identity: ['W', 'U'],
      bracket: '3',
    }))
    .select('id')
    .single();

  if (arenaDeckError || !arenaDeck) throw arenaDeckError ?? new Error('Failed to create demo arena deck');

  const { data: guestRows, error: guestError } = await admin
    .from('arena_guests')
    .insert([
      { group_id: arena.id, display_name: 'Ophidian', normalized_name: normalizeGuestName('Ophidian') },
      { group_id: arena.id, display_name: 'Venser', normalized_name: normalizeGuestName('Venser') },
    ])
    .select('id, display_name');

  if (guestError || !guestRows?.length) throw guestError ?? new Error('Failed to create demo guests');

  const ophidian = guestRows.find((guest) => guest.display_name === 'Ophidian');
  const venser = guestRows.find((guest) => guest.display_name === 'Venser');

  const { data: guestDecks, error: guestDeckError } = await admin
    .from('arena_guest_decks')
    .insert(await Promise.all([
      withCommanderImage({
        guest_id: ophidian.id,
        group_id: arena.id,
        name: 'Slivers',
        commander: 'Sliver Overlord',
        color_identity: ['W', 'U', 'B', 'R', 'G'],
        bracket: '4',
      }),
      withCommanderImage({
        guest_id: venser.id,
        group_id: arena.id,
        name: 'Artifacts',
        commander: 'Urza, Lord High Artificer',
        color_identity: ['U'],
        bracket: '4',
      }),
    ]))
    .select('id, guest_id');

  if (guestDeckError || !guestDecks?.length) throw guestDeckError ?? new Error('Failed to create demo guest decks');

  const ophidianDeck = guestDecks.find((deck) => deck.guest_id === ophidian.id);
  const venserDeck = guestDecks.find((deck) => deck.guest_id === venser.id);
  const now = Date.now();
  const matchSeeds = [
    { played_at: new Date(now - 5 * 86400000).toISOString(), winner_id: demoUserId },
    { played_at: new Date(now - 3 * 86400000).toISOString(), winner_guest_id: ophidian.id },
    { played_at: new Date(now - 2 * 86400000).toISOString(), winner_id: demoUserId },
    { played_at: new Date(now - 86400000).toISOString(), winner_guest_id: venser.id },
  ];

  for (const matchSeed of matchSeeds) {
    const { data: match, error: matchError } = await admin
      .from('matches')
      .insert({
        group_id: arena.id,
        created_by: demoUserId,
        played_at: matchSeed.played_at,
        winner_id: matchSeed.winner_id ?? null,
        winner_guest_id: matchSeed.winner_guest_id ?? null,
        notes: 'Demo match',
      })
      .select('id')
      .single();

    if (matchError || !match) throw matchError ?? new Error('Failed to create demo match');

    await admin.from('match_participants').insert([
      {
        match_id: match.id,
        user_id: demoUserId,
        deck_id: arenaDeck.id,
        is_winner: matchSeed.winner_id === demoUserId,
      },
      {
        match_id: match.id,
        guest_id: ophidian.id,
        guest_deck_id: ophidianDeck.id,
        is_winner: matchSeed.winner_guest_id === ophidian.id,
      },
      {
        match_id: match.id,
        guest_id: venser.id,
        guest_deck_id: venserDeck.id,
        is_winner: matchSeed.winner_guest_id === venser.id,
      },
    ]);
  }

  return { arenaId: arena.id, inviteCode: arena.invite_code };
}

const env = { ...loadEnv('.env.local'), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const demoPassword = env.DEMO_USER_PASSWORD || `DemoArena!${randomBytes(3).toString('hex')}`;

let demoUser = await findDemoUserId(admin, DEMO_EMAIL);

if (!demoUser) {
  const { data, error } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: demoPassword,
    email_confirm: true,
    app_metadata: { is_demo: true },
    user_metadata: { username: DEMO_USERNAME },
  });

  if (error) throw error;
  demoUser = data.user;
  console.log('Created demo auth user');
} else {
  const { error } = await admin.auth.admin.updateUserById(demoUser.id, {
    password: demoPassword,
    email_confirm: true,
    app_metadata: { is_demo: true },
    user_metadata: { username: DEMO_USERNAME },
  });
  if (error) throw error;
  console.log('Updated demo auth user');
}

await admin.from('profiles').upsert({
  id: demoUser.id,
  username: DEMO_USERNAME,
  display_name: 'Demo Player',
});

await wipeDemoUserData(admin, demoUser.id);
const seeded = await seedDemoTemplate(admin, demoUser.id);

console.log('Demo account ready.');
console.log(`DEMO_USER_ID=${demoUser.id}`);
console.log(`DEMO_USER_EMAIL=${DEMO_EMAIL}`);
console.log(`DEMO_USER_PASSWORD=${demoPassword}`);
console.log(`Playgroup invite code: ${seeded.inviteCode}`);
console.log('');
console.log('Add these to the local environment and the matching Dokploy application:');
console.log('DEMO_MODE_ENABLED=true');
console.log('NEXT_PUBLIC_DEMO_MODE=true');
console.log(`DEMO_USER_ID=${demoUser.id}`);
console.log(`DEMO_USER_EMAIL=${DEMO_EMAIL}`);
console.log(`DEMO_USER_PASSWORD=${demoPassword}`);
console.log('CRON_SECRET=<generate a long random secret>');
