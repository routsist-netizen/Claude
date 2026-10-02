import { FLOUR_GROUPS, FLOUR_KINDS, findFlourKind } from '../domain/flours'
import { useT } from '../i18n'

const CUSTOM = 'custom'

/**
 * Picks a flour from the catalogue (grouped by grain) or "other", which
 * lets the baker type any name. Choosing a catalogue flour sets its name.
 */
export function FlourPicker({
  flour,
  onChange,
  id,
}: {
  /** `kind` is a catalogue id; a flour without one is a custom flour. */
  flour: { kind?: string; name: string }
  onChange: (patch: { kind: string | undefined; name: string }) => void
  id?: string
}) {
  const t = useT()
  const known = findFlourKind(flour.kind)
  return (
    <select
      id={id}
      className="input"
      aria-label={t.calc.flourKind}
      value={known ? known.id : CUSTOM}
      onChange={(e) => {
        const kind = findFlourKind(e.target.value)
        if (kind) onChange({ kind: kind.id, name: kind.name })
        // Switching to "other": keep a typed name, clear a catalogue one.
        else onChange({ kind: undefined, name: known ? '' : flour.name })
      }}
    >
      {FLOUR_GROUPS.map((group) => (
        <optgroup key={group} label={t.calc.flourGroups[group]}>
          {FLOUR_KINDS.filter((k) => k.group === group).map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </optgroup>
      ))}
      <optgroup label={t.calc.flourGroups.other}>
        <option value={CUSTOM}>{known || !flour.name ? t.calc.customFlour : flour.name}</option>
      </optgroup>
    </select>
  )
}
