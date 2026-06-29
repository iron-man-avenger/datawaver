import { describe, expect, it } from 'vitest';

import { computeCopyDelta } from '@/hooks/useTableEditor';
import type { PLMasterRow } from '@/lib/plMasterTypes';

function buildRow(overrides: Partial<PLMasterRow> = {}): PLMasterRow {
  return {
    UniqueID: '77\\300',
    GLCode: 'GL300',
    LineItem: 'Revenue',
    CompanyCode: 'C077',
    SiteCode: 'SITE1',
    GrandParent: 'GP',
    Parent: 'P',
    GrandParentCode: '1',
    ParentCode: '2',
    LineItemCode: '300',
    IsAggregated: 0,
    AggregatedFormula: null,
    PercentageFormula: null,
    ERPSoftware: 'SAP',
    SubNLCode: null,
    IsCOGS: 0,
    IsSales: 1,
    IsDiscount: 0,
    ...overrides,
  };
}

describe('computeCopyDelta', () => {
  it('returns new and modified records for copy payload', () => {
    const originalRows = [
      buildRow(),
      buildRow({ UniqueID: '77\\301', LineItemCode: '301' }),
    ];

    const rows = [
      { ...buildRow(), _rowId: 'orig-0', LineItem: 'Revenue Updated' },
      { ...buildRow({ UniqueID: '77\\301', LineItemCode: '301' }), _rowId: 'orig-1' },
      { ...buildRow({ UniqueID: '77\\999', LineItemCode: '999' }), _rowId: 'new-1', _isNew: true },
    ];

    const delta = computeCopyDelta(rows, ['77\\350'], originalRows);

    expect(delta.changedRecords).toHaveLength(2);
    expect(delta.changedRecords.map(row => row.UniqueID)).toEqual(['77\\300', '77\\999']);
    expect(delta.deletedIds).toEqual(['77\\350']);
  });

  it('treats boolean and numeric bit values as equivalent', () => {
    const originalRows = [buildRow({ IsSales: 1 })];
    const rows = [{ ...buildRow({ IsSales: true }), _rowId: 'orig-0' }];

    const delta = computeCopyDelta(rows, [], originalRows);

    expect(delta.changedRecords).toHaveLength(0);
  });
});
