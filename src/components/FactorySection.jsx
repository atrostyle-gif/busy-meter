// 工場カード配下の略称（NC/MC等）が自動翻訳されないよう section に translate="no" を付与
import MachineCard from './MachineCard'

const FACTORY_LABELS = {
  osaka: '大阪工場',
  oita: '大分工場',
  kochi: '高知工場',
}

export default function FactorySection({ factory, machines, onSave, isActive }) {
  const title = FACTORY_LABELS[factory] ?? factory

  return (
    <section
      className={`factory-section factory-section--${factory} ${isActive ? 'active' : ''}`}
      data-factory={factory}
      id={`factory-section-${factory}`}
      role="tabpanel"
      aria-labelledby={`factory-tab-${factory}`}
      translate="no"
    >
      <div className="factory-section__head">
        <h2 className="factory-section__title">{title}</h2>
      </div>
      <div className="factory-section__content">
        <div className="factory-section__cards">
          {!machines || machines.length === 0 ? (
            <p className="factory-section__empty">該当機械はありません。</p>
          ) : (
            machines.map((row) => (
              <MachineCard key={row.machine_id} row={row} onSave={onSave} />
            ))
          )}
        </div>
      </div>
    </section>
  )
}
