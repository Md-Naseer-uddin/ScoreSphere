import type { Rule, RuleCondition, RuleOperator, RuleValue } from '@scoresphere/contracts';
import type { RuleCatalogue, RuleField, RuleProblem } from '@scoresphere/engine-kit';
import { Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const selectClass =
  'h-10 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50';

const MAX_CONDITIONS = 8;
const MAX_ACTIONS = 3;

/** A valid starting value for a field: its first option, its minimum, or true. */
export function defaultValue(field: RuleField): RuleValue {
  if (field.options?.length) return field.options[0]!;
  if (field.type === 'number') return field.min ?? 0;
  if (field.type === 'boolean') return true;
  return '';
}

function operatorsFor(field: RuleField): RuleOperator[] {
  if (field.type === 'boolean') return ['eq', 'neq'];
  const ordered: RuleOperator[] = field.type === 'number' ? ['gt', 'gte', 'lt', 'lte'] : [];
  return ['eq', 'neq', ...ordered, ...(field.options ? (['in'] as const) : [])];
}

/** The rule's first command, with every setting at its default. */
export function defaultAction(catalogue: RuleCatalogue): Rule['actions'][number] {
  const command = catalogue.commands[0]!;
  return {
    command: command.type,
    params: Object.fromEntries(command.params.map((p) => [p.key, defaultValue(p)])),
  };
}

function optionLabel(field: RuleField, value: RuleValue): string {
  const i = field.options?.indexOf(value as string | number) ?? -1;
  return i >= 0 && field.optionLabels ? field.optionLabels[i]! : String(value).replaceAll('_', ' ');
}

/** An input that only offers values the field allows (spec: invalid combinations blocked). */
function ValueInput({
  field,
  op,
  value,
  onChange,
  label,
}: {
  field: RuleField;
  op: RuleOperator;
  value: RuleCondition['value'];
  onChange: (value: RuleCondition['value']) => void;
  label: string;
}) {
  const { t } = useTranslation();
  if (op === 'in' && field.options) {
    const chosen = Array.isArray(value) ? value : [value];
    return (
      <fieldset className="flex flex-wrap gap-x-3 gap-y-1" aria-label={label}>
        {field.options.map((option) => (
          <label key={String(option)} className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={chosen.includes(option)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...chosen, option]
                  : chosen.filter((x) => x !== option);
                if (next.length) onChange(next);
              }}
            />
            {optionLabel(field, option)}
          </label>
        ))}
      </fieldset>
    );
  }
  const single = Array.isArray(value) ? value[0]! : value;
  if (field.options) {
    return (
      <select
        aria-label={label}
        className={selectClass}
        value={String(single)}
        onChange={(e) => {
          const picked = field.options!.find((o) => String(o) === e.target.value)!;
          onChange(picked);
        }}
      >
        {field.options.map((option) => (
          <option key={String(option)} value={String(option)}>
            {optionLabel(field, option)}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'boolean') {
    return (
      <select
        aria-label={label}
        className={selectClass}
        value={String(single)}
        onChange={(e) => onChange(e.target.value === 'true')}
      >
        <option value="true">{t('rulesets.yes')}</option>
        <option value="false">{t('rulesets.no')}</option>
      </select>
    );
  }
  if (field.type === 'number') {
    return (
      <Input
        aria-label={label}
        type="number"
        inputMode="numeric"
        min={field.min}
        max={field.max}
        value={String(single)}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      />
    );
  }
  return (
    <Input
      aria-label={label}
      maxLength={60}
      value={String(single)}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function RuleCard({
  rule,
  index,
  catalogue,
  problems,
  onChange,
  onRemove,
}: {
  rule: Rule;
  index: number;
  catalogue: RuleCatalogue;
  problems: RuleProblem[];
  onChange: (rule: Rule) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const uid = useId();
  const trigger = catalogue.triggers.find((x) => x.fact === rule.trigger);
  const fieldOf = (c: Pick<RuleCondition, 'source' | 'key'>) =>
    (c.source === 'fact' ? (trigger?.fields ?? []) : catalogue.variables).find(
      (f) => f.key === c.key,
    );
  const choices = [
    ...(trigger?.fields ?? []).map((f) => ({
      value: `fact:${f.key}`,
      label: f.label,
      group: 'fact',
    })),
    ...catalogue.variables.map((f) => ({
      value: `state:${f.key}`,
      label: f.label,
      group: 'state',
    })),
  ];
  const setCondition = (i: number, next: RuleCondition) =>
    onChange({ ...rule, conditions: rule.conditions.map((c, j) => (j === i ? next : c)) });
  const setAction = (i: number, next: Rule['actions'][number]) =>
    onChange({ ...rule, actions: rule.actions.map((a, j) => (j === i ? next : a)) });
  const number = index + 1;

  return (
    <fieldset
      className="space-y-4 rounded-xl border p-4"
      aria-label={t('rulesets.ruleN', { n: number })}
    >
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor={`${uid}-name`}>{t('rulesets.ruleName', { n: number })}</Label>
          <Input
            id={`${uid}-name`}
            maxLength={80}
            value={rule.name}
            onChange={(e) => onChange({ ...rule, name: e.target.value })}
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('rulesets.removeRule', { n: number })}
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${uid}-trigger`}>{t('rulesets.when')}</Label>
        <select
          id={`${uid}-trigger`}
          className={selectClass}
          value={rule.trigger}
          onChange={(e) =>
            // Event fields belong to the old trigger, so only match conditions carry over.
            onChange({
              ...rule,
              trigger: e.target.value,
              conditions: rule.conditions.filter((c) => c.source === 'state'),
            })
          }
        >
          {catalogue.triggers.map((x) => (
            <option key={x.fact} value={x.fact}>
              {x.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('rulesets.conditions')}</p>
        {rule.conditions.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('rulesets.always')}</p>
        )}
        {rule.conditions.map((c, i) => {
          const field = fieldOf(c);
          const label = t('rulesets.conditionN', { n: i + 1 });
          return (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg bg-muted/40 p-2">
              <div className="space-y-2">
                <select
                  aria-label={`${label}: ${t('rulesets.value')}`}
                  className={selectClass}
                  value={`${c.source}:${c.key}`}
                  onChange={(e) => {
                    const [source, key] = e.target.value.split(':') as ['fact' | 'state', string];
                    const next = fieldOf({ source, key })!;
                    setCondition(i, { source, key, op: 'eq', value: defaultValue(next) });
                  }}
                >
                  {(['fact', 'state'] as const).map((group) => (
                    <optgroup key={group} label={t(`rulesets.source.${group}`)}>
                      {choices
                        .filter((x) => x.group === group)
                        .map((x) => (
                          <option key={x.value} value={x.value}>
                            {x.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                {field && (
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      aria-label={`${label}: ${t('rulesets.comparison')}`}
                      className={selectClass}
                      value={c.op}
                      onChange={(e) => {
                        const op = e.target.value as RuleOperator;
                        const single = Array.isArray(c.value) ? c.value[0]! : c.value;
                        setCondition(i, { ...c, op, value: op === 'in' ? [single] : single });
                      }}
                    >
                      {operatorsFor(field).map((op) => (
                        <option key={op} value={op}>
                          {t(`rulesets.op.${op}`)}
                        </option>
                      ))}
                    </select>
                    <ValueInput
                      field={field}
                      op={c.op}
                      value={c.value}
                      label={`${label}: ${field.label}`}
                      onChange={(value) => setCondition(i, { ...c, value })}
                    />
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('rulesets.removeCondition', { n: i + 1 })}
                onClick={() =>
                  onChange({ ...rule, conditions: rule.conditions.filter((_, j) => j !== i) })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          );
        })}
        <Button
          variant="outline"
          size="sm"
          disabled={rule.conditions.length >= MAX_CONDITIONS || choices.length === 0}
          onClick={() => {
            const first = choices[0]!;
            const [source, key] = first.value.split(':') as ['fact' | 'state', string];
            const field = fieldOf({ source, key })!;
            onChange({
              ...rule,
              conditions: [
                ...rule.conditions,
                { source, key, op: 'eq', value: defaultValue(field) },
              ],
            });
          }}
        >
          <Plus aria-hidden /> {t('rulesets.addCondition')}
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('rulesets.then')}</p>
        {rule.actions.map((a, i) => {
          const command = catalogue.commands.find((x) => x.type === a.command);
          const label = t('rulesets.actionN', { n: i + 1 });
          return (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg bg-muted/40 p-2">
              <div className="space-y-2">
                <select
                  aria-label={label}
                  className={selectClass}
                  value={a.command}
                  onChange={(e) => {
                    const next = catalogue.commands.find((x) => x.type === e.target.value)!;
                    setAction(i, {
                      command: next.type,
                      params: Object.fromEntries(next.params.map((p) => [p.key, defaultValue(p)])),
                    });
                  }}
                >
                  {catalogue.commands.map((x) => (
                    <option key={x.type} value={x.type}>
                      {x.label}
                    </option>
                  ))}
                </select>
                {command?.params.map((param) => (
                  <div key={param.key} className="grid grid-cols-[auto_1fr] items-center gap-2">
                    <span className="text-sm text-muted-foreground">{param.label}</span>
                    <ValueInput
                      field={param}
                      op="eq"
                      value={a.params[param.key] ?? defaultValue(param)}
                      label={`${label}: ${param.label}`}
                      onChange={(value) =>
                        setAction(i, {
                          ...a,
                          params: { ...a.params, [param.key]: value as RuleValue },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('rulesets.removeAction', { n: i + 1 })}
                disabled={rule.actions.length <= 1}
                onClick={() =>
                  onChange({ ...rule, actions: rule.actions.filter((_, j) => j !== i) })
                }
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          );
        })}
        <Button
          variant="outline"
          size="sm"
          disabled={rule.actions.length >= MAX_ACTIONS}
          onClick={() =>
            onChange({ ...rule, actions: [...rule.actions, defaultAction(catalogue)] })
          }
        >
          <Plus aria-hidden /> {t('rulesets.addAction')}
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${uid}-priority`}>{t('rulesets.priority')}</Label>
        <Input
          id={`${uid}-priority`}
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          value={String(rule.priority)}
          onChange={(e) =>
            onChange({
              ...rule,
              priority: Math.max(0, Math.min(100, Math.trunc(Number(e.target.value) || 0))),
            })
          }
        />
        <p className="text-xs text-muted-foreground">{t('rulesets.priorityHint')}</p>
      </div>

      {problems.length > 0 && (
        <ul className="space-y-1 text-sm text-destructive" role="alert">
          {problems.map((p, i) => (
            <li key={i}>{p.message}</li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
