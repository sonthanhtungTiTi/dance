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

test('gift effects use the price of one gift and >5 coin gifts grant the badge', () => {
  for (const [price, tier, duration, badge] of [[1, 'small', 2700, false], [5, 'medium', 3000, false], [30, 'mega', 6600, true]]) {
    const { engine } = setup();
    engine.handleGift({ user: user('gifter'), giftName: 'Gift', giftValue: price, repeatCount: 1 });
    assert.equal(engine.focus.tier, tier);
    assert.equal(engine.focus.duration, duration);
    assert.equal(engine.focus.avatar.hostBadge, badge);
    assert.equal(engine.announcements.at(-1).type, 'gift');
  }
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
