const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/games/virtual-crowd/crowd-engine.js'), 'utf8');
const config = {
  maxAvatars: 70,
  spawnPerSecond: 8,
  helicopterDurationMs: 10162,
  inactivityMs: 300000,
  colors: ['#fff'],
  characters: ['character.png'],
  getGiftEmoji: () => '🎁',
};

function setup(random = 0.75) {
  let now = 1000;
  const window = {};
  const math = Object.create(Math);
  math.random = () => random;
  vm.runInNewContext(source, { window, performance: { now: () => now }, Image: class {}, Math: math });
  return {
    engine: new window.CrowdEngine(config),
    advance: (ms) => { now += ms; },
  };
}

function user(id) {
  return { uniqueId: id, nickname: id, profilePictureUrl: '' };
}

test('heat reaches 100% display threshold at 50 points and names the last participant', () => {
  const { engine } = setup();
  for (let i = 0; i < 7; i += 1) engine.handleChat({ user: user(`viewer${i}`), comment: 'hello' });
  assert.equal(engine.heatTarget, 50);
  assert.equal(engine.heat, 50);
  assert.equal(engine.moment.type, 'hype');
  assert.equal(engine.moment.avatar.nickname, 'viewer6');
  assert.match(engine.announcements.at(-1).text, /viewer6 quẩy lên ae ơi!/);
});

test('new members fall in once and enter the welcome queue', () => {
  const { engine } = setup();
  engine.handleMember({ user: user('newcomer') });
  engine.tick(0.016);
  assert.equal(engine.moment.type, 'welcome');
  assert.equal(engine.moment.avatar.spawnSource, 'member');
  assert.match(engine.announcements.at(-1).text, /cùng quẩy nào anh em ơi!/);
  engine.handleMember({ user: user('newcomer') });
  assert.equal(engine.welcomeQueue.length, 0);
});

test('member arrival after a chat-created avatar still triggers one welcome', () => {
  const { engine } = setup();
  engine.handleChat({ user: user('early'), comment: 'hello' });
  engine.handleMember({ user: user('early') });
  assert.equal(engine.welcomeQueue.length, 1);
  assert.equal(engine.avatars.get('early').spawnSource, 'member');
  engine.handleMember({ user: user('early') });
  assert.equal(engine.welcomeQueue.length, 1);
});

test('chat zoom follows the commenter when the stage has only a few viewers', () => {
  const { engine } = setup();
  for (let i = 0; i < 3; i += 1) engine.spawn(user(`viewer${i}`));
  engine.handleChat({ user: user('viewer1'), comment: 'xin chào' });
  engine.tick(0.016);
  assert.equal(engine.moment.type, 'chat');
  assert.equal(engine.moment.avatar.nickname, 'viewer1');
  assert.match(engine.moment.text, /viewer1: xin chào/);
  assert.equal(engine.moment.avatar.action, 'dance');
  assert.ok(engine.effects.length > 300);
  assert.ok(engine.effects.length <= 480);
});

test('chat zoom still follows the commenter when the room is busy', () => {
  const { engine } = setup(0.75);
  for (let i = 0; i < 6; i += 1) engine.spawn(user(`viewer${i}`));
  engine.handleChat({ user: user('viewer0'), comment: 'hello' });
  engine.tick(0.016);
  assert.equal(engine.moment.type, 'chat');
  assert.equal(engine.moment.avatar.nickname, 'viewer0');
  assert.match(engine.moment.text, /viewer0: hello/);
});

test('gift effects use the price of one gift and every giver can claim the DJ chair', () => {
  for (const [price, tier, duration] of [[1, 'small', 2700], [5, 'medium', 3000], [30, 'mega', 6600]]) {
    const { engine } = setup();
    engine.handleGift({ user: user('gifter'), giftName: 'Gift', giftValue: price, repeatCount: 1 });
    assert.equal(engine.focus.tier, tier);
    assert.equal(engine.focus.duration, duration);
    assert.equal(engine.focus.avatar.hostBadge, true);
    assert.equal(engine.focus.avatar.djRank, 1);
    assert.equal(engine.focus.avatar.djRole, 'CHỦ TỊCH');
    assert.equal(engine.announcements.at(-1).type, 'gift');
  }
});

