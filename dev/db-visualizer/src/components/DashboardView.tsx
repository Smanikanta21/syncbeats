"use client";

import { useEffect, useState } from "react";
import WorldMap, { GeoLocationItem } from "./WorldMap";
import { MetricCardSkeleton, MapSkeleton, TableRowSkeleton } from "./Skeleton";
interface DashboardViewProps {
  onNavigateTable?: (tableName: string, searchStr?: string) => void;
}

export default function DashboardView({ onNavigateTable }: DashboardViewProps) {
  const [windowFilter, setWindowFilter] = useState("15m");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [geoLocations, setGeoLocations] = useState<GeoLocationItem[]>([]);
  const [userSearch, setUserSearch] = useState("");

  const fetchDashboardStats = async (windowParam: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/stats?window=${windowParam}`);
      if (res.ok) {
        const statsData = await res.json();
        setData(statsData);

        // Fetch IP locations for unique IPs
        if (statsData.uniqueIps && statsData.uniqueIps.length > 0) {
          const geoRes = await fetch("/api/dashboard/geo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ips: statsData.uniqueIps }),
          });
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            const locArray: GeoLocationItem[] = Object.values(geoData.geoData || {});
            
            // Associate users with location items
            locArray.forEach((loc) => {
              loc.users = statsData.users
                .filter((u: any) => u.devices.some((d: any) => d.ip === loc.ip))
                .map((u: any) => ({
                  id: u.id,
                  name: u.name,
                  email: u.email,
                  deviceName: u.devices[0]?.name,
                }));
            });

            setGeoLocations(locArray);
          }
        } else {
          setGeoLocations([]);
        }
      }
    } catch (err) {
      console.error("[Dashboard Fetch Error]:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats(windowFilter);
  }, [windowFilter]);

  const filteredUsers = (data?.users || []).filter((u: any) => {
    if (!userSearch) return true;
    const query = userSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(query) ||
      u.email.toLowerCase().includes(query) ||
      u.devices.some(
        (d: any) =>
          d.name.toLowerCase().includes(query) ||
          d.os.toLowerCase().includes(query) ||
          d.ip.toLowerCase().includes(query)
      )
    );
  });

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 bg-zinc-950 text-white">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              SYNCBEATS <span className="text-white">Dashboard</span>
            </h1>
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-lg">
              Live Console
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">Real-time user analytics, device activity, IP locations & system health</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Time Window Selector */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-2xl p-1 shadow-inner">
            {[
              { id: "5m", label: "5m" },
              { id: "15m", label: "15m" },
              { id: "1h", label: "1h" },
              { id: "24h", label: "24h" },
              { id: "7d", label: "7d" },
              { id: "30d", label: "30d" },
              { id: "all", label: "All" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setShowCustomPicker(false);
                  setWindowFilter(t.id);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  windowFilter === t.id && !showCustomPicker
                    ? "bg-white text-zinc-950 shadow-md"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}

            <button
              onClick={() => setShowCustomPicker(!showCustomPicker)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                showCustomPicker ? "bg-white text-zinc-950 shadow-md" : "text-zinc-400 hover:text-white"
              }`}
            >
              Custom...
            </button>
          </div>

          {showCustomPicker && (
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-2 text-xs">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-white rounded-xl px-2 py-1 text-xs focus:outline-none"
              />
              <span className="text-zinc-500">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-white rounded-xl px-2 py-1 text-xs focus:outline-none"
              />
              <button
                onClick={() => fetchDashboardStats(`custom_${customStartDate}_${customEndDate}`)}
                className="px-3 py-1 bg-white text-zinc-950 font-bold rounded-xl text-xs shadow-md"
              >
                Apply Range
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          <>
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </>
        ) : (
          <>
            {/* Total Users */}
            <div className="p-6 bg-zinc-900/80 border border-zinc-800/80 rounded-3xl shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Users</span>
                <span className="p-2 rounded-xl bg-zinc-800 text-emerald-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </span>
              </div>
              <div className="text-3xl font-extrabold text-white">{data?.metrics?.totalUsers || 0}</div>
              <p className="text-[11px] text-zinc-400 mt-2">Registered accounts in database</p>
            </div>

            {/* Active in Window */}
            <div className="p-6 bg-zinc-900/80 border border-zinc-800/80 rounded-3xl shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Active ({windowFilter})</span>
                <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>
                </span>
              </div>
              <div className="text-3xl font-extrabold text-emerald-400">{data?.metrics?.activeInWindowCount || 0}</div>
              <p className="text-[11px] text-zinc-400 mt-2">Active in selected time window</p>
            </div>

            {/* Online Now */}
            <div className="p-6 bg-zinc-900/80 border border-zinc-800/80 rounded-3xl shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Online Now</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <div className="text-3xl font-extrabold text-white">{data?.metrics?.onlineNowCount || 0}</div>
              <p className="text-[11px] text-zinc-400 mt-2">Connected in last 5 minutes</p>
            </div>

            {/* Total Devices */}
            <div className="p-6 bg-zinc-900/80 border border-zinc-800/80 rounded-3xl shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between text-zinc-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">Devices & Locations</span>
                <span className="p-2 rounded-xl bg-zinc-800 text-teal-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                </span>
              </div>
              <div className="text-3xl font-extrabold text-white">{data?.metrics?.totalDevices || 0}</div>
              <p className="text-[11px] text-zinc-400 mt-2">{geoLocations.length} Geocoded IP locations</p>
            </div>
          </>
        )}
      </div>

      {/* World Map Section */}
      {loading && geoLocations.length === 0 ? <MapSkeleton /> : <WorldMap locations={geoLocations} />}

      {/* Device OS & Browser Distribution Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* OS Distribution */}
        <div className="p-6 bg-zinc-900/80 border border-zinc-800/80 rounded-3xl shadow-xl backdrop-blur-xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
            Operating Systems Distribution
          </h3>
          <div className="space-y-3">
            {Object.entries(data?.osDistribution || {}).length === 0 ? (
              <p className="text-xs text-zinc-500">No device OS data collected yet</p>
            ) : (
              Object.entries(data?.osDistribution || {}).map(([os, count]: any) => {
                const total = Object.values(data?.osDistribution || {}).reduce((a: any, b: any) => a + b, 0) as number;
                const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={os} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-zinc-300">{os}</span>
                      <span className="text-emerald-400 font-mono">{count} ({percentage}%)</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Browser Distribution */}
        <div className="p-6 bg-zinc-900/80 border border-zinc-800/80 rounded-3xl shadow-xl backdrop-blur-xl space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-400"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
            Browsers Distribution
          </h3>
          <div className="space-y-3">
            {Object.entries(data?.browserDistribution || {}).length === 0 ? (
              <p className="text-xs text-zinc-500">No browser data collected yet</p>
            ) : (
              Object.entries(data?.browserDistribution || {}).map(([browser, count]: any) => {
                const total = Object.values(data?.browserDistribution || {}).reduce((a: any, b: any) => a + b, 0) as number;
                const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={browser} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-zinc-300">{browser}</span>
                      <span className="text-teal-400 font-mono">{count} ({percentage}%)</span>
                    </div>
                    <div className="w-full h-2 bg-zinc-950 rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* User Directory & Device Activity Table */}
      <div className="p-6 bg-zinc-900/80 border border-zinc-800/80 rounded-3xl shadow-xl backdrop-blur-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white">Active Users & Device Directory</h3>
            <p className="text-xs text-zinc-400 mt-0.5">Filter by user name, email, IP address, or device OS</p>
          </div>

          <div className="relative">
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users, IPs, devices..."
              className="w-full sm:w-64 px-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="bg-zinc-950/80 text-zinc-400 uppercase font-semibold border-b border-zinc-800">
              <tr>
                <th className="py-3.5 px-4">User</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Auth Provider</th>
                <th className="py-3.5 px-4">Devices & IP Address</th>
                <th className="py-3.5 px-4">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <>
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                  <TableRowSkeleton />
                </>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">
                    No users match your criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u: any) => {
                  const firstDev = u.devices[0];
                  const geo = firstDev?.ip ? geoLocations.find((g) => g.ip === firstDev.ip) : null;

                  return (
                    <tr
                      key={u.id}
                      onClick={() => onNavigateTable && onNavigateTable("User", u.email)}
                      className="hover:bg-zinc-800/60 transition-colors cursor-pointer group"
                      title="Click to inspect user in Database Tables"
                    >
                      {/* User Info */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-white text-sm group-hover:text-emerald-400 transition-colors flex items-center gap-2">
                          <span>{u.name}</span>
                          <span className="text-[10px] text-zinc-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity">Inspect →</span>
                        </div>
                        <div className="text-zinc-400 text-xs font-mono">{u.email}</div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        {u.isOnlineNow ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Online Now
                          </span>
                        ) : u.isRecentlyActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                            Recently Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-400 font-medium">
                            Offline
                          </span>
                        )}
                      </td>

                      {/* Auth Provider */}
                      <td className="py-4 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 font-mono text-[11px] uppercase font-bold">
                          {u.authProvider}
                        </span>
                      </td>

                      {/* Devices & IP */}
                      <td className="py-4 px-4">
                        {u.devices.length === 0 ? (
                          <span className="text-zinc-500 italic">No device logged</span>
                        ) : (
                          <div className="space-y-1">
                            {u.devices.slice(0, 2).map((d: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="font-medium text-white">{d.name}</span>
                                <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md font-mono">{d.os}</span>
                                <span className="text-[10px] font-mono text-zinc-300 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md">
                                  {d.ip}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Last Activity */}
                      <td className="py-4 px-4 text-zinc-400 font-mono text-[11px]">
                        {new Date(u.lastActivityAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Email Designer Modal */}
      {/* <EmailDesignerModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        users={data?.users || []}
      /> */}
    </div>
  );
}
