import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconAlertCircle, IconChevronLeft, IconClock, IconInfoCircle, IconPlus } from '@tabler/icons-react'
import type { Category, EventInput, Interval, ReminderEvent } from '@shared/model'
import { intervalProblem } from '@shared/time'
import { errorText, hoursText, intervalText, WEEKDAYS } from '../format'

export type FormMode = { kind: 'new' } | { kind: 'edit'; ev: ReminderEvent } | { kind: 'restore'; ev: ReminderEvent }

interface Props {
  mode: FormMode
  categories: Category[]
  onCancel(): void
  onSubmit(input: EventInput): Promise<string | null>
  onCreateCategory(name: string): Promise<string | null>
}

const FIELDS: (keyof Interval)[] = ['months', 'weeks', 'days', 'hours', 'minutes']
const FIELD_LABEL: Record<keyof Interval, string> = { months: 'form.months', weeks: 'form.weeks', days: 'form.daysField', hours: 'form.hours', minutes: 'form.minutes' }
const HM = /^([01]\d|2[0-3]):[0-5]\d$/

interface Draft {
  title: string
  description: string
  categoryId: string
  interval: Record<keyof Interval, string>
  repeatOn: boolean
  times: string
  untilStop: boolean
  allDay: boolean
  start: string
  end: string
  days: number[]
}

function toDraft(mode: FormMode, categories: Category[]): Draft {
  if (mode.kind === 'new') {
    return {
      title: '',
      description: '',
      categoryId: categories[0]?.id ?? '',
      interval: { months: '', weeks: '', days: '', hours: '', minutes: '' },
      repeatOn: true,
      times: '',
      untilStop: true,
      allDay: true,
      start: '07:30',
      end: '16:00',
      days: [0, 1, 2, 3, 4, 5, 6]
    }
  }
  const ev = mode.ev
  const iv = {} as Record<keyof Interval, string>
  for (const f of FIELDS) iv[f] = ev.interval[f] ? String(ev.interval[f]) : ''
  return {
    title: ev.title,
    description: ev.description,
    categoryId: categories.some((c) => c.id === ev.categoryId) ? ev.categoryId : (categories[0]?.id ?? ''),
    interval: iv,
    repeatOn: ev.repeat.enabled,
    times: ev.repeat.times ? String(ev.repeat.times) : '',
    untilStop: ev.repeat.times === null,
    allDay: ev.schedule.allDay,
    start: ev.schedule.start,
    end: ev.schedule.end,
    days: [...ev.schedule.days]
  }
}

const num = (s: string): number => (s.trim() === '' ? 0 : Number(s))
const validPart = (s: string): boolean => s.trim() === '' || (/^\d{1,3}$/.test(s.trim()) && Number(s) <= 999)

type Errors = Partial<Record<'title' | 'interval' | 'times' | 'hours' | 'days' | 'submit', string>>

