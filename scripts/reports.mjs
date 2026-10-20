import pg from 'pg';
import { randomUUID } from 'node:crypto';
try { process.loadEnvFile('.env.local'); } catch {}
const args = process.argv.slice(2);
const value = (key) => { const i = args.indexOf(key); return i < 0 ? undefined : args[i + 1]; };
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const id = value('--id');
  if (!id) {
    const { rows } = await client.query('SELECT r.id,r."targetType",r."targetId",r.reason,r."createdAt",(SELECT a.action FROM report_action a WHERE a."reportId"=r.id ORDER BY a."createdAt" DESC LIMIT 1) AS "lastAction" FROM report r ORDER BY r."createdAt" DESC LIMIT 100');
    console.table(rows);
  } else {
    const action = value('--action'), reason = value('--reason'), operator = value('--operator');
    if (!['pause-listing','close-wanted','keep'].includes(action) || !reason?.trim() || !operator?.trim()) throw new Error('操作・理由・担当者が必要です（--action pause-listing|close-wanted|keep --reason 理由 --operator 担当者）。');
    await client.query('BEGIN');
    const { rows: [report] } = await client.query('SELECT * FROM report WHERE id=$1 FOR UPDATE',[id]);
    if (!report) throw new Error('通報が見つかりません。');
    let previous = null, next = null;
    if (action !== 'keep') {
      if ((action === 'pause-listing') !== (report.targetType === 'listing')) throw new Error('対象と操作が一致しません。');
      const table = action === 'pause-listing' ? 'listing' : 'wanted_post';
      const {rows:[target]} = await client.query(`SELECT status FROM "${table}" WHERE id=$1 FOR UPDATE`,[report.targetId]);
      if (!target) throw new Error('対象が見つかりません。');
      previous = target.status; next = action === 'pause-listing' ? 'paused' : 'closed';
      if (previous !== 'open') throw new Error('公開中の対象にだけ実行できます。');
      if (args.includes('--yes')) await client.query(`UPDATE "${table}" SET status=$1 WHERE id=$2`,[next,report.targetId]);
    }
    console.log({id,action,operator,reason,previous,next});
    if (args.includes('--yes')) {
      await client.query('INSERT INTO report_action (id,"reportId",operator,action,reason,"previousStatus","nextStatus") VALUES ($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),id,operator,action,reason,previous,next]);
      await client.query('COMMIT'); console.log('対応と記録を保存しました。');
    } else { await client.query('ROLLBACK'); console.log('確認のみです。保存する場合は --yes を付けてください。'); }
  }
} catch (error) {
  await client.query('ROLLBACK').catch(()=>{});
  console.error(error.message?.includes('通報') || error.message?.includes('対象') || error.message?.includes('操作') || error.message?.includes('公開中') ? error.message : '処理できませんでした。DBの接続設定と変更の反映を確認してください。');
  process.exitCode=1;
} finally { await client.end(); }
