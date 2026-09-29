// The sync engine under a hostile schedule (docs/PERSIST.md §5, "Tests before
// the server exists").
//
// Several devices share one account and one memory server. A seeded schedule
// interleaves local work (edits, new files, renames, deletes of lines, files
// and whole projects, folders, suites, new projects), sync rounds, and the
// network: every call waits in a queue until the schedule delivers it, drops
// it before the server sees it, loses the answer after the server acted,
// delivers it twice, or leaves it waiting while others overtake it. Devices
// also go offline.
//
// Every edit writes a unique token line. Afterwards the network heals, every
// open conflict is settled with Keep both, and the devices sync until quiet.
// Then:
//   - every device holds exactly what the server holds (convergence);
//   - every token is still there, unless a device deleted it knowingly (the
//     line, its file, or its project, while holding it);
//   - every project's history on the server is a line: version n was
//     committed over version n - 1;
//   - nothing is left pending: no conflict, tombstone or unanswered commit;
//   - no pass ever reported an error;
//   - a setting that stays on its device (belugaMode) holds what that device
//     set, whatever the others did;
//   - no device was ever asked to choose against its own work: the other side
//     of a conflict was never last put in that file by that device's own
//     commit (a commit whose answer was lost, coming back as someone else's
//     change). A device can see an older text of its own come back honestly:
//     another device deleting a line can recreate it exactly. So the rule asks
//     who made the change on the server, not whose text it resembles.
import { createMemoryServer } from '../js/persist/sync/memory-server.mjs';
import { conflictedCopyName } from '../js/persist/merge.mjs';
import { syncKey } from '../js/persist/keys.mjs';
import { cleanSyncedValues } from '../js/persist/sync/settings-sync.mjs';
import { makeDevice, syncHash, sha256Now, accountState, addFile, renameFile, deleteFile } from './_sync-env.mjs';

