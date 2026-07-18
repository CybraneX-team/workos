import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { env } from '../src/config.js';
import { pool, supabaseAdmin } from '../src/db.js';
import { encrypt } from '../src/lib/crypto.js';
import {
  approveMetaAdsCampaignLaunch,
  approveMetaAdsCampaignPublish,
  cancelMetaAdsCampaignDraft,
  claimOneMetaAdsCampaignJob,
  cloneMetaAdsCampaignDraft,
  createMetaAdsCampaignDraft,
  enqueueMetaAdsCreativeGeneration,
  getMetaAdsAuthoringReadiness,
  getMetaAdsCampaignDraft,
  getMetaAdsCampaignJob,
  getMetaAdsCreativeGenerationJob,
  metaAdsDraftSnapshotHash,
  MetaAdsAuthoringError,
  patchMetaAdsCampaignDraft,
  pauseMetaAdsCampaign,
  preflightMetaAdsCampaign,
  processOneMetaAdsCampaignJob,
  processOneMetaAdsCreativeJob,
  putMetaAdsBrandKit,
  submitMetaAdsCampaignDraft,
} from '../src/domains/meta-ads/authoring.js';

const dbDescribe = process.env.META_ADS_AUTHORING_DB_TESTS === '1' ? describe : describe.skip;

