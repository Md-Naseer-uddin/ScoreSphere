import {
  hasRole,
  type Rule,
  type Ruleset,
  rulesSchema,
  type SportKey,
} from '@scoresphere/contracts';
import { validateRules } from '@scoresphere/engine-kit';
import { getSport, latestEngine } from '@scoresphere/sports';
import { useMutation } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { db } from '@/lib/db';
import { sportUi } from '@/sports/registry';
import type { SportSetup } from '@/sports/types';
import { defaultAction, RuleCard } from './RuleCard';
import { RulePreviewCard } from './RulePreviewCard';
import { ruleSports } from './RulesetsPage';
import { archiveRuleset, createRuleset, saveRulesetVersion } from './rulesets-api';

const MAX_RULES = 30;

/** Rule IDs stay stable across versions; a new rule takes the next free number. */
function nextRuleId(rules: Rule[]): string {
  const used = rules.map((r) => Number(/^rule-(\d+)$/.exec(r.id)?.[1] ?? 0));
  return `rule-${Math.max(0, ...used) + 1}`;
}

/**
 * The rules builder (plan M8): settings from a preset, then rules made only from what the
 * sport's engine declares, with a live check and a preview. Saving makes a new version.
 */
export function RulesetEditorPage() {
  const { t } = useTranslation();
  const { rulesetId } = useParams();
  const [params] = useSearchParams();
  // A new ruleset can start as a copy of another one ("duplicate").
  const id = rulesetId ?? params.get('from');
  const loaded = useLiveQuery(
    async () => (id ? ((await db.rulesets.get(id)) ?? null) : null),
    [id],
  );
  if (id && loaded === undefined) return <Skeleton className="h-40 w-full" />;
  if (id && !loaded) {
    return <p className="py-10 text-center text-muted-foreground">{t('rulesets.notFound')}</p>;
  }
  const existing = rulesetId ? (loaded ?? null) : null;
  const source = loaded ?? null;
  return (
    <RulesetForm
      key={`${rulesetId ?? 'new'}:${source?.id ?? ''}`}
      existing={existing}
      source={source}
    />
  );
}

/**
 * Editing starts from the latest version; a copy from the ruleset it duplicates; a new
 * ruleset from the sport's default settings.
 */
function RulesetForm({ existing, source }: { existing: Ruleset | null; source: Ruleset | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const workspace = useCurrentWorkspace();

  const initialSport = source?.sport ?? (params.get('sport') as SportKey | null);
  const [sport, setSport] = useState<SportKey | null>(
    initialSport && ruleSports.includes(initialSport) ? initialSport : null,
  );
  const [name, setName] = useState(() =>
    existing ? existing.name : source ? t('rulesets.copyName', { name: source.name }) : '',
  );
  const [setup, setSetup] = useState<SportSetup | null>(() => {
    if (source) {
      const preset = latestEngine(source.sport)?.presets.find(
        (p) => p.key === source.latest.basePresetKey,
      );
      return {
        presetKey: source.latest.basePresetKey,
        presetVersion: preset?.version ?? 1,
        config: source.latest.config,
      };
    }
    return sport ? (sportUi(sport)?.defaultSetup() ?? null) : null;
  });
  const [rules, setRules] = useState<Rule[]>(source?.latest.rules ?? []);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const ui = sport ? sportUi(sport) : undefined;
  const catalogue = sport ? latestEngine(sport)?.ruleCatalogue : undefined;
  const problems = useMemo(
    () => (catalogue ? validateRules(catalogue, rules) : []),
    [catalogue, rules],
  );
  const shapeOk = rulesSchema.safeParse(rules).success;
  const canEdit = workspace ? hasRole(workspace.role, 'SCORER') : false;
  const canArchive = workspace ? hasRole(workspace.role, 'ADMIN') : false;
  const ready = Boolean(sport && setup && name.trim() && shapeOk && problems.length === 0);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        basePresetKey: setup!.presetKey,
        config: setup!.config,
        rules,
      };
      return existing
        ? saveRulesetVersion(workspace!.id, existing.id, body)
        : createRuleset(workspace!.id, { ...body, sport: sport! });
    },
    onSuccess: (saved) => {
      toast.success(t('rulesets.saved', { version: saved.latest.version }));
      navigate('/app/rulesets', { replace: true });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('errors.generic')),
  });
  const archive = useMutation({
    mutationFn: () => archiveRuleset(workspace!.id, existing!.id),
    onSuccess: () => navigate('/app/rulesets', { replace: true }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t('errors.generic')),
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link to="/app/rulesets">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">
          {existing ? t('rulesets.edit') : t('rulesets.new')}
        </h1>
      </div>

      {!source && (
        <ChoiceGroup
          label={t('matches.new.sport')}
          value={sport}
          onChange={(key) => {
            setSport(key);
            setSetup(sportUi(key)?.defaultSetup() ?? null);
            setRules([]);
          }}
          choices={ruleSports.map((key) => ({ value: key, label: getSport(key).name }))}
        />
      )}

      {sport && ui && catalogue && (
        <>
          <div className="space-y-1">
            <Label htmlFor="ruleset-name">{t('rulesets.name')}</Label>
            <Input
              id="ruleset-name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {existing && (
              <p className="text-xs text-muted-foreground">
                {t('rulesets.newVersionHint', { version: existing.latest.version + 1 })}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="font-medium">{t('rulesets.settings')}</h2>
            <ui.Setup value={setup} onChange={setSetup} />
          </div>

          <div className="space-y-3">
            <h2 className="font-medium">{t('rulesets.rules')}</h2>
            {rules.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('rulesets.noRules')}</p>
            )}
            {rules.map((rule, i) => (
              <RuleCard
                key={rule.id}
                rule={rule}
                index={i}
                catalogue={catalogue}
                problems={problems.filter((p) => p.ruleId === rule.id)}
                onChange={(next) => setRules((all) => all.map((r, j) => (j === i ? next : r)))}
                onRemove={() => setRules((all) => all.filter((_, j) => j !== i))}
              />
            ))}
            <Button
              variant="outline"
              disabled={rules.length >= MAX_RULES}
              onClick={() =>
                setRules((all) => [
                  ...all,
                  {
                    id: nextRuleId(all),
                    name: '',
                    priority: 0,
                    trigger: catalogue.triggers[0]!.fact,
                    conditions: [],
                    actions: [defaultAction(catalogue)],
                  },
                ])
              }
            >
              <Plus aria-hidden /> {t('rulesets.addRule')}
            </Button>
          </div>

          {setup && problems.length === 0 && shapeOk && (
            <RulePreviewCard sport={sport} config={setup.config} rules={rules} />
          )}

          {!shapeOk && <p className="text-sm text-destructive">{t('rulesets.nameEveryRule')}</p>}
          {canEdit ? (
            <Button
              className="w-full"
              size="lg"
              disabled={!ready || !workspace || save.isPending}
              onClick={() => save.mutate()}
            >
              {existing ? t('rulesets.saveVersion') : t('rulesets.save')}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">{t('rulesets.readOnly')}</p>
          )}
          {existing && canEdit && (
            <Button asChild variant="outline" className="w-full">
              <Link to={`/app/rulesets/new?from=${existing.id}`}>{t('rulesets.duplicate')}</Link>
            </Button>
          )}
          {existing && canArchive && (
            <Button
              variant="ghost"
              className="w-full text-destructive"
              disabled={archive.isPending}
              onClick={() => (confirmArchive ? archive.mutate() : setConfirmArchive(true))}
            >
              {confirmArchive ? t('rulesets.archiveConfirm') : t('rulesets.archive')}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