let checks = 0;
function expect(cond, msg) {
  checks += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const flush = () => new Promise((r) => setImmediate(r));
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const PATHS = ['a.bel', 'b.bel', 'c.bel', 'lib/d.bel', 'lib/e.bel', 'x.cfg'];
const FOLDERS = ['empty', 'lib', 'more/stuff'];
const ACCOUNT = 'u_sim';

// What the runs reached, summed over every seed: a schedule that stopped
// reaching lost answers, replays, conflicts or deletes would pass while
// proving nothing, so each has a floor (checked at the end).
const reach = {
  dropped: 0, lost: 0, twice: 0, replays: 0, offline: 0,
  conflict: 0, copied: 0, kept: 0, restored: 0, renamed: 0,
  'project-deleted': 0, 'project-restored': 0, 'project-kept': 0,
  keptBoth: 0, deletedKnowingly: 0,
  // a pass that found its project changed while it waited, and started again
  moved: 0,
};

function simulate(seed, opts) {
  const rand = mulberry32(seed);
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  // People edit where they are: most edits land near the top, so two
  // devices often touch the same lines.
  const spot = (n) => (rand() < 0.45 ? 0 : Math.floor(rand() * n));
  const server = createMemoryServer({ hash: syncHash });
  const queue = [];
  const faults = { on: true };
  const devices = [];
  const created = new Map(); // token → device
  const knowinglyDeleted = new Set();
  const failures = [];
  const log = [];

  function transportFor(dev) {
    const real = server.transport(ACCOUNT);
    const t = {};
    for (const method of Object.keys(real)) {
      t[method] = (...args) => {
        if (dev.offline) return Promise.reject(new Error('offline'));
        return new Promise((resolve, reject) => queue.push({ dev, method, args: clone(args), resolve, reject, real }));
      };
    }
    return t;
  }

  for (let i = 0; i < opts.devices; i++) {
    const dev = { offline: false, running: null, tokens: 0, checked: new Set(), belugaMode: 'stable' };
    Object.assign(dev, makeDevice(server, {
      account: ACCOUNT,
      name: 'D' + i,
      transport: transportFor(dev),
      trace: (e) => { if (e.kind === 'moved') reach.moved += 1; },
    }));
    devices.push(dev);
  }

  function write(dev, pid, fid, text) {
    dev.work.setText(fid, text, pid);
  }

  /**
   * Checked right after the step that made a conflict, while the device's
   * sync record still names the version the merge used: in that version,
   * who last changed the file to the text now called theirs?
   */
  function checkOwnConflicts() {
    for (const dev of devices) {
      for (const [pid, fid] of conflictsOf(dev)) {
        const rec = dev.work.readConflict(fid, pid);
        const key = pid + '/' + fid + '@' + rec.at;
        if (dev.checked.has(key)) continue;
        dev.checked.add(key);
        const synced = dev.store.get(syncKey(pid));
        const hist = server.history(pid);
        if (!synced || !hist || !synced.version) continue;
        const h = sha256Now(rec.theirs);
        const entry = (i) => {
          const m = i >= 0 && hist.versions[i].manifest;
          return m ? m.files.find((f) => f.id === fid) : null;
        };
        for (let i = Math.min(synced.version, hist.versions.length) - 1; i >= 0; i--) {
          const here = entry(i);
          if (!here || here.hash !== h) continue;
          const before = entry(i - 1);
          if (before && before.hash === h) continue;
          if (hist.versions[i].commit.startsWith(dev.name + '-')) {
            failures.push(`${dev.name} was asked to choose against its own commit (${hist.versions[i].commit}) on ${fid}`);
          }
          break;
        }
      }
    }
  }
  // One device starts with a project; the rest start empty and receive it.
  devices[0].work.projectId();

  function ownProjects(dev) {
    return dev.work.allProjects().filter((p) => p.owner === ACCOUNT);
  }

  function tokensIn(text) {
    return String(text).split('\n').filter((l) => l.startsWith('tok '));
  }

  function forgetKnowingly(texts) {
    for (const t of texts) for (const tok of tokensIn(t)) knowinglyDeleted.add(tok);
  }

  function sidesOf(dev, pid, fid) {
    const out = [dev.work.getText(fid, pid)];
    const rec = dev.work.readConflict(fid, pid);
    if (rec) out.push(rec.mine);
    return out;
  }

  /** Keep both, as the dialog does: theirs becomes a copy, mine stays in the file. */
  function keepBoth(dev, pid, fid) {
    const rec = dev.work.readConflict(fid, pid);
    if (!rec) return;
    const tree = dev.work.readTree(pid);
    const file = tree.files.find((f) => f.id === fid);
    if (!file) return;
    const theirs = dev.work.getText(fid, pid);
    const copy = conflictedCopyName(file.name, new Set(tree.files.map((f) => f.name)));
    addFile(dev.work, pid, copy, theirs);
    reach.keptBoth += 1;
    write(dev, pid, fid, rec.mine);
    dev.work.removeConflict(fid, pid);
  }

  function conflictsOf(dev) {
    const out = [];
    for (const key of dev.store.keys('beljar/p/')) {
      const m = /^beljar\/p\/([^/]+)\/conflict\/([^/]+)$/.exec(key);
      if (m) out.push([m[1], m[2]]);
    }
    return out;
  }

  function localOp(dev) {
    const projects = ownProjects(dev);
    const r = rand();
    if (!projects.length || r < 0.03) {
      if (projects.length < 4) {
        const pid = dev.work.createProject('P' + Math.floor(rand() * 5));
        if (pid) log.push(`${dev.name} creates project ${pid}`);
      }
      return;
    }
    const pid = pick(projects).id;
    const tree = dev.work.readTree(pid);
    const files = tree.files;
    const taken = new Set(files.map((f) => f.name));
    if (r < 0.45 && files.length) {
      const f = pick(files);
      const lines = dev.work.getText(f.id, pid).split('\n');
      const tok = `tok ${dev.name}-${++dev.tokens}`;
      lines.splice(spot(lines.length), 0, tok);
      write(dev, pid, f.id, lines.join('\n'));
      created.set(tok, dev.name);
    } else if (r < 0.52 && files.length) {
      const f = pick(files);
      const lines = dev.work.getText(f.id, pid).split('\n');
      const at = lines.map((l, i) => (l.startsWith('tok ') ? i : -1)).filter((i) => i >= 0);
      if (!at.length) return;
      const i = pick(at);
      knowinglyDeleted.add(lines[i]);
      lines.splice(i, 1);
      write(dev, pid, f.id, lines.join('\n'));
    } else if (r < 0.60) {
      const path = PATHS.filter((p) => !taken.has(p));
      if (!path.length) return;
      addFile(dev.work, pid, pick(path), '');
    } else if (r < 0.66 && files.length) {
      const free = PATHS.filter((p) => !taken.has(p));
      if (!free.length) return;
      renameFile(dev.work, pid, pick(files).id, pick(free));
    } else if (r < 0.71 && files.length > 1) {
      const f = pick(files);
      forgetKnowingly(sidesOf(dev, pid, f.id));
      deleteFile(dev.work, pid, f.id);
    } else if (r < 0.74) {
      dev.work.renameProject(pid, 'P' + Math.floor(rand() * 5));
    } else if (r < 0.76 && projects.length > 1) {
      const texts = [];
      for (const f of files) texts.push(...sidesOf(dev, pid, f.id));
      if (dev.work.deleteProject(pid)) {
        forgetKnowingly(texts);
        log.push(`${dev.name} deletes project ${pid}`);
      }
    } else if (r < 0.80) {
      const folder = pick(FOLDERS);
      dev.work.updateTree((t) => {
        if (t.folders.includes(folder)) t.folders = t.folders.filter((x) => x !== folder);
        else t.folders.push(folder);
      }, pid);
    } else if (r < 0.83) {
      const cfgs = files.filter((f) => f.name.endsWith('.cfg')).map((f) => f.name);
      dev.work.updateTree((t) => {
        if (t.suites[''] && rand() < 0.5) delete t.suites[''];
        else if (cfgs.length) t.suites[''] = [pick(cfgs)];
      }, pid);
    } else {
      // A file in conflict goes on changing on both sides: the open editor
      // types into the record's mine, another tab saves over storage. Now
      // and then a person settles it with Keep both.
      const open = conflictsOf(dev);
      if (!open.length) return;
      const [cpid, cfid] = pick(open);
      const roll = rand();
      if (roll < 0.25) {
        keepBoth(dev, cpid, cfid);
        return;
      }
      const tok = `tok ${dev.name}-${++dev.tokens}`;
      created.set(tok, dev.name);
      const insert = (text) => {
        const lines = text.split('\n');
        lines.splice(spot(lines.length), 0, tok);
        return lines.join('\n');
      };
      if (roll < 0.6) {
        const rec = dev.work.readConflict(cfid, cpid);
        dev.work.writeConflict(cfid, Object.assign(rec, { mine: insert(rec.mine) }), cpid);
      } else {
        write(dev, cpid, cfid, insert(dev.work.getText(cfid, cpid)));
      }
    }
  }

  function startRound(dev) {
    if (dev.running) return;
    dev.running = dev.engine.syncAll().then((res) => {
      dev.running = null;
      dev.last = res;
      for (const r of Object.values(res.projects)) {
        if (r.status === 'error') failures.push(`${dev.name}: ${r.pid}: ${r.message}`);
      }
      if (res.settings.status === 'error') failures.push(`${dev.name}: settings: ${res.settings.message}`);
    }, (err) => {
      dev.running = null;
      dev.last = null;
      if (!err || !err.offline) failures.push(`${dev.name}: ${err && err.stack || err}`);
    });
  }

  async function deliver(call, fate) {
    const { method, args, resolve, reject, real } = call;
    if (fate === 'drop') {
      reach.dropped += 1;
      reject(new Error('dropped'));
      return;
    }
    const res = clone(await real[method](...clone(args)));
    if (res && res.replay) reach.replays += 1;
    if (fate === 'lose') {
      reach.lost += 1;
      reject(new Error('response lost'));
      return;
    }
    if (fate === 'twice') {
      reach.twice += 1;
      await real[method](...clone(args));
    }
    resolve(res);
  }

  function settingsOp(dev) {
    const ids = ['theme', 'editorFontSize', 'keymapStyle', 'belugaMode'];
    const id = pick(ids);
    const row = dev.settings.defaultOf(id);
    const values = { theme: ['dark', 'light'], editorFontSize: ['sm', 'md', 'lg'], keymapStyle: ['default', 'vim', 'emacs'], belugaMode: ['stable', 'fast'] }[id];
    const v = pick(values.filter((x) => x !== row || rand() < 0.5));
    dev.settings.set(id, v);
    if (id === 'belugaMode') dev.belugaMode = v;
  }

  return (async () => {
    for (let step = 0; step < opts.steps; step++) {
      const dev = pick(devices);
      const r = rand();
      if (r < 0.34) localOp(dev);
      else if (r < 0.37) settingsOp(dev);
      else if (r < 0.52) startRound(dev);
      else if (r < 0.97) {
        if (queue.length) {
          const call = queue.splice(Math.floor(rand() * queue.length), 1)[0];
          const f = rand();
          await deliver(call, !faults.on || f < 0.72 ? 'ok' : f < 0.81 ? 'drop' : f < 0.90 ? 'lose' : 'twice');
        }
      } else {
        dev.offline = !dev.offline;
        if (dev.offline) reach.offline += 1;
      }
      await flush();
      checkOwnConflicts();
      if (failures.length) break;
    }

    // ── heal: no faults, everyone online, no local work; settle and sync until quiet
    faults.on = false;
    for (const d of devices) d.offline = false;
    async function drain() {
      for (let guard = 0; guard < 100000; guard++) {
        await flush();
        if (!queue.length) {
          if (devices.every((d) => !d.running)) return;
          continue;
        }
        await deliver(queue.shift(), 'ok');
      }
      throw new Error('drain did not finish');
    }
    await drain();
    let quiet = false;
    for (let pass = 0; pass < 40 && !failures.length; pass++) {
      for (const d of devices) for (const [pid, fid] of conflictsOf(d)) keepBoth(d, pid, fid);
      let moved = false;
      for (const d of devices) {
        startRound(d);
        await drain();
        if (!d.last) { moved = true; continue; }
        for (const r of Object.values(d.last.projects)) {
          if (!['clean', 'absent'].includes(r.status)) moved = true;
        }
        if (!['clean', 'off'].includes(d.last.settings.status)) moved = true;
      }
      if (!moved && devices.every((d) => !conflictsOf(d).length)) {
        quiet = true;
        break;
      }
    }
    for (const d of devices) for (const n of d.notices) if (n.kind in reach) reach[n.kind] += 1;
    reach.deletedKnowingly += knowinglyDeleted.size;
    return { server, devices, created, knowinglyDeleted, failures, quiet, log };
  })();
}

function check(seed, run) {
  const tag = `seed ${seed}`;
  expect(!run.failures.length, `${tag}: no pass reports an error: ${run.failures.slice(0, 3).join(' | ')}`);
  expect(run.quiet, `${tag}: the devices settle`);
  const states = run.devices.map((d) => JSON.stringify(accountState(d)));
  expect(states.every((s) => s === states[0]), `${tag}: every device holds the same projects\n${states.join('\n')}`);

  // …and the server holds the same.
  const mine = accountState(run.devices[0]);
  const live = run.server.projectIds().filter((pid) => {
    const h = run.server.history(pid);
    return !h.versions[h.versions.length - 1].deleted;
  });
  expect(JSON.stringify(live) === JSON.stringify(Object.keys(mine).sort()), `${tag}: the devices hold exactly the server's live projects`);
  for (const pid of live) {
    const h = run.server.history(pid);
    h.versions.forEach((v, i) => {
      expect(v.version === i + 1 && v.base === i, `${tag}: ${pid} history is a line (version ${v.version} over ${v.base})`);
    });
    const top = h.versions[h.versions.length - 1].manifest;
    const onServer = top.files.map((f) => ({ id: f.id, path: f.path, text: run.server.text(ACCOUNT, f.hash) }));
    expect(JSON.stringify(onServer) === JSON.stringify(mine[pid].files), `${tag}: ${pid} files match the server's head`);
    expect(top.name === mine[pid].name, `${tag}: ${pid} name matches the server's head`);
  }

  // Every token survives unless someone deleted it knowingly.
  const all = Object.values(mine).flatMap((p) => p.files.map((f) => f.text)).join('\n');
  const present = new Set(all.split('\n'));
  const lost = [...run.created.keys()].filter((t) => !present.has(t) && !run.knowinglyDeleted.has(t));
  expect(!lost.length, `${tag}: no edit is lost (${lost.length} missing: ${lost.slice(0, 5).join(', ')})`);

  for (const d of run.devices) {
    expect(!d.store.keys('beljar/tombstones').length, `${tag}: ${d.name} has no tombstone left`);
    for (const pid of Object.keys(mine)) {
      const rec = d.store.get(syncKey(pid));
      expect(rec && !rec.pending, `${tag}: ${d.name} has no commit left unanswered on ${pid}`);
    }
    expect(d.settings.get('belugaMode') === d.belugaMode, `${tag}: ${d.name} keeps the belugaMode it set itself`);
    const synced = (dev) => JSON.stringify(cleanSyncedValues(dev.settings.exportBundle(0).values));
    expect(synced(d) === synced(run.devices[0]), `${tag}: ${d.name} has the synced settings (${synced(d)} vs ${synced(run.devices[0])})`);
  }
  return run.created.size;
}

const SEEDS = Number(process.env.SYNC_SIM_SEEDS || 300);
let tokens = 0;
let steps = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const opts = { devices: 2 + (seed % 3), steps: 250 + (seed % 5) * 50 };
  const run = await simulate(seed, opts);
  tokens += check(seed, run);
  steps += opts.steps;
}
// The floors: every hard path was reached at least this often.
if (SEEDS >= 60) {
  for (const k of Object.keys(reach)) expect(reach[k] >= 3, `the schedule reached ${k} (${reach[k]} times; want at least 3)`);
}
const summary = Object.entries(reach).map(([k, v]) => `${k} ${v}`).join(', ');
console.log(`OK sync simulator (${checks} checks: ${SEEDS} seeded runs, ${steps} steps, ${tokens} edits, every run converged with nothing lost; reached: ${summary})`);