dbDescribe('Meta Ads Campaign Studio database lifecycle', { concurrency: 1 }, () => {
  const suffix = randomUUID().slice(0, 8);
  const accountId = `act_workos_authoring_${suffix}`;
  const userEmail = `campaign-studio+${suffix}@example.com`;
  const userPassword = `Campaign-${suffix}-safe-123!`;
  let companyId = '';
  let userId = '';

  before(async () => {
    assert.equal(process.env.META_AUTHORING_MODE, 'sandbox_only');
    assert.equal(process.env.META_AUTHORING_FAKE_META, 'true');
    assert.equal(process.env.META_AUTHORING_FAKE_GEMINI, 'true');
    assert.equal(process.env.META_AUTHORING_LAUNCH_ENABLED, 'true');
    const company = await pool.query(
      `INSERT INTO public.companies
        (name,slug,stage,country,description,status,is_public,offset_3d)
       VALUES ($1,$2,'Seed','India','Disposable Campaign Studio DB test','active',FALSE,'{"x":0,"y":0,"z":0}'::jsonb)
       RETURNING id`,
      [`Campaign Studio ${suffix}`, `campaign-studio-${suffix}`],
    );
    companyId = String(company.rows[0].id);
    const auth = await supabaseAdmin.auth.admin.createUser({
      email: userEmail,
      password: userPassword,
      email_confirm: true,
      user_metadata: { first_name: 'Campaign', last_name: 'Approver' },
    });
    if (auth.error || !auth.data.user) throw new Error(`failed_to_create_authoring_user:${auth.error?.message ?? 'missing_user'}`);
    userId = auth.data.user.id;
    await pool.query(
      `INSERT INTO public.user_profiles (id,company_id,role,first_name,last_name,onboarding_completed)
       VALUES ($1,$2,'founder','Campaign','Approver',TRUE)
       ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id,role=EXCLUDED.role,
         first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,onboarding_completed=TRUE`,
      [userId, companyId],
    );
    await pool.query(
      `INSERT INTO public.company_members (company_id,user_id,role,status,approved_at)
       VALUES ($1,$2,'founder','active',NOW())`,
      [companyId, userId],
    );
    await pool.query(
      `INSERT INTO public.integration_connections
        (company_id,integration_id,account_name,sandbox_mode,access_token_enc,token_expires_at,metadata,connected_at)
       VALUES ($1,'int-meta',$2,TRUE,$3,NOW()+INTERVAL '30 days',$4::jsonb,NOW())`,
      [companyId, `Meta Ads · ${accountId}`, encrypt('fake-authoring-token'), JSON.stringify({
        ad_account_id: accountId,
        currency: 'USD',
        timezone: 'UTC',
      })],
    );
  });

  after(async () => {
    if (companyId) {
      const assets = await pool.query(
        `SELECT storage_path FROM public.meta_ads_creative_assets WHERE company_id=$1`,
        [companyId],
      );
      const paths = assets.rows.map((row) => String(row.storage_path));
      if (paths.length) await supabaseAdmin.storage.from('meta-ads-creatives').remove(paths);
      await pool.query(`DELETE FROM public.companies WHERE id=$1`, [companyId]);
    }
    if (userId) await supabaseAdmin.auth.admin.deleteUser(userId);
    await pool.end();
  });

  test('generates, preflights, publishes paused, launches, pauses, and retains an idempotent audit trail', async () => {
    const readiness = await getMetaAdsAuthoringReadiness(companyId);
    assert.equal(readiness.permitted, true);
    assert.equal(readiness.accountId, accountId);
    assert.deepEqual(readiness.pages.map((page) => page.pageId), ['page_workos_fixture']);

    await putMetaAdsBrandKit(companyId, userId, {
      businessName: 'Campaign Studio Fixture',
      brandVoice: 'Clear, useful, and specific.',
      valueProposition: 'Plan paid acquisition changes with evidence and control.',
      targetAudience: 'Small business operators improving paid acquisition.',
      primaryColor: '#2457ff',
      secondaryColor: '#0b1020',
      logoAssetId: null,
      requiredPhrases: [],
      prohibitedPhrases: ['guaranteed results'],
    });

    let draft = await createMetaAdsCampaignDraft({ companyId, userId, name: 'Website traffic fixture' });
    const startTime = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const endTime = new Date(Date.now() + 8 * 24 * 60 * 60_000).toISOString();
    draft = await patchMetaAdsCampaignDraft({
      companyId,
      userId,
      draftId: draft.id,
      expectedVersion: draft.version,
      patch: {
        brief: {
          goal: 'Send qualified operators to the product page',
          offer: 'A controlled paid-acquisition workspace',
          proofPoints: ['Human approval before publication', 'Paused-first publishing'],
          targetCustomer: 'Small business operators',
          landingPageUrl: 'https://example.com/paid-acquisition',
          callToAction: 'LEARN_MORE',
          regulatedCategory: 'none',
        },
        identity: {
          pageId: 'page_workos_fixture',
          pageName: 'WorkOS Fixture Page',
          instagramActorId: 'ig_workos_fixture',
          instagramUsername: 'workos_fixture',
        },
        audience: { countries: ['US'], ageMin: 21, ageMax: 65, languageIds: [1001] },
        lifetimeBudgetMinor: 5_000,
        startTime,
        endTime,
      },
    });

    const generationKey = `generate-${suffix}`;
    const generation = await enqueueMetaAdsCreativeGeneration({
      companyId,
      userId,
      draftId: draft.id,
      expectedVersion: draft.version,
      idempotencyKey: generationKey,
    });
    const generationReplay = await enqueueMetaAdsCreativeGeneration({
      companyId,
      userId,
      draftId: draft.id,
      expectedVersion: draft.version,
      idempotencyKey: generationKey,
    });
    assert.equal(generationReplay.id, generation.id);
    assert.equal(await processOneMetaAdsCreativeJob(companyId), true);
    const completedGeneration = await getMetaAdsCreativeGenerationJob(companyId, generation.id);
    assert.equal(completedGeneration.status, 'complete');
    assert.equal(completedGeneration.concepts.length, 3);

    draft = await getMetaAdsCampaignDraft(companyId, draft.id);
    assert.equal(draft.content.concepts.length, 3);
    for (const concept of draft.content.concepts) {
      assert.deepEqual(Object.keys(concept.assetIds).sort(), ['1:1', '4:5', '9:16']);
    }
    const concept = draft.content.concepts[0];
    draft = await patchMetaAdsCampaignDraft({
      companyId,
      userId,
      draftId: draft.id,
      expectedVersion: draft.version,
      patch: {
        ads: [{
          id: randomUUID(),
          conceptId: concept.id,
          name: 'Control creative',
          assetId: concept.assetIds['1:1'],
          primaryText: concept.primaryText,
          headline: concept.headline,
          description: concept.description,
          callToAction: concept.callToAction,
        }],
      },
    });

    const firstPreflight = await preflightMetaAdsCampaign(companyId, draft.id);
    const secondPreflight = await preflightMetaAdsCampaign(companyId, draft.id);
    assert.equal(firstPreflight.ready, true);
    assert.equal(secondPreflight.snapshotHash, firstPreflight.snapshotHash);
    assert.deepEqual(secondPreflight.issues.map((item) => item.code), firstPreflight.issues.map((item) => item.code));

    draft = await submitMetaAdsCampaignDraft({ companyId, userId, draftId: draft.id, expectedVersion: draft.version });
    assert.equal(draft.status, 'submitted');

    const publishKey = `publish-${suffix}`;
    const [publish, publishReplay] = await Promise.all([
      approveMetaAdsCampaignPublish({ companyId, userId, draftId: draft.id, note: 'Reviewed identity, copy, budget, dates, and destination.', idempotencyKey: publishKey }),
      approveMetaAdsCampaignPublish({ companyId, userId, draftId: draft.id, note: 'Reviewed identity, copy, budget, dates, and destination.', idempotencyKey: publishKey }),
    ]);
    assert.equal(publishReplay.job.id, publish.job.id);
    assert.equal(await processOneMetaAdsCampaignJob(companyId), true);
    let publishedJob = await getMetaAdsCampaignJob(companyId, publish.job.id);
    assert.equal(publishedJob.status, 'complete');
    assert.ok(publishedJob.steps.length >= 5);
    assert.ok(publishedJob.steps.every((step) => step.status === 'complete'));

    draft = await getMetaAdsCampaignDraft(companyId, draft.id);
    assert.equal(draft.status, 'published_paused');
    assert.ok(draft.metaObjects.campaignId);
    assert.ok(draft.metaObjects.adsetId);
    assert.equal(draft.metaObjects.adIds.length, 1);
    assert.equal(draft.metaObjects.creativeIds.length, 1);

    const launchKey = `launch-${suffix}`;
    const [launch, launchReplay] = await Promise.all([
      approveMetaAdsCampaignLaunch({ companyId, userId, draftId: draft.id, note: 'Approved the paused Meta objects for launch.', idempotencyKey: launchKey }),
      approveMetaAdsCampaignLaunch({ companyId, userId, draftId: draft.id, note: 'Approved the paused Meta objects for launch.', idempotencyKey: launchKey }),
    ]);
    assert.equal(launchReplay.job.id, launch.job.id);
    assert.equal(await processOneMetaAdsCampaignJob(companyId), true);
    draft = await getMetaAdsCampaignDraft(companyId, draft.id);
    assert.equal(draft.status, 'scheduled');

    const pauseKey = `pause-${suffix}`;
    const [pause, pauseReplay] = await Promise.all([
      pauseMetaAdsCampaign({ companyId, userId, draftId: draft.id, idempotencyKey: pauseKey }),
      pauseMetaAdsCampaign({ companyId, userId, draftId: draft.id, idempotencyKey: pauseKey }),
    ]);
    assert.ok(pause.job);
    assert.equal(pauseReplay.job?.id, pause.job?.id);
    assert.equal(await processOneMetaAdsCampaignJob(companyId), true);
    draft = await getMetaAdsCampaignDraft(companyId, draft.id);
    assert.equal(draft.status, 'paused');

    const cloned = await cloneMetaAdsCampaignDraft({ companyId, userId, draftId: draft.id });
    assert.equal(cloned.status, 'draft');
    assert.equal(cloned.accountId, accountId);
    assert.match(cloned.content.name, /\(copy\)$/);
    assert.equal(cloned.metaObjects.campaignId, null);

    const counts = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM public.meta_ads_campaign_approvals WHERE draft_id=$1) AS approvals,
         (SELECT count(*)::int FROM public.meta_ads_campaign_jobs WHERE draft_id=$1) AS jobs,
         (SELECT count(*)::int FROM public.meta_ads_campaign_events WHERE draft_id=$1 AND event_type='publish_approved') AS publish_events,
         (SELECT count(*)::int FROM public.meta_ads_campaign_events WHERE draft_id=$1 AND event_type='launch_approved') AS launch_events`,
      [draft.id],
    );
    assert.deepEqual(counts.rows[0], { approvals: 2, jobs: 3, publish_events: 1, launch_events: 1 });
    assert.doesNotMatch(JSON.stringify(draft), /fake-authoring-token|access_token|appsecret_proof/i);
  });

  test('rejects stale edits, cross-tenant reads, and conflicting idempotency-key reuse', async () => {
    const draft = await createMetaAdsCampaignDraft({ companyId, userId, name: 'Conflict fixture' });
    await assert.rejects(
      patchMetaAdsCampaignDraft({ companyId, userId, draftId: draft.id, expectedVersion: draft.version + 1, patch: { name: 'Stale' } }),
      (error: unknown) => error instanceof MetaAdsAuthoringError && error.status === 409,
    );
    await assert.rejects(
      getMetaAdsCampaignDraft(randomUUID(), draft.id),
      (error: unknown) => error instanceof MetaAdsAuthoringError && error.status === 404,
    );
  });

  test('blocks cancellation during active work and serializes jobs for one draft', async () => {
    const draft = await createMetaAdsCampaignDraft({ companyId, userId, name: 'Concurrency fixture' });
    for (const status of ['generating', 'publishing', 'launching']) {
      await pool.query(`UPDATE public.meta_ads_campaign_drafts SET status=$2 WHERE id=$1`, [draft.id, status]);
      await assert.rejects(
        cancelMetaAdsCampaignDraft({
          companyId,
          userId,
          draftId: draft.id,
          reason: 'requirements_changed',
          idempotencyKey: `cancel-${status}-${suffix}`,
        }),
        (error: unknown) => error instanceof MetaAdsAuthoringError
          && error.status === 409
          && error.message === 'campaign_job_in_progress',
      );
    }

    await pool.query(`UPDATE public.meta_ads_campaign_drafts SET status='publish_approved' WHERE id=$1`, [draft.id]);
    const firstJobId = randomUUID();
    const secondJobId = randomUUID();
    await pool.query(
      `INSERT INTO public.meta_ads_campaign_jobs
        (id,company_id,ad_account_id,draft_id,version,job_kind,status,snapshot_hash,idempotency_key,requested_by,locked_at,locked_until,locked_by,requested_at)
       VALUES
        ($1,$3,$4,$5,1,'publish_paused','running',$6,$7,$8,NOW(),NOW()+INTERVAL '5 minutes','other-worker',NOW()-INTERVAL '1 minute'),
        ($2,$3,$4,$5,1,'pause','pending',$6,$9,$8,NULL,NULL,NULL,NOW())`,
      [firstJobId, secondJobId, companyId, accountId, draft.id, metaAdsDraftSnapshotHash(draft.content),
        `serialize-first-${suffix}`, userId, `serialize-second-${suffix}`],
    );
    assert.equal(await claimOneMetaAdsCampaignJob(companyId), null);

    await pool.query(`UPDATE public.meta_ads_campaign_jobs SET locked_until=NOW()-INTERVAL '1 second' WHERE id=$1`, [firstJobId]);
    const claimed = await claimOneMetaAdsCampaignJob(companyId);
    assert.equal(String(claimed?.id), firstJobId);
    await pool.query(`UPDATE public.meta_ads_campaign_jobs SET status='failed',locked_at=NULL,locked_until=NULL,locked_by=NULL WHERE id IN ($1,$2)`, [firstJobId, secondJobId]);
  });

  test('aligns direct Supabase reads with paid_media read permission', async () => {
    const browserClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await browserClient.auth.signInWithPassword({ email: userEmail, password: userPassword });
    assert.equal(signedIn.error, null);
    const permitted = await browserClient.from('meta_ads_campaign_drafts').select('id').eq('company_id', companyId);
    assert.equal(permitted.error, null);
    assert.ok((permitted.data?.length ?? 0) > 0);

    const customRoleId = `custom_campaign_studio_${suffix}`;
    try {
      await pool.query(
        `INSERT INTO public.roles (id,name,description,permissions,company_id,is_system,is_archived,base_role_id,created_by,updated_by)
         VALUES ($1,'No paid media','Campaign Studio RLS fixture',$2::jsonb,$3,FALSE,FALSE,'viewer',$4,$4)`,
        [customRoleId, JSON.stringify({ paid_media: { read: false, write: false, delete: false, approve: false, execute: false } }), companyId, userId],
      );
      await pool.query(`UPDATE public.company_members SET role=$3 WHERE company_id=$1 AND user_id=$2`, [companyId, userId, customRoleId]);
      await pool.query(`UPDATE public.user_profiles SET role=$2 WHERE id=$1`, [userId, customRoleId]);

      const denied = await browserClient.from('meta_ads_campaign_drafts').select('id').eq('company_id', companyId);
      assert.equal(denied.error, null);
      assert.deepEqual(denied.data, []);
    } finally {
      await pool.query(`UPDATE public.company_members SET role='founder' WHERE company_id=$1 AND user_id=$2`, [companyId, userId]);
      await pool.query(`UPDATE public.user_profiles SET role='founder' WHERE id=$1`, [userId]);
      await pool.query(`DELETE FROM public.roles WHERE id=$1`, [customRoleId]);
      await browserClient.auth.signOut();
    }
  });
});
