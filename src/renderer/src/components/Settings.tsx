import { useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { IconEdit, IconPlus, IconPointer, IconVolume } from '@tabler/icons-react'
import type { Result } from '@shared/api'
import type { AppState, Category, SettingsPatch, Theme } from '@shared/model'
import { errorText } from '../format'
import { BackButton, FieldError } from './EventForm'
import { HoldButton } from './HoldButton'

interface Props {
  state: AppState
  dataPath: string
  run(p: Promise<Result>): Promise<string | null>
  onBack(): void
}

const THEMES: Theme[] = ['ivory', 'clay', 'graphite']

export function Settings({ state, dataPath, run, onBack }: Props): React.JSX.Element {
  const { t } = useTranslation()
  const s = state.settings
  const [opacity, setOpacity] = useState(s.opacity)
  const [soundErr, setSoundErr] = useState<string | null>(null)
  const [snoozeText, setSnoozeText] = useState(String(s.snoozeMinutes))
  const [snoozeErr, setSnoozeErr] = useState(false)

  useEffect(() => setOpacity(s.opacity), [s.opacity])

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest('.catedit')) {
        e.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onBack])

  const patch = (p: SettingsPatch): void => void run(window.reminder.updateSettings(p))

  const toggle = (key: 'alwaysOnTop' | 'blur' | 'lockPosition' | 'clickThrough' | 'startWithWindows', label: string, hint?: string): React.JSX.Element => (
    <div className="setrow">
      <div className="t">
        <span id={`s-${key}`}>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </div>
      <button className="switch" role="switch" aria-checked={s[key]} aria-labelledby={`s-${key}`} onClick={() => patch({ [key]: !s[key] })} />
    </div>
  )

  const counts = new Map<string, number>()
  for (const ev of state.events) counts.set(ev.categoryId, (counts.get(ev.categoryId) ?? 0) + 1)

  return (
    <>
      <div className="panel-h">
        <BackButton onClick={onBack} />
        <h2>{t('settings.title')}</h2>
      </div>
      <div className="body form">
        <div className="section-t">{t('settings.appearance')}</div>
        <div className="field">
          <span className="label" id="s-theme">
            {t('settings.theme')}
          </span>
          <div className="seg" role="radiogroup" aria-labelledby="s-theme">
            {THEMES.map((th) => (
              <button key={th} role="radio" aria-checked={s.theme === th} className={s.theme === th ? 'sel' : ''} onClick={() => patch({ theme: th })}>
                {t(`settings.${th}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <div className="setrow">
            <label className="label" htmlFor="s-op">
              {t('settings.opacity')}
            </label>
            <span className="mono">{opacity}%</span>
          </div>
          <input
            id="s-op"
            type="range"
            min={40}
            max={100}
            value={opacity}
            onChange={(e) => {
              const v = Number(e.target.value)
              setOpacity(v)
              document.documentElement.style.setProperty('--op', String(v / 100))
              patch({ opacity: v })
            }}
          />
          <span className="hint">{t('settings.opacityHint')}</span>
        </div>
        {toggle('blur', t('settings.blur'), t('settings.blurHint'))}

        <div className="section-t">{t('settings.window')}</div>
        {toggle('alwaysOnTop', t('settings.alwaysOnTop'))}
        {toggle('lockPosition', t('settings.lockPosition'), t('settings.lockPositionHint'))}
        {toggle('clickThrough', t('settings.clickThrough'))}
        <div className="info">
          <IconPointer size={16} stroke={1.75} />
          <span>
            <Trans i18nKey="settings.clickThroughInfo" components={{ b: <b /> }} />
          </span>
        </div>
        {toggle('startWithWindows', t('settings.startWithWindows'))}

        <div className="section-t">{t('settings.sound')}</div>
        <div className="seg" role="radiogroup" aria-label={t('settings.sound')}>
          <button role="radio" aria-checked={s.sound.mode === 'system'} className={s.sound.mode === 'system' ? 'sel' : ''} onClick={() => patch({ sound: { ...s.sound, mode: 'system' } })}>
            {t('settings.system')}
          </button>
          <button
            role="radio"
            aria-checked={s.sound.mode === 'custom'}
            className={s.sound.mode === 'custom' ? 'sel' : ''}
            onClick={async () => {
              setSoundErr(null)
              if (s.sound.file) patch({ sound: { ...s.sound, mode: 'custom' } })
              else {
                const err = await run(window.reminder.chooseSound())
                if (err && err !== 'canceled') setSoundErr(errorText(err))
              }
            }}
          >
            {t('settings.custom')}
          </button>
        </div>
        <div className="row">
          <input className="input" value={s.sound.file ?? t('settings.noFile')} disabled aria-label={t('settings.custom')} />
          <button
            className="btn sm"
            onClick={async () => {
              setSoundErr(null)
              const err = await run(window.reminder.chooseSound())
              if (err && err !== 'canceled') setSoundErr(errorText(err))
            }}
          >
            {t('settings.chooseFile')}
          </button>
          <button className="ibtn" title={t('settings.play')} aria-label={t('settings.play')} onClick={() => void window.reminder.testSound()}>
            <IconVolume size={16} stroke={1.75} />
          </button>
        </div>
        {soundErr ? <FieldError text={soundErr} /> : <span className="hint">{t('settings.soundHint')}</span>}
        <div className="setrow">
          <label htmlFor="s-snooze">{t('settings.snoozeDefault')}</label>
          <div className="row">
            <input
              id="s-snooze"
              className="input mono"
              style={{ width: 72, textAlign: 'center' }}
              inputMode="numeric"
              maxLength={4}
              value={snoozeText}
              aria-invalid={snoozeErr}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d]/g, '')
                setSnoozeText(v)
                const n = Number(v)
                const ok = v !== '' && n >= 1 && n <= 1440
                setSnoozeErr(!ok)
                if (ok) patch({ snoozeMinutes: n })
              }}
            />
            <span className="hint">{t('notify.min')}</span>
          </div>
        </div>
        {snoozeErr && <FieldError text={t('errors.snoozeRange')} />}

        <div className="section-t">{t('settings.categories')}</div>
        <Categories categories={state.categories} counts={counts} run={run} />

        <div className="section-t">{t('settings.data')}</div>
        <span className="hint">
          {t('settings.dataFile', { path: '' })}
          <span className="path">{dataPath}</span>
        </span>
      </div>
    </>
  )
}

function Categories({ categories, counts, run }: { categories: Category[]; counts: Map<string, number>; run: Props['run'] }): React.JSX.Element {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  return (
    <div className="field">
      {categories.map((c) =>
        editing === c.id ? (
          <CategoryEditor
            key={c.id}
            initial={c}
            canDelete={!counts.get(c.id) && categories.length > 1}
            onCancel={() => setEditing(null)}
            onSave={async (v) => {
              const err = await run(window.reminder.updateCategory(c.id, v))
              if (!err) setEditing(null)
              return err
            }}
            onDelete={async () => {
              const err = await run(window.reminder.deleteCategory(c.id))
              if (!err) setEditing(null)
              return err
            }}
          />
        ) : (
          <div className="row" key={c.id}>
            <span className="catchip" style={{ ['--c' as string]: `var(--series-${c.color})` }}>
              <i />
              {c.name}
            </span>
            <span className="hint" style={{ marginLeft: 'auto' }}>
              {t('settings.eventCount', { count: counts.get(c.id) ?? 0 })}
            </span>
            <button className="ibtn" aria-label={`${t('settings.editCategory')}: ${c.name}`} title={t('settings.editCategory')} onClick={() => setEditing(c.id)}>
              <IconEdit size={16} stroke={1.75} />
            </button>
          </div>
        )
      )}
      {editing === 'new' ? (
        <CategoryEditor
          initial={{ name: '', color: ((categories.length % 5) + 1) as 1 }}
          canDelete={false}
          onCancel={() => setEditing(null)}
          onSave={async (v) => {
            const err = await run(window.reminder.createCategory(v))
            if (!err) setEditing(null)
            return err
          }}
        />
      ) : (
        categories.length < 20 && (
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing('new')}>
            <IconPlus size={16} stroke={1.75} />
            {t('settings.addCategory')}
          </button>
        )
      )}
    </div>
  )
}

interface EditorProps {
  initial: { name: string; color: number }
  canDelete: boolean
  onCancel(): void
  onSave(v: { name: string; color: number }): Promise<string | null>
  onDelete?(): Promise<string | null>
}

function CategoryEditor({ initial, canDelete, onCancel, onSave, onDelete }: EditorProps): React.JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState(initial.name)
  const [color, setColor] = useState(initial.color)
  const [err, setErr] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    const n = name.trim()
    if (!n || n.length > 40) return setErr(t('errors.categoryName'))
    const e = await onSave({ name: n, color })
    setErr(e ? errorText(e) : null)
  }

  return (
    <div
      className="catedit"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
    >
      <input
        className="input"
        autoFocus
        maxLength={40}
        value={name}
        placeholder={t('form.newCategoryPlaceholder')}
        aria-label={t('form.newCategoryPlaceholder')}
        aria-invalid={!!err}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
        }}
      />
      <div className="swatches" role="radiogroup" aria-label={t('settings.colour', { n: '' })}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            className="swatch"
            role="radio"
            aria-checked={color === n}
            aria-label={t('settings.colour', { n })}
            style={{ ['--c' as string]: `var(--series-${n})` }}
            onClick={() => setColor(n)}
          />
        ))}
      </div>
      <FieldError text={err ?? undefined} />
      <div className="row">
        <button className="btn sm primary" onClick={() => void save()}>
          {t('settings.save')}
        </button>
        <button className="btn sm" onClick={onCancel}>
          {t('settings.cancel')}
        </button>
        {onDelete &&
          (canDelete ? (
            <HoldButton
              className="btn sm danger"
              label={t('card.holdToDelete')}
              onConfirm={async () => {
                const e = await onDelete()
                setErr(e ? errorText(e) : null)
              }}
            >
              {t('settings.delete')}
              <span className="hint">{t('card.hold')}</span>
            </HoldButton>
          ) : (
            <button className="btn sm danger" disabled title={t('errors.categoryInUse')}>
              {t('settings.delete')}
            </button>
          ))}
      </div>
    </div>
  )
}
