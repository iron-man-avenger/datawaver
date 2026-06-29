import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Command, CommandInput } from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CompanySiteOption, createCompanySite } from '@/lib/plMasterTypes';
import { cn } from '@/lib/utils';

interface CopyChangesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sourceCompanyCode: string;
  sourceSiteCodes: string[];
  companySites: CompanySiteOption[];
  isLoadingCompanySites: boolean;
  companySitesError: string | null;
  hasUnsavedChanges: boolean;
  unsavedChangeSummary: string;
  isCopying: boolean;
  onCopy: (sourceSiteCode: string, targetCompanySites: CompanySiteOption[]) => Promise<void>;
  onRefresh?: () => Promise<void>;
  token?: string;
}

export function CopyChangesDialog({
  isOpen,
  onClose,
  sourceCompanyCode,
  sourceSiteCodes,
  companySites,
  isLoadingCompanySites,
  companySitesError,
  hasUnsavedChanges,
  unsavedChangeSummary,
  isCopying,
  onCopy,
  onRefresh,
  token,
}: CopyChangesDialogProps) {
  const [query, setQuery] = useState('');
  const [selectedSourceSiteCode, setSelectedSourceSiteCode] = useState<string>('');
  const [selectedCompanySites, setSelectedCompanySites] = useState<CompanySiteOption[]>([]);
  const [manualEntryError, setManualEntryError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createCompanyCode, setCreateCompanyCode] = useState('');
  const [createSiteCode, setCreateSiteCode] = useState('');

  const normalizedSourceCode = sourceCompanyCode.trim().toUpperCase();
  const normalizedQuery = query.trim().toUpperCase();

  // Match both full format (C####:SITE) and company code only (C####)
  const queryMatch = normalizedQuery.match(/^(C\d+)[:/\-\s]+([A-Z0-9_-]+)$/);
  const companyCodeOnlyMatch = normalizedQuery.match(/^(C\d+)$/);
  const queryMatchesFormat = queryMatch !== null || companyCodeOnlyMatch !== null;

  const queryExistsInResults = companySites.some(
    x => queryMatch && x.company_code === queryMatch[1] && x.site_code === queryMatch[2]
  );
  const queryAlreadySelected = selectedCompanySites.some(
    x => queryMatch && x.company_code === queryMatch[1] && x.site_code === queryMatch[2]
  );

  const filteredCompanySites = useMemo(() => {
    if (!normalizedQuery) {
      return companySites;
    }

    return companySites.filter(siteOption => {
      return (
        siteOption.company_code.toUpperCase().includes(normalizedQuery) ||
        siteOption.site_code.toUpperCase().includes(normalizedQuery)
      );
    });
  }, [companySites, normalizedQuery]);

  const canAddQueriedSite =
    queryMatch !== null &&
    !queryExistsInResults &&
    !queryAlreadySelected &&
    !(queryMatch[1] === normalizedSourceCode && queryMatch[2] === selectedSourceSiteCode);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setSelectedCompanySites([]);
    setQuery('');
    setManualEntryError(null);
    setCreateCompanyCode('');
    setCreateSiteCode('');

    if (sourceSiteCodes.length > 0) {
      setSelectedSourceSiteCode(sourceSiteCodes[0]);
    } else {
      setSelectedSourceSiteCode('');
    }
  }, [isOpen, sourceSiteCodes]);

  const selectionSummary = useMemo(() => {
    if (selectedCompanySites.length === 0) {
      return 'No target company sites selected';
    }

    return `${selectedCompanySites.length} target company site${selectedCompanySites.length > 1 ? 's' : ''} selected`;
  }, [selectedCompanySites]);

  const toggleCompanySite = (item: CompanySiteOption) => {
    setManualEntryError(null);
    setSelectedCompanySites(prev => {
      const exists = prev.some(x => x.company_code === item.company_code && x.site_code === item.site_code);
      if (exists) {
        return prev.filter(x => !(x.company_code === item.company_code && x.site_code === item.site_code));
      }
      return [...prev, item];
    });
  };

  const handleAddCompanyFromSearch = async () => {
    if (!token) {
      setManualEntryError('Authentication token missing');
      return;
    }

    const manualCompany = createCompanyCode.trim().toUpperCase();
    const manualSite = createSiteCode.trim().toUpperCase();

    if (!manualCompany || !manualSite) {
      setManualEntryError('Please enter both company code and site code.');
      return;
    }

    setIsCreating(true);
    setManualEntryError(null);

    try {
      await createCompanySite(token, manualCompany, manualSite);
      setSelectedCompanySites(prev => [...prev, { company_code: manualCompany, site_code: manualSite }]);
      setQuery('');
      setCreateCompanyCode('');
      setCreateSiteCode('');
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error: any) {
      setManualEntryError(error.message || 'Failed to create company/site table');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (selectedCompanySites.length === 0 || isCopying) {
      return;
    }

    if (!selectedSourceSiteCode) {
      setManualEntryError('Please select a source site code first.');
      return;
    }

    await onCopy(selectedSourceSiteCode, selectedCompanySites);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Copy Changes</DialogTitle>
          <DialogDescription>
            Copy latest saved master from {sourceCompanyCode} to selected target company sites.
            Target snapshots for selected company sites will be fully replaced.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            Copy uses saved database data for {sourceCompanyCode}. Unsaved edits are not included.
          </div>

          {hasUnsavedChanges && (
            <div className="rounded-md border border-amber-300/50 bg-amber-100/20 px-3 py-2 text-xs text-amber-700">
              Unsaved changes detected ({unsavedChangeSummary}). Save first if you want those changes included in copy.
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Source Site Code</label>
            {sourceSiteCodes.length === 0 ? (
              <div className="rounded-md border border-amber-300/50 bg-amber-100/10 px-3 py-2 text-xs text-amber-600">
                No site codes found in the current company rows. Please save some rows with site codes first.
              </div>
            ) : (
              <Select value={selectedSourceSiteCode} onValueChange={setSelectedSourceSiteCode}>
                <SelectTrigger className="w-full bg-background border-border">
                  <SelectValue placeholder="Select source site code..." />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {sourceSiteCodes.map(site => (
                    <SelectItem key={site} value={site}>
                      {site}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Target Company Sites</label>
            <div className="rounded-md border border-border overflow-hidden bg-background">
              <Command shouldFilter={false}>
                <CommandInput
                  value={query}
                  onValueChange={(value) => {
                    setQuery(value);
                    const normalizedValue = value.trim().toUpperCase();

                    if (!normalizedValue) {
                      setCreateCompanyCode('');
                      setCreateSiteCode('');
                      return;
                    }

                    const companyCodeMatch = normalizedValue.match(/^(C\d+)$/);
                    if (companyCodeMatch) {
                      setCreateCompanyCode(companyCodeMatch[1]);
                    } else if (normalizedValue.includes(':')) {
                      const parts = normalizedValue.split(':');
                      if (parts[0]?.match(/^C\d+$/)) {
                        setCreateCompanyCode(parts[0]);
                      }
                      if (parts[1]) {
                        setCreateSiteCode(parts[1]);
                      }
                    }
                  }}
                  placeholder="Search target company or site..."
                />
                {query.length > 0 && !queryMatchesFormat && (
                  <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b border-border bg-muted/20">
                    Tip: Type company code (e.g., C149) or full format (e.g., C2388:SITE1) to create a new target table.
                  </div>
                )}

                <div className="border-t border-border p-2 space-y-2 bg-muted/20">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Create new target
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={createCompanyCode}
                      onChange={e => setCreateCompanyCode(e.target.value)}
                      placeholder="Company code e.g. C149"
                      className="rounded-md border border-border bg-background px-2 py-2 text-xs outline-none focus:border-primary"
                    />
                    <input
                      value={createSiteCode}
                      onChange={e => setCreateSiteCode(e.target.value)}
                      placeholder="Site code e.g. SITE1"
                      className="rounded-md border border-border bg-background px-2 py-2 text-xs outline-none focus:border-primary"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCompanyFromSearch}
                    disabled={isCreating || !createCompanyCode.trim() || !createSiteCode.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-sm px-2 py-2 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreating ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus size={12} />
                        Create Table
                      </>
                    )}
                  </button>
                </div>

                <div className="max-h-[300px] overflow-y-auto overflow-x-hidden scrollbar-dark">
                  {isLoadingCompanySites && (
                    <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" />
                      Loading company sites...
                    </div>
                  )}

                  {!isLoadingCompanySites && companySitesError && (
                    <div className="px-3 py-3 text-sm text-destructive">{companySitesError}</div>
                  )}

                  {!isLoadingCompanySites && !companySitesError && companySites.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No company sites found. Create one using the format below.
                    </div>
                  )}

                  {!isLoadingCompanySites && !companySitesError && filteredCompanySites.length > 0 && (
                    <div className="p-1">
                      {filteredCompanySites.map(siteOption => {
                        const key = `${siteOption.company_code}:${siteOption.site_code}`;
                        const selected = selectedCompanySites.some(
                          x => x.company_code === siteOption.company_code && x.site_code === siteOption.site_code
                        );

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleCompanySite(siteOption)}
                            className={cn(
                              'flex w-full items-center justify-between rounded-sm px-2 py-2 text-left text-sm outline-none transition-colors',
                              'hover:bg-accent hover:text-accent-foreground'
                            )}
                          >
                            <span className="font-mono">
                              {siteOption.company_code} - {siteOption.site_code}
                            </span>
                            <span
                              className={cn(
                                'inline-flex h-4 w-4 items-center justify-center rounded border',
                                selected
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-muted-foreground/40 bg-background text-transparent'
                              )}
                            >
                              <Check size={12} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                </div>
              </Command>
            </div>
          </div>

          {manualEntryError && <p className="text-xs text-destructive">{manualEntryError}</p>}

          <div className="flex flex-wrap gap-2">
            {selectedCompanySites.map(item => {
              const key = `${item.company_code}:${item.site_code}`;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleCompanySite(item)}
                  className="inline-flex items-center rounded-full border border-primary/50 bg-primary/10 px-2.5 py-1 text-xs font-mono text-primary hover:bg-primary/20 animate-in fade-in zoom-in duration-100"
                >
                  {item.company_code} - {item.site_code}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">{selectionSummary}</p>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted"
            disabled={isCopying}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={isCopying || selectedCompanySites.length === 0 || !selectedSourceSiteCode}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
          >
            {isCopying ? <Loader2 size={14} className="animate-spin" /> : null}
            Copy Changes
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
