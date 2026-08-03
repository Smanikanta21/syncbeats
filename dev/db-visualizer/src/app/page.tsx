"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import DashboardView from "@/components/DashboardView";
import DebugLogsView from "@/components/DebugLogsView";
import EmailDesignerView from "@/components/EmailDesignerView";
import AdminLockScreen from "@/components/AdminLockScreen";
import { TableRowSkeleton } from "@/components/Skeleton";

type Field = { name: string; type: string; kind: string; isId: boolean; isRequired: boolean };
type TableInfo = { name: string; dbName: string; fields: Field[]; count: number };

export default function Home() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [tables, setTables] = useState<TableInfo[]>([]);
  const [activeTable, setActiveTable] = useState<TableInfo | null>(null);
  const [tableData, setTableData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rowSearch, setRowSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc'|'desc'} | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{rowId: any, rowIndex: number, field: string, value: any} | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [viewMode, setViewMode] = useState<'dashboard' | 'logs' | 'email' | 'tables' | 'recycle_bin'>('dashboard');
  const [recycleBinData, setRecycleBinData] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/admin/login')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setIsUnlocked(true);
        }
        setCheckingAuth(false);
      })
      .catch(() => setCheckingAuth(false));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/admin/login', { method: 'DELETE' });
    setIsUnlocked(false);
  };



  const fetchTables = () => {
    setLoading(true);
    fetch('/api/tables')
      .then(res => res.json())
      .then(data => {
        if (data.tables) {
          setTables(data.tables);
          if (data.tables.length > 0 && !activeTable) {
            setActiveTable(data.tables[0]);
          }
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTableData = async () => {
    if (!activeTable) return;
    setDataLoading(true);
    try {
      const res = await fetch(`/api/data/${activeTable.name}`);
      const data = await res.json();
      if (data.data) {
        setTableData(data.data);
        setTotal(data.meta.total);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setTableData([]);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (!activeTable) return;
    setSortConfig(null);
    setSelectedRows(new Set());
    setEditingCell(null);
    if (viewMode === 'tables') {
      fetchTableData();
    }
  }, [activeTable, viewMode]);
  
  useEffect(() => {
    if (viewMode === 'recycle_bin') {
      fetchRecycleBin();
    }
  }, [viewMode]);

  const fetchRecycleBin = async () => {
    setDataLoading(true);
    try {
      const res = await fetch('/api/deleted');
      const data = await res.json();
      setRecycleBinData(data.records || []);
    } catch (err) {
      console.error(err);
      setRecycleBinData([]);
    } finally {
      setDataLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!editingCell || !activeTable) return;
    
    // We used 'i' in map for rowIndex, which means tableData[rowIndex] might be affected by sorting!
    // We should use the row's ID instead of rowIndex to be safe.
    // Wait, the edit is triggered from the map. It's better to store rowId and find it.
    // For now, let's keep it simple: we pass the actual row object's PK to editingCell.rowId
    const { rowId, field, value } = editingCell as any;
    
    try {
      const res = await fetch(`/api/data/${activeTable.name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowId, data: { [field]: value } })
      });
      
      if (res.ok) {
        fetchTableData();
        setEditingCell(null);
      } else {
        const err = await res.json();
        alert(`Failed to save: ${err.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error(e);
      alert("Network error");
    }
  };

  const deleteSelected = async () => {
    if (!activeTable || selectedRows.size === 0) return;
    setDeleteLoading(true);
    
    const idsToDelete = Array.from(selectedRows).map(rowId => rowId); // selectedRows now stores actual IDs!
    
    try {
      const res = await fetch(`/api/data/${activeTable.name}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToDelete })
      });
      
      if (res.ok) {
        setShowDeleteModal(false);
        setSelectedRows(new Set());
        fetchTableData();
      } else {
        const err = await res.json();
        alert(`Failed to delete: ${err.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error(e);
      alert("Network error");
    } finally {
      setDeleteLoading(false);
    }
  };



  if (checkingAuth) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-white font-mono text-sm">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
          <span>Verifying SyncBeats Admin session...</span>
        </div>
      </div>
    );
  }

  if (!isUnlocked) {
    return <AdminLockScreen onUnlock={() => setIsUnlocked(true)} />;
  }

  return (
    <div className={cn('flex', 'h-screen', 'bg-background', 'text-foreground', 'font-sans', 'overflow-hidden')}>
      
      {/* Sidebar Overlay (Mobile) */}
      {sidebarOpen && (
        <div 
          className={cn('fixed', 'inset-0', 'bg-background/80', 'backdrop-blur-sm', 'z-30', 'md:hidden')} 
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        sidebarCollapsed ? 'w-20' : 'w-64', 'glass-panel', 'border-r-0', 'rounded-r-3xl', 'my-2', 'ml-2', 'flex', 'flex-col', 'shrink-0', 'overflow-hidden', 'shadow-2xl', 'z-40',
        'fixed', 'inset-y-0', 'left-0', 'transition-all', 'duration-300',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'md:relative', 'md:translate-x-0'
      )}>
        <div className={cn('p-4', 'border-b', 'border-[var(--glass-border)]', 'flex', 'items-center', 'justify-between')}>
          {!sidebarCollapsed && (
            <h1 className={cn('text-xl', 'font-black', 'tracking-tighter', 'text-foreground', 'truncate')}>
              SYNC<span className="text-emerald-400">DB</span>
            </h1>
          )}
          
          <div className="flex items-center gap-1 mx-auto md:mx-0">
            {/* Desktop Hamburger Collapse Toggle */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="hidden md:flex p-2 rounded-xl text-zinc-400 hover:bg-foreground/5 hover:text-white transition-colors"
              title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>

            {/* Mobile Close Button */}
            <button 
              className={cn('md:hidden', 'p-2', 'text-zinc-400', 'hover:text-foreground')}
              onClick={() => setSidebarOpen(false)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
        
        {/* Navigation list */}
        <div className={cn('flex', 'flex-col', 'flex-1', 'overflow-y-auto', 'p-2', 'space-y-1.5')}>
          {/* Main Dashboard view button */}
          <button
            onClick={() => {
              setViewMode('dashboard');
              setSidebarOpen(false);
            }}
            title="Dashboard & Map"
            className={`flex items-center gap-3 p-3 rounded-xl text-left font-bold text-sm transition-all ${
              sidebarCollapsed ? 'justify-center' : ''
            } ${
              viewMode === 'dashboard'
                ? 'bg-emerald-500 text-zinc-950 shadow-lg shadow-emerald-500/20'
                : 'text-zinc-400 hover:bg-foreground/5 hover:text-white'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            {!sidebarCollapsed && <span>Dashboard & Map</span>}
          </button>

          {/* Debug Logs view button */}
          <button
            onClick={() => {
              setViewMode('logs');
              setSidebarOpen(false);
            }}
            title="Debug Logs & Audit"
            className={`flex items-center gap-3 p-3 rounded-xl text-left font-bold text-sm transition-all ${
              sidebarCollapsed ? 'justify-center' : ''
            } ${
              viewMode === 'logs'
                ? 'bg-foreground text-background font-black shadow-lg'
                : 'text-zinc-400 hover:bg-foreground/5 hover:text-white'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>
            {!sidebarCollapsed && <span>Debug Logs & Audit</span>}
          </button>

          {/* Email Studio view button */}
          <button
            onClick={() => {
              setViewMode('email');
              setSidebarOpen(false);
            }}
            title="Email Studio IDE"
            className={`flex items-center gap-3 p-3 rounded-xl text-left font-bold text-sm transition-all ${
              sidebarCollapsed ? 'justify-center' : ''
            } ${
              viewMode === 'email'
                ? 'bg-foreground text-background font-black shadow-lg'
                : 'text-zinc-400 hover:bg-foreground/5 hover:text-white'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            {!sidebarCollapsed && <span>Email Studio IDE</span>}
          </button>

          {/* Single Database Tables Hub Item */}
          <button
            onClick={() => {
              if (tables.length > 0 && !activeTable) setActiveTable(tables[0]);
              setViewMode('tables');
              setSidebarOpen(false);
            }}
            title="Database Tables Inspector"
            className={`flex items-center gap-3 p-3 rounded-xl text-left font-bold text-sm transition-all ${
              sidebarCollapsed ? 'justify-center' : ''
            } ${
              viewMode === 'tables'
                ? 'bg-white text-zinc-950 font-extrabold shadow-lg'
                : 'text-zinc-400 hover:bg-foreground/5 hover:text-white'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>
            {!sidebarCollapsed && (
              <div className="flex items-center justify-between w-full">
                <span>Database Tables</span>
                <span className="px-2 py-0.5 text-[10px] bg-zinc-800 text-zinc-300 rounded-full font-mono font-bold">
                  {tables.length}
                </span>
              </div>
            )}
          </button>

          <div className={cn('mt-auto', 'pt-4', 'border-t', 'border-[var(--glass-border)]', 'text-xs', 'text-zinc-500', 'flex', 'flex-col', 'gap-1')}>
            <button 
              onClick={() => {
                setViewMode('recycle_bin');
                setSidebarOpen(false);
              }}
              title="Recycle Bin"
              className={`w-full py-2.5 px-3 text-sm text-left hover:bg-foreground/5 rounded-xl transition-colors flex items-center gap-3 ${
                sidebarCollapsed ? 'justify-center' : ''
              } ${viewMode === 'recycle_bin' ? 'bg-foreground/10 text-foreground font-bold' : 'text-zinc-400'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              {!sidebarCollapsed && <span>Recycle Bin</span>}
            </button>

            <button 
              onClick={handleLogout}
              title="Lock Console"
              className={`w-full py-2.5 px-3 text-xs text-left text-red-400 hover:bg-red-500/10 rounded-xl transition-colors font-medium flex items-center gap-3 ${
                sidebarCollapsed ? 'justify-center' : ''
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              {!sidebarCollapsed && <span>Lock Console</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'dashboard' ? (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-transparent relative z-10 overflow-hidden">
          <DashboardView
            onNavigateTable={(tableName, searchStr) => {
              const targetTab = tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase()) || tables[0];
              if (targetTab) {
                setActiveTable(targetTab);
                if (searchStr) setRowSearch(searchStr);
                setViewMode("tables");
              }
            }}
          />
        </div>
      ) : viewMode === 'logs' ? (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-transparent relative z-10 p-2 md:p-4 overflow-hidden">
          <DebugLogsView />
        </div>
      ) : viewMode === 'email' ? (
        <div className="flex-1 flex flex-col min-w-0 h-full bg-transparent relative z-10 overflow-hidden">
          <EmailDesignerView onOpenSidebar={() => setSidebarOpen(true)} />
        </div>
      ) : (
        <div className={cn('flex-1', 'flex', 'flex-col', 'min-w-0', 'min-h-0', 'bg-transparent', 'relative', 'z-10', 'p-2', 'md:p-2')}>
          {/* Header */}
          <div className={cn('py-2' , 'px-4' , 'shrink-0', 'flex', 'items-center', 'justify-between', 'glass-panel', 'rounded-t-3xl', 'border-b-0')}>
            <div className="flex items-center gap-4">
              <button 
                className={cn('md:hidden', 'p-2', '-ml-2', 'text-zinc-400', 'hover:text-foreground', 'transition-colors')}
                onClick={() => setSidebarOpen(true)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
              </button>
              <div>
                <h2 className={cn('text-xl', 'md:text-2xl', 'font-black', 'tracking-tight', 'text-foreground')}>
                  {viewMode === 'recycle_bin' ? 'Recycle Bin' : (activeTable?.name || 'Select a table')}
                </h2>
              {viewMode === 'tables' && (
                <div className={cn('text-sm', 'text-zinc-400', 'mt-1', 'flex', 'items-center', 'gap-2')}>
                  {selectedRows.size > 0 ? (
                    <>
                      <span className={cn('text-blue-400', 'font-bold', 'bg-blue-500/10', 'px-2', 'py-0.5', 'rounded-md')}>
                        {selectedRows.size} selected
                      </span>
                      <button 
                        onClick={() => setShowDeleteModal(true)}
                        className={cn('px-2', 'py-0.5', 'rounded-md', 'bg-red-500/20', 'text-red-400', 'hover:bg-red-500/30', 'font-bold', 'text-xs', 'transition-colors')}
                      >
                        Delete
                      </button>
                      <button 
                        onClick={() => setSelectedRows(new Set())}
                        className={cn('text-xs', 'hover:text-foreground', 'underline', 'decoration-dotted', 'underline-offset-2')}
                      >
                        Clear selection
                      </button>
                    </>
                  ) : (
                    <span>{total} total rows (All records loaded)</span>
                  )}
                </div>
              )}
            </div>
          </div>
          {viewMode === 'tables' && (
            <button 
              onClick={fetchTableData} 
              className={cn("text-zinc-400", "hover:text-foreground", "transition-colors", dataLoading ? "animate-spin" : "")} 
              title="Refresh data"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
            </button>
          )}
        </div>

        {/* Table Selector Hub Bar */}
        {viewMode === 'tables' && (
          <div className="px-4 py-2.5 glass-panel border-y-0 bg-zinc-950/80 flex items-center gap-2 overflow-x-auto scrollbar-none">
            <span className="text-[10px] font-extrabold uppercase text-zinc-500 tracking-wider shrink-0 mr-1">
              Select Table:
            </span>
            {tables.map((tbl) => (
              <button
                key={tbl.name}
                onClick={() => {
                  setActiveTable(tbl);
                  setRowSearch('');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 flex items-center gap-2 ${
                  activeTable?.name === tbl.name
                    ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                <span>{tbl.name}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                  activeTable?.name === tbl.name ? 'bg-zinc-950/30 text-zinc-950 font-extrabold' : 'bg-zinc-950 text-zinc-400'
                }`}>
                  {tbl.count}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Search bar between title and tables */}
        {viewMode === 'tables' && (
          <div className={cn('p-4', 'glass-panel', 'border-y-0', 'bg-foreground/[0.02]')}>
            <div className={cn('relative', 'flex', 'items-center')}>
              <svg className={cn('absolute', 'left-3', 'text-zinc-500')} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input 
                type="text" 
                placeholder={`Search in ${activeTable?.name || 'table'}...`} 
                value={rowSearch}
                onChange={(e) => setRowSearch(e.target.value)}
                className={cn('w-full', 'bg-foreground/5', 'text-sm', 'text-foreground', 'placeholder:text-zinc-500', 'pl-9', 'pr-4', 'py-2', 'rounded-lg', 'outline-none', 'focus:ring-1', 'focus:ring-foreground/20', 'transition-all')}
              />
            </div>
          </div>
        )}

        {/* Data Table */}
        <div className={cn('flex-1', 'overflow-auto', 'p-2', 'md:p-6', 'custom-scrollbar', 'glass-panel', 'rounded-b-3xl')}>
          {viewMode === 'recycle_bin' ? (
            <div className={cn('inline-block', 'min-w-full', 'align-middle', 'border', 'border-[var(--glass-border)]', 'rounded-2xl', 'overflow-hidden', 'bg-background/50', 'backdrop-blur-md', 'shadow-2xl')}>
               <table className={cn('min-w-full', 'divide-y', 'divide-[var(--glass-border)]')}>
                  <thead className={cn('bg-foreground/5', 'backdrop-blur-xl', 'sticky', 'top-0', 'z-10')}>
                    <tr className={cn('divide-x', 'divide-[var(--glass-border)]')}>
                      <th className={cn('px-4', 'py-3', 'text-left', 'text-xs', 'font-semibold', 'text-gray-400', 'uppercase')}>Deleted At</th>
                      <th className={cn('px-4', 'py-3', 'text-left', 'text-xs', 'font-semibold', 'text-gray-400', 'uppercase')}>Table</th>
                      <th className={cn('px-4', 'py-3', 'text-left', 'text-xs', 'font-semibold', 'text-gray-400', 'uppercase')}>Data Snapshot</th>
                    </tr>
                  </thead>
                  <tbody className={cn('divide-y', 'divide-[var(--glass-border)]', 'bg-transparent')}>
                    {recycleBinData.map((record, i) => (
                      <tr key={i} className={cn('hover:bg-foreground/5', 'transition-colors', 'divide-x', 'divide-[var(--glass-border)]')}>
                        <td className={cn('px-4', 'py-3', 'text-sm', 'text-foreground/80', 'whitespace-nowrap', 'align-top')}>{new Date(record.deletedAt).toLocaleString()}</td>
                        <td className={cn('px-4', 'py-3', 'text-sm', 'text-blue-400', 'font-bold', 'align-top')}>{record.tableName}</td>
                        <td className={cn('px-4', 'py-3', 'text-sm', 'text-foreground/60', 'max-w-3xl')}>
                          <pre className={cn('overflow-x-auto', 'text-xs', 'bg-black/30', 'p-4', 'rounded-xl', 'border', 'border-[var(--glass-border)]')}>{JSON.stringify(record.data, null, 2)}</pre>
                        </td>
                      </tr>
                    ))}
                    {recycleBinData.length === 0 && (
                      <tr><td colSpan={3} className="text-center p-8 text-zinc-500 font-medium">Recycle bin is empty.</td></tr>
                    )}
                  </tbody>
               </table>
            </div>
          ) : dataLoading ? (
            <div className={cn('flex', 'items-center', 'justify-center', 'h-full', 'text-zinc-500', 'font-medium')}>Loading data...</div>
          ) : tableData.length === 0 ? (
            <div className={cn('flex', 'items-center', 'justify-center', 'h-full', 'text-zinc-500', 'font-medium')}>No data found in this table.</div>
          ) : (
            <div className={cn('inline-block', 'min-w-full', 'align-middle', 'border', 'border-[var(--glass-border)]', 'rounded-2xl', 'overflow-hidden', 'bg-background/50', 'backdrop-blur-md', 'shadow-2xl')}>
              <table className={cn('min-w-full', 'divide-y', 'divide-[var(--glass-border)]')}>
                <thead className={cn('bg-foreground/5', 'backdrop-blur-xl', 'sticky', 'top-0', 'z-10')}>
                  <tr className={cn('divide-x', 'divide-[var(--glass-border)]')}>
                    <th scope="col" className={cn('px-4', 'py-3', 'w-12', 'text-center')}>
                      <input 
                        type="checkbox" 
                        className={cn('rounded', 'border-zinc-500', 'bg-transparent', 'text-foreground', 'focus:ring-foreground/20')}
                        checked={selectedRows.size > 0 && selectedRows.size === tableData.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRows(new Set(tableData.map((_, i) => i)));
                          } else {
                            setSelectedRows(new Set());
                          }
                        }}
                      />
                    </th>
                    {activeTable?.fields.map(field => (
                      <th 
                        key={field.name} 
                        scope="col" 
                        onClick={() => {
                          let direction: 'asc' | 'desc' = 'asc';
                          if (sortConfig && sortConfig.key === field.name && sortConfig.direction === 'asc') {
                            direction = 'desc';
                          }
                          setSortConfig({ key: field.name, direction });
                        }}
                        className={cn('px-4', 'py-3', 'text-left', 'text-xs', 'font-semibold', 'text-gray-400', 'uppercase', 'tracking-wider', 'whitespace-nowrap', 'cursor-pointer', 'hover:text-foreground', 'transition-colors')}
                      >
                        <div className={cn('flex', 'items-center', 'gap-2')}>
                          <span>{field.name}</span>
                          {field.isId && <span className={cn('text-blue-500')} title="Primary Key">🔑</span>}
                          {field.kind === 'object' && <span className={cn('text-zinc-400')} title="Relation (Foreign Key)">🔗</span>}
                          
                          {/* Sort Icon */}
                          <div className={cn('text-zinc-500', sortConfig?.key === field.name ? 'text-foreground' : 'opacity-50 group-hover:opacity-100')}>
                            {sortConfig?.key === field.name ? (
                              sortConfig.direction === 'asc' ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                              )
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>
                            )}
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className={cn('divide-y', 'divide-[var(--glass-border)]', 'bg-transparent')}>
                  {dataLoading ? (
                    <>
                      <TableRowSkeleton />
                      <TableRowSkeleton />
                      <TableRowSkeleton />
                      <TableRowSkeleton />
                      <TableRowSkeleton />
                      <TableRowSkeleton />
                    </>
                  ) : tableData
                    .filter(row => Object.values(row).some(v => String(v).toLowerCase().includes(rowSearch.toLowerCase())))
                    .sort((a, b) => {
                      if (!sortConfig) return 0;
                      const aVal = a[sortConfig.key];
                      const bVal = b[sortConfig.key];
                      
                      if (aVal === null || aVal === undefined) return sortConfig.direction === 'asc' ? -1 : 1;
                      if (bVal === null || bVal === undefined) return sortConfig.direction === 'asc' ? 1 : -1;
                      
                      if (typeof aVal === 'string' && typeof bVal === 'string') {
                        return sortConfig.direction === 'asc' 
                          ? aVal.localeCompare(bVal) 
                          : bVal.localeCompare(aVal);
                      }
                      
                      return sortConfig.direction === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
                    })
                    .map((row, i) => {
                      // We use index as a temporary ID for selection, ideally we'd use the primary key if available.
                      // Since we sort, we should map based on original index or just the current mapped index.
                      // Let's just use the 'id' field if it exists, otherwise the mapped index.
                      const rowId = row.id !== undefined ? row.id : i;
                      const isSelected = selectedRows.has(rowId);
                      
                      return (
                      <tr 
                        key={i} 
                        onClick={() => {
                          const newSet = new Set(selectedRows);
                          if (newSet.has(rowId)) newSet.delete(rowId);
                          else newSet.add(rowId);
                          setSelectedRows(newSet);
                        }}
                        className={cn(
                          'transition-colors', 'divide-x', 'divide-[var(--glass-border)]', 'group', 'cursor-pointer',
                          isSelected ? 'bg-foreground/10' : 'hover:bg-foreground/5'
                        )}
                      >
                        <td className={cn('px-4', 'py-3', 'text-center')}>
                          <input 
                            type="checkbox" 
                            checked={isSelected}
                            readOnly
                            className={cn('rounded', 'border-zinc-500', 'bg-transparent', 'text-foreground')}
                          />
                        </td>
                        {activeTable?.fields.map(field => {
                          const val = row[field.name];
                          const isNull = val === null || val === undefined;
                          let displayVal = String(val);
                          
                          if (field.kind === 'object' && isNull) {
                            displayVal = '';
                          } else if (field.type === 'DateTime' && val) {
                          const date = new Date(val);
                          
                          if (!isNaN(date.getTime())) {
                            const getOrdinalSuffix = (d: number) => {
                              if (d > 3 && d < 21) return 'th';
                              switch (d % 10) {
                                case 1:  return 'st';
                                case 2:  return 'nd';
                                case 3:  return 'rd';
                                default: return 'th';
                              }
                            };
                            
                            const dayStr = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric' }).format(date);
                            const day = parseInt(dayStr, 10);
                            const month = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', month: 'long' }).format(date).toLowerCase();
                            const year = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(date);
                            const time = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
                            
                            displayVal = `${day}${getOrdinalSuffix(day)} ${month} ${year}, ${time.toLowerCase()}`;
                          }
                        } else if (typeof val === 'string' && val.length > 50) {
                          // Truncate long strings
                          displayVal = val.substring(0, 50) + '...';
                        }
                        
                        const isEditing = editingCell?.rowIndex === i && editingCell?.field === field.name;
                        
                        return (
                          <td 
                            key={field.name} 
                            onDoubleClick={() => {
                              if (field.kind !== 'object' && !field.isId && field.type !== 'DateTime' && field.type !== 'Json') {
                                setEditingCell({ rowId, rowIndex: i, field: field.name, value: val === null ? '' : val });
                              }
                            }}
                            className={cn('px-4', 'py-3', 'text-sm', 'text-foreground/80', 'whitespace-nowrap', 'max-w-[300px]', 'overflow-hidden', 'text-ellipsis', 'group-hover:text-foreground', 'transition-colors', !isEditing && field.kind !== 'object' && !field.isId && field.type !== 'DateTime' && field.type !== 'Json' ? 'cursor-text hover:bg-foreground/5' : '')}
                          >
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <input 
                                  autoFocus
                                  type={field.type === 'Int' || field.type === 'Float' ? 'number' : field.type === 'Boolean' ? 'checkbox' : 'text'}
                                  checked={field.type === 'Boolean' ? editingCell.value : undefined}
                                  value={field.type === 'Boolean' ? undefined : editingCell.value}
                                  onChange={(e) => setEditingCell({ ...editingCell, value: field.type === 'Boolean' ? e.target.checked : e.target.value })}
                                  className={cn('bg-background', 'text-foreground', 'border', 'border-zinc-500', 'rounded', 'px-2', 'py-1', 'text-xs', 'w-full', 'min-w-[100px]')}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEdit();
                                    if (e.key === 'Escape') setEditingCell(null);
                                  }}
                                />
                                <button onClick={saveEdit} className="text-green-400 hover:text-green-300 transition-colors bg-green-400/10 p-1 rounded">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                                </button>
                                <button onClick={() => setEditingCell(null)} className="text-red-400 hover:text-red-300 transition-colors bg-red-400/10 p-1 rounded">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                              </div>
                            ) : field.kind === 'object' && isNull ? (
                               <button 
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   const targetTable = tables.find(t => t.name === field.type);
                                   if (targetTable) {
                                     let searchTerm = '';
                                     if (row[field.name + 'Id'] !== undefined && row[field.name + 'Id'] !== null) {
                                       searchTerm = String(row[field.name + 'Id']);
                                     } else {
                                       const pkField = activeTable?.fields.find(f => f.isId);
                                       if (pkField && row[pkField.name] !== undefined && row[pkField.name] !== null) {
                                         searchTerm = String(row[pkField.name]);
                                       } else if (row.id !== undefined && row.id !== null) {
                                         searchTerm = String(row.id);
                                       }
                                     }
                                     setActiveTable(targetTable);
                                     setRowSearch(searchTerm);
                                   }
                                 }}
                                 className={cn('px-2', 'py-1', 'rounded', 'bg-zinc-500/10', 'text-zinc-400', 'hover:bg-blue-500/20', 'hover:text-blue-400', 'transition-colors', 'text-[10px]', 'uppercase', 'tracking-widest', 'font-bold', 'cursor-pointer')}
                               >
                                 View {field.type}
                               </button>
                            ) : isNull ? (
                              <span className={cn('text-zinc-600', 'italic')}>null</span>
                            ) : typeof val === 'boolean' ? (
                              <span className={`px-2 py-0.5 rounded text-xs font-bold tracking-wider ${val ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {val ? 'TRUE' : 'FALSE'}
                              </span>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <span title={String(val)}>{displayVal}</span>
                                {field.kind !== 'object' && !field.isId && field.type !== 'DateTime' && field.type !== 'Json' && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingCell({ rowId, rowIndex: i, field: field.name, value: val === null ? '' : val });
                                    }}
                                    className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-zinc-500 hover:text-foreground transition-opacity shrink-0 p-1 bg-foreground/5 hover:bg-foreground/10 rounded"
                                    title="Edit"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className={cn('fixed', 'inset-0', 'bg-background/80', 'backdrop-blur-sm', 'z-50', 'flex', 'items-center', 'justify-center', 'p-4')}>
          <div className={cn('glass-panel', 'max-w-sm', 'w-full', 'rounded-2xl', 'p-6', 'shadow-2xl', 'border', 'border-[var(--glass-border)]')}>
            <h3 className={cn('text-xl', 'font-black', 'tracking-tight', 'text-foreground', 'mb-2')}>Confirm Deletion</h3>
            <p className={cn('text-zinc-400', 'text-sm', 'mb-6')}>
              Are you sure you want to delete <strong className="text-foreground">{selectedRows.size}</strong> row(s) from <strong className="text-foreground">{activeTable?.name}</strong>? 
              They will be moved to the Recycle Bin.
            </p>
            <div className={cn('flex', 'justify-end', 'gap-3')}>
              <button 
                onClick={() => setShowDeleteModal(false)}
                className={cn('px-4', 'py-2', 'rounded-lg', 'text-sm', 'font-medium', 'text-zinc-300', 'hover:bg-foreground/10', 'transition-colors')}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button 
                onClick={deleteSelected}
                disabled={deleteLoading}
                className={cn('px-4', 'py-2', 'rounded-lg', 'text-sm', 'font-bold', 'bg-red-500', 'text-white', 'hover:bg-red-600', 'transition-colors', 'flex', 'items-center', 'gap-2')}
              >
                {deleteLoading ? (
                  <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                )}
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4B5563; }
      `}} />
    </div>
  );
}