test('DJ leaderboard keeps the five biggest supporters and evicts sixth place', () => {
  const { engine, advance } = setup();
  for (let i = 0; i < 6; i += 1) {
    engine.handleGift({ user: user(`giver${i}`), giftName: `Gift ${i}`, giftValue: i + 1, repeatCount: 1 });
    advance(1);
  }
  const leaders = engine.getDjLeaderboard();
  assert.deepEqual(Array.from(leaders, (entry) => entry.avatar.nickname), ['giver5', 'giver4', 'giver3', 'giver2', 'giver1']);
  assert.equal(engine.avatars.get('giver5').djRank, 1);
  assert.equal(engine.avatars.get('giver0').djRank, null);
  assert.ok(engine.djEvents.some((event) => event.type === 'evicted' && event.avatar.nickname === 'giver0'));
});

test('gift streak totals count only newly added combo gifts', () => {
  const { engine } = setup();
  const gift = { user: user('combo'), giftId: 7, giftName: 'Rose', giftValue: 1, repeatCount: 1 };
  engine.handleGift(gift);
  engine.handleGift({ ...gift, repeatCount: 2 });
  engine.handleGift({ ...gift, repeatCount: 2 });
  assert.equal(engine.getDjLeaderboard()[0].total, 2);
});

test('high-value gift randomly chooses DJ or helicopter and helicopter ends with the audio', () => {
  const gift = { user: user('pilot'), giftName: 'Bánh vòng', giftValue: 30, repeatCount: 1 };
  const dj = setup(0.75).engine;
  dj.handleGift(gift);
  assert.equal(dj.focus.variant, 'dj');
  const helicopter = setup(0.25).engine;
  helicopter.handleGift(gift);
  assert.equal(helicopter.focus.variant, 'helicopter');
  assert.equal(helicopter.focus.duration, 10162);
  assert.equal(helicopter.focus.avatar.action, 'helicopter');
  assert.match(helicopter.focus.text, /cất cánh!/);
  helicopter.finishHelicopter();
  assert.equal(helicopter.focus.avatar.action, 'dance');
  assert.match(helicopter.focus.text, /lên ae lên lên!/);
  assert.equal(helicopter.focus.outro, true);
});

test('muted helicopter finishes on the MP3 duration and shows the outro', () => {
  const { engine, advance } = setup(0.25);
  engine.handleGift({ user: user('pilot'), giftName: 'Bánh vòng', giftValue: 30, repeatCount: 1 });
  advance(10163);
  engine.tick(0.016);
  assert.equal(engine.focus.outro, true);
  assert.equal(engine.focus.avatar.action, 'dance');
  advance(1601);
  engine.tick(0.016);
  assert.equal(engine.focus, null);
});

test('gift that fills heat plays first, then starts the seven-second celebration', () => {
  const { engine, advance } = setup();
  for (let i = 0; i < 6; i += 1) engine.handleChat({ user: user(`viewer${i}`), comment: 'hello' });
  engine.handleGift({ user: user('gifter'), giftName: 'Rose', giftValue: 1, repeatCount: 1 });
  assert.equal(engine.focus.tier, 'small');
  assert.equal(engine.pendingHype.nickname, 'gifter');
  advance(2701);
  engine.tick(0.016);
  assert.equal(engine.focus, null);
  assert.equal(engine.moment.type, 'hype');
  advance(7001);
  engine.tick(0.016);
  assert.equal(engine.heat, 0);
});

test('repeated gift updates only add heat for newly counted gifts', () => {
  const { engine } = setup();
  const gift = { user: user('gifter'), giftId: 1, giftName: 'Hoa hồng', giftValue: 1, repeatCount: 1 };
  engine.handleGift(gift);
  engine.handleGift({ ...gift, repeatCount: 2 });
  engine.handleGift({ ...gift, repeatCount: 2 });
  assert.equal(engine.heat, 18);
  assert.equal(engine.focus.count, 2);
});

test('particle bursts stay within the live rendering budget', () => {
  const { engine } = setup();
  engine.fireworks(40);
  engine.tick(0.016);
  assert.ok(engine.effects.length <= 480);
});