export function EventForm({ mode, categories, onCancel, onSubmit, onCreateCategory }: Props): React.JSX.Element {
  const { t } = useTranslation()
  const [d, setD] = useState<Draft>(() => toDraft(mode, categories))
  const [errors, setErrors] = useState<Errors>({})
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newCat, setNewCat] = useState<string | null>(null)
  const [catError, setCatError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => titleRef.current?.focus(), [])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void => setD((x) => ({ ...x, [k]: v }))

  const interval: Interval = useMemo(() => {
    const i = {} as Interval
    for (const f of FIELDS) i[f] = validPart(d.interval[f]) ? num(d.interval[f]) : 0
    return i
  }, [d.interval])
  const summary = intervalText(interval)

  function validate(): { errs: Errors; input: EventInput | null } {
    const errs: Errors = {}
    if (!d.title.trim()) errs.title = t('errors.titleRequired')
    const partsOk = FIELDS.every((f) => validPart(d.interval[f]))
    if (!partsOk) errs.interval = t('errors.badNumber')
    const timesN = Number(d.times)
    if (d.repeatOn && !d.untilStop && !(/^\d{1,4}$/.test(d.times.trim()) && timesN >= 1 && timesN <= 9999)) errs.times = t('errors.badTimes')
    if (!d.allDay && (!HM.test(d.start) || !HM.test(d.end))) errs.hours = t('errors.badTime')
    const schedule = { allDay: d.allDay, start: HM.test(d.start) ? d.start : '07:30', end: HM.test(d.end) ? d.end : '16:00', days: [...d.days].sort((a, b) => a - b) }
    if (partsOk && !errs.hours) {
      const p = intervalProblem(interval, schedule)
      if (p === 'noDays') errs.days = t('errors.noDays')
      else if (p === 'sameHours') errs.hours = t('errors.sameHours')
      else if (p === 'empty') errs.interval = t('errors.empty')
      else if (p === 'longerThanWindow') errs.interval = t('errors.longerThanWindow', { interval: summary, hours: hoursText(schedule) })
    }
    if (Object.keys(errs).length) return { errs, input: null }
    return {
      errs,
      input: {
        title: d.title.trim(),
        description: d.description,
        categoryId: d.categoryId,
        interval,
        schedule,
        repeat: { enabled: d.repeatOn, times: d.repeatOn && !d.untilStop ? timesN : null }
      }
    }
  }

  // Live validation after the first save attempt.
  useEffect(() => {
    if (tried) setErrors(validate().errs)
  }, [d, tried])

  async function save(): Promise<void> {
    if (saving) return
    setTried(true)
    const { errs, input } = validate()
    setErrors(errs)
    if (!input) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    setSaving(true)
    const err = await onSubmit(input)
    setSaving(false)
    if (err) setErrors({ submit: errorText(err) })
  }

  // Ctrl+S saves, Esc cancels.
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      } else if (e.key === 'Escape' && newCat === null) {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })

  async function addCategory(): Promise<void> {
    const name = (newCat ?? '').trim()
    if (!name || name.length > 40) {
      setCatError(t('errors.categoryName'))
      return
    }
    const err = await onCreateCategory(name)
    if (err) setCatError(errorText(err))
    else {
      setNewCat(null)
      setCatError(null)
    }
  }

  // Select a category created from the form as soon as it arrives.
  const prevCats = useRef(categories.map((c) => c.id))
  useEffect(() => {
    const added = categories.find((c) => !prevCats.current.includes(c.id))
    prevCats.current = categories.map((c) => c.id)
    if (added) set('categoryId', added.id)
  }, [categories])

  const title = mode.kind === 'new' ? t('form.newTitle') : mode.kind === 'edit' ? t('form.editTitle') : t('form.restoreTitle')

  return (
    <>
      <div className="panel-h">
        <BackButton onClick={onCancel} />
        <h2>{title}</h2>
      </div>
      <form
        ref={formRef}
        className="body form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="field">
          <label className="label" htmlFor="f-title">
            {t('form.title')}
          </label>
          <input
            id="f-title"
            ref={titleRef}
            className="input"
            maxLength={200}
            value={d.title}
            placeholder={t('form.titlePlaceholder')}
            aria-invalid={!!errors.title}
            onChange={(e) => set('title', e.target.value)}
          />
          <FieldError text={errors.title} />
        </div>

        <div className="field">
          <label className="label" htmlFor="f-desc">
            {t('form.description')}
          </label>
          <textarea id="f-desc" className="input" maxLength={5000} value={d.description} onChange={(e) => set('description', e.target.value)} />
        </div>

        <div className="field">
          <span className="label" id="f-cat">
            {t('form.category')}
          </span>
          <div className="chips" role="radiogroup" aria-labelledby="f-cat">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={d.categoryId === c.id}
                className={`chip ${d.categoryId === c.id ? 'sel' : ''}`}
                style={{ ['--c' as string]: `var(--series-${c.color})` }}
                onClick={() => set('categoryId', c.id)}
              >
                <span className="dot" />
                {c.name}
              </button>
            ))}
            {newCat === null && categories.length < 20 && (
              <button type="button" className="chip" onClick={() => setNewCat('')}>
                <IconPlus size={16} stroke={1.75} />
                {t('form.newCategory')}
              </button>
            )}
          </div>
          {newCat !== null && (
            <div className="row">
              <input
                className="input"
                autoFocus
                maxLength={40}
                value={newCat}
                placeholder={t('form.newCategoryPlaceholder')}
                aria-label={t('form.newCategoryPlaceholder')}
                onChange={(e) => setNewCat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void addCategory()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    e.stopPropagation()
                    setNewCat(null)
                    setCatError(null)
                  }
                }}
              />
              <button type="button" className="btn sm" onClick={() => void addCategory()}>
                {t('form.add')}
              </button>
            </div>
          )}
          <FieldError text={catError ?? undefined} />
        </div>

        <div className="field">
          <span className="label">{t('form.timer')}</span>
          <div className="dur">
            {FIELDS.map((f) => (
              <label key={f}>
                {t(FIELD_LABEL[f])}
                <input
                  inputMode="numeric"
                  maxLength={3}
                  placeholder="0"
                  value={d.interval[f]}
                  aria-invalid={!!errors.interval}
                  onChange={(e) => set('interval', { ...d.interval, [f]: e.target.value.replace(/[^\d]/g, '') })}
                />
              </label>
            ))}
          </div>
          <div className="summary">
            <IconClock size={16} stroke={1.75} />
            {summary ? (d.repeatOn ? t('repeat.every', { interval: summary }) : `${t('repeat.once')} · ${summary}`) : t('form.noTimer')}
          </div>
          {errors.interval ? <FieldError text={errors.interval} /> : <span className="hint">{t('form.timerHint')}</span>}
        </div>

        <div className="field">
          <div className="setrow">
            <div className="t">
              <span className="label" id="f-rep">
                {t('form.repeat')}
              </span>
              <span className="hint">{t('form.repeatHint')}</span>
            </div>
            <button type="button" className="switch" role="switch" aria-checked={d.repeatOn} aria-labelledby="f-rep" onClick={() => set('repeatOn', !d.repeatOn)} />
          </div>
          {d.repeatOn && (
            <div className="row">
              <input
                className="input mono"
                style={{ maxWidth: 80, textAlign: 'center' }}
                inputMode="numeric"
                maxLength={4}
                value={d.untilStop ? '' : d.times}
                placeholder="∞"
                aria-label={t('form.times')}
                aria-invalid={!!errors.times}
                onChange={(e) => setD((x) => ({ ...x, times: e.target.value.replace(/[^\d]/g, ''), untilStop: false }))}
              />
              <span>{t('form.times')}</span>
              <button
                type="button"
                className={`chip ${d.untilStop ? 'sel' : ''}`}
                aria-pressed={d.untilStop}
                style={{ marginLeft: 'auto' }}
                onClick={() => setD((x) => ({ ...x, untilStop: !x.untilStop, times: x.untilStop && !x.times ? '5' : x.times }))}
              >
                {t('form.untilStop')}
              </button>
            </div>
          )}
          <FieldError text={errors.times} />
          <span className="hint">{d.repeatOn ? t('form.repeatArchiveHint') : t('form.onceHint')}</span>
        </div>

        <div className="field">
          <span className="label">{t('form.activeHours')}</span>
          <div className="row">
            <input
              className="input mono"
              value={d.start}
              disabled={d.allDay}
              maxLength={5}
              aria-label={t('form.from')}
              aria-invalid={!d.allDay && !!errors.hours}
              onChange={(e) => set('start', e.target.value)}
            />
            <span>–</span>
            <input
              className="input mono"
              value={d.end}
              disabled={d.allDay}
              maxLength={5}
              aria-label={t('form.to')}
              aria-invalid={!d.allDay && !!errors.hours}
              onChange={(e) => set('end', e.target.value)}
            />
            <button type="button" className={`chip ${d.allDay ? 'sel' : ''}`} aria-pressed={d.allDay} onClick={() => set('allDay', !d.allDay)}>
              {t('form.allDay')}
            </button>
          </div>
          <FieldError text={errors.hours} />
          <div className="chips" role="group" aria-label={t('form.activeHours')}>
            {WEEKDAYS.map((name, i) => {
              const on = d.days.includes(i)
              return (
                <button
                  key={name}
                  type="button"
                  className={`chip day ${on ? 'sel' : ''}`}
                  aria-pressed={on}
                  aria-invalid={!!errors.days}
                  onClick={() => set('days', on ? d.days.filter((x) => x !== i) : [...d.days, i])}
                >
                  {name}
                </button>
              )
            })}
          </div>
          <FieldError text={errors.days} />
          <div className="info">
            <IconInfoCircle size={16} stroke={1.75} />
            <span>{t('form.hoursInfo')}</span>
          </div>
        </div>
        <FieldError text={errors.submit} />
        <button type="submit" hidden />
      </form>
      <div className="foot">
        <button type="button" className="btn block" onClick={onCancel}>
          {t('form.cancel')}
        </button>
        <button type="button" className="btn primary block" disabled={saving} onClick={() => void save()}>
          {saving ? t('form.saving') : t('form.save')} <kbd>Ctrl+S</kbd>
        </button>
      </div>
    </>
  )
}

export function FieldError({ text }: { text?: string }): React.JSX.Element | null {
  const { t } = useTranslation()
  if (!text) return null
  return (
    <span className="err" role="alert">
      <IconAlertCircle size={16} stroke={1.75} aria-label={t('form.error')} />
      <span>{text}</span>
    </span>
  )
}

export function BackButton({ onClick }: { onClick(): void }): React.JSX.Element {
  const { t } = useTranslation()
  return (
    <button type="button" className="ibtn" aria-label={t('app.back')} title={t('app.back')} onClick={onClick}>
      <IconChevronLeft size={16} stroke={1.75} />
    </button>
  )
}
