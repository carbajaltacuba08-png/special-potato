import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Moon,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Wrench
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import { INITIAL_STATE, TELEMETRY_SERIES, INITIAL_EVENTS } from './data/mockTelemetry';

export default function App() {
  const [telemetry, setTelemetry] = useState(INITIAL_STATE);
  const [timeRange, setTimeRange] = useState('24h');
  const [chartData, setChartData] = useState(TELEMETRY_SERIES);
  const [events, setEvents] = useState(INITIAL_EVENTS);
  const [secondsSinceSync, setSecondsSinceSync] = useState(3);
  const [darkMode, setDarkMode] = useState(false);
  const [simExpanded, setSimExpanded] = useState(true);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const pushEvent = useCallback((type, title, detail, code) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    setEvents((prev) => [
      {
        id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: timeStr,
        type,
        title,
        detail,
        code
      },
      ...prev.slice(0, 11)
    ]);
  }, []);

  const evaluateValveSafety = useCallback(
    (newTurbidity, newTds, currentMode, currentOpenState) => {
      const isUnsafe = newTurbidity > 4.0 || newTds > 1000;
      if (currentMode === 'AUTO') {
        if (isUnsafe) {
          return {
            isOpen: false,
            bypassActive: true,
            lastActionReason:
              newTurbidity > 4.0
                ? `Corte automático NOM-127 (${newTurbidity.toFixed(1)} NTU > 4.0 NTU)`
                : `Corte automático NOM-127 (${newTds} ppm > 1000 mg/L)`
          };
        }
        return {
          isOpen: true,
          bypassActive: false,
          lastActionReason: 'Parámetros en norma NOM-127-SSA1-2021'
        };
      }
      return {
        isOpen: currentOpenState,
        bypassActive: !currentOpenState,
        lastActionReason: `Override manual activo (${currentOpenState ? 'Abierta' : 'Cerrada'})`
      };
    },
    []
  );

  // Contador discreto de última muestra ("hace 3s")
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsSinceSync((prev) => (prev >= 5 ? 1 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Actualizar condiciones desde el Simulador de Condiciones de Red
  const updateNetworkParameters = useCallback(
    ({ turbidity, tds, tempInlet, levelPercent, logReason }) => {
      setSecondsSinceSync(1);
      setTelemetry((prev) => {
        const nextTurbidity = Number(
          (turbidity !== undefined ? turbidity : prev.inlet.turbidity).toFixed(1)
        );
        const nextTds = Math.round(tds !== undefined ? tds : prev.inlet.tds);
        const nextTemp = Number(
          (tempInlet !== undefined ? tempInlet : prev.inlet.temperature).toFixed(1)
        );
        const nextLevelPct =
          levelPercent !== undefined ? levelPercent : prev.tank.levelPercent;
        const nextVolume = Math.round((nextLevelPct / 100) * prev.tank.capacityLiters);
        const nextAutonomy = Number((nextVolume / 252.35).toFixed(1));
        const nextDistanceCm = Math.max(18, Math.round(160 - (nextLevelPct / 100) * 140));

        const valveEval = evaluateValveSafety(
          nextTurbidity,
          nextTds,
          prev.valve.mode,
          prev.valve.isOpen
        );

        if (prev.valve.isOpen && !valveEval.isOpen) {
          pushEvent(
            'critical',
            `Válvula cerrada por protección NOM-127 (${nextTurbidity} NTU / ${nextTds} ppm)`,
            'Derivación a cámara de bypass activada automáticamente.',
            'NOM-CUT'
          );
        } else if (!prev.valve.isOpen && valveEval.isOpen) {
          pushEvent(
            'success',
            `Válvula reabierta (${nextTurbidity} NTU / ${nextTds} ppm)`,
            'Calidad de entrada normalizada dentro de NOM-127-SSA1-2021.',
            'NOM-OK'
          );
        } else if (logReason) {
          pushEvent('info', logReason, `Lectura: ${nextTurbidity} NTU, ${nextTds} ppm`, 'SIM');
        }

        const timeLabel = new Date().toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        setChartData((prevSeries) => ({
          ...prevSeries,
          '1h': [
            ...prevSeries['1h'].slice(1),
            {
              time: timeLabel,
              level: nextVolume,
              turbidity: nextTurbidity,
              limit: 4.0,
              tds: nextTds,
              tandeo: true
            }
          ],
          '24h': [
            ...prevSeries['24h'].slice(0, -1),
            {
              time: 'Actual',
              level: nextVolume,
              turbidity: nextTurbidity,
              limit: 4.0,
              tds: nextTds,
              tandeo: true
            }
          ]
        }));

        return {
          ...prev,
          inlet: {
            ...prev.inlet,
            tds: nextTds,
            turbidity: nextTurbidity,
            temperature: nextTemp,
            flowRateLpm: valveEval.isOpen ? 14.2 : 0.0
          },
          valve: {
            ...prev.valve,
            ...valveEval
          },
          tank: {
            ...prev.tank,
            levelPercent: nextLevelPct,
            volumeLiters: nextVolume,
            autonomyDays: nextAutonomy,
            distanceCm: nextDistanceCm
          }
        };
      });
    },
    [evaluateValveSafety, pushEvent]
  );

  const handleToggleValveSwitch = () => {
    setTelemetry((prev) => {
      const nextOpen = !prev.valve.isOpen;
      pushEvent(
        nextOpen && (prev.inlet.turbidity > 4.0 || prev.inlet.tds > 1000) ? 'critical' : 'warning',
        `Conmutación manual de válvula: ${nextOpen ? 'Abierta' : 'Cerrada'}`,
        `Modo manual activado por el operador (${prev.inlet.turbidity} NTU).`,
        'MAN-SW'
      );
      return {
        ...prev,
        inlet: {
          ...prev.inlet,
          flowRateLpm: nextOpen ? 14.2 : 0.0
        },
        valve: {
          ...prev.valve,
          mode: 'MANUAL',
          isOpen: nextOpen,
          bypassActive: !nextOpen,
          lastActionReason: `Override manual (${nextOpen ? 'Abierta' : 'Cerrada'})`
        }
      };
    });
  };

  const handleToggleAutoMode = () => {
    setTelemetry((prev) => {
      const nextMode = prev.valve.mode === 'AUTO' ? 'MANUAL' : 'AUTO';
      const valveEval = evaluateValveSafety(
        prev.inlet.turbidity,
        prev.inlet.tds,
        nextMode,
        prev.valve.isOpen
      );
      pushEvent(
        'info',
        nextMode === 'AUTO'
          ? 'Modo Automático NOM-127 activado'
          : 'Modo Override Manual seleccionado',
        valveEval.lastActionReason,
        nextMode === 'AUTO' ? 'MODE-AUTO' : 'MODE-MAN'
      );
      return {
        ...prev,
        inlet: {
          ...prev.inlet,
          flowRateLpm: valveEval.isOpen ? 14.2 : 0.0
        },
        valve: {
          ...prev.valve,
          mode: nextMode,
          ...valveEval
        }
      };
    });
  };

  // Semáforos sobrios con uso estricto del color semántico
  const tdsSemantic =
    telemetry.inlet.tds > 1000
      ? {
          label: 'Corte normativo',
          badge: 'bg-rose-50 text-[#B91C1C] border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
          bar: 'bg-[#B91C1C]'
        }
      : telemetry.inlet.tds >= 500
      ? {
          label: 'Precaución',
          badge: 'bg-amber-50 text-[#B45309] border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
          bar: 'bg-[#B45309]'
        }
      : {
          label: 'Normal',
          badge: 'bg-emerald-50 text-[#15803D] border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
          bar: 'bg-[#15803D]'
        };

  const turbiditySemantic =
    telemetry.inlet.turbidity > 4.0
      ? {
          label: 'Corte > 4.0 NTU',
          badge: 'bg-rose-50 text-[#B91C1C] border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
          bar: 'bg-[#B91C1C]'
        }
      : telemetry.inlet.turbidity >= 3.0
      ? {
          label: 'Aceptable',
          badge: 'bg-emerald-50 text-[#15803D] border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
          bar: 'bg-[#15803D]'
        }
      : {
          label: 'Óptimo',
          badge: 'bg-emerald-50 text-[#15803D] border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
          bar: 'bg-[#15803D]'
        };

  const isEmergencyCutoff = telemetry.inlet.turbidity > 4.0 || telemetry.inlet.tds > 1000;

  // Graduaciones en litros del tanque de 1,100 L
  const graduations = [1100, 825, 550, 275, 0];

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-zinc-950 text-[#0F172A] dark:text-zinc-100 pb-40 transition-colors">
      {/* =====================================================================
          1. ENCABEZADO SOBRIO DE INGENIERÍA
      ===================================================================== */}
      <header className="bg-[#FFFFFF] dark:bg-zinc-900 border-b border-[#E2E8F0] dark:border-zinc-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          {/* Identidad del sistema */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded bg-slate-900 dark:bg-zinc-100 flex items-center justify-center shrink-0">
              <svg
                className="w-4 h-4 text-white dark:text-zinc-900"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2.5 truncate">
              <h1 className="text-sm sm:text-base font-medium text-[#0F172A] dark:text-zinc-100 tracking-tight truncate">
                Purificando tu bienestar
              </h1>
              <span className="text-slate-300 dark:text-zinc-700 hidden sm:inline">/</span>
              <span className="text-xs font-mono text-[#64748B] dark:text-zinc-400 hidden sm:inline">
                Nodo Residencial Los Cabos #01
              </span>
            </div>
          </div>

          {/* Estado de conexión minimalista + Toggle de Tema */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs text-[#64748B] dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800/70 px-2.5 py-1 rounded border border-[#E2E8F0] dark:border-zinc-800">
              <span className="w-1.5 h-1.5 rounded-full bg-[#15803D] shrink-0" />
              <span className="font-medium text-[#0F172A] dark:text-zinc-200">ESP32</span>
              <span>•</span>
              <span className="hidden md:inline">En línea ({telemetry.wifi.rssi} dBm)</span>
              <span className="hidden md:inline">•</span>
              <span className="font-mono">Última muestra: hace {secondsSinceSync}s</span>
            </div>

            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              title="Cambiar tema claro / oscuro"
              className="p-1.5 rounded border border-[#E2E8F0] dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[#64748B] hover:text-[#0F172A] dark:text-zinc-400 dark:hover:text-zinc-100 transition"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Contenedor Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Aviso de corte activo sobrio (solo cuando se supera el umbral NOM-127) */}
        {isEmergencyCutoff && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/80 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-[#B91C1C] dark:text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
              <p className="text-xs sm:text-sm text-[#B91C1C] dark:text-rose-200 font-medium">
                Corte preventivo NOM-127-SSA1-2021 activo:{' '}
                <span className="font-normal">
                  {telemetry.inlet.turbidity > 4.0
                    ? `Turbidez de entrada (${telemetry.inlet.turbidity.toFixed(1)} NTU) supera el límite normativo de 4.0 NTU.`
                    : `Sólidos disueltos (${telemetry.inlet.tds} ppm) superan el límite normativo de 1,000 mg/L.`}{' '}
                  Válvula de admisión cerrada; flujo desviado a bypass.
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                updateNetworkParameters({
                  turbidity: 3.2,
                  tds: 680,
                  tempInlet: 24.5,
                  levelPercent: 78,
                  logReason: 'Restablecimiento a parámetros nominales'
                })
              }
              className="text-xs font-medium text-[#B91C1C] dark:text-rose-300 border border-rose-300 dark:border-rose-700 bg-white dark:bg-zinc-900 px-2.5 py-1 rounded hover:bg-rose-100/50 transition self-start sm:self-auto shrink-0"
            >
              Restablecer valores nominales
            </button>
          </div>
        )}

        {/* ===================================================================
            2. ORGANIZACIÓN EN 2 COLUMNAS DE INGENIERÍA
        =================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* -----------------------------------------------------------------
              COLUMNA IZQUIERDA: Toma de Red / Bypass Activo (6 columnas)
          ----------------------------------------------------------------- */}
          <section className="lg:col-span-6 bg-[#FFFFFF] dark:bg-zinc-900 border border-[#E2E8F0] dark:border-zinc-800 rounded-lg shadow-sm p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-zinc-800 pb-3.5">
              <div>
                <h2 className="text-base font-medium text-[#0F172A] dark:text-zinc-100">
                  Toma de Red / Bypass Activo
                </h2>
                <p className="text-xs text-[#64748B] dark:text-zinc-400 mt-0.5">
                  Monitoreo en línea de derivación municipal • Norma NOM-127-SSA1-2021
                </p>
              </div>
              <span className="text-xs font-mono text-[#64748B] dark:text-zinc-400">
                Caudal: {telemetry.inlet.flowRateLpm.toFixed(1)} L/min
              </span>
            </div>

            {/* Tarjetas compactas tipo KPI (3 métricas) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* KPI 1: Sólidos Disueltos (TDS) */}
              <div className="border border-[#E2E8F0] dark:border-zinc-800 rounded-md p-3.5 bg-[#FFFFFF] dark:bg-zinc-900 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs uppercase tracking-wider text-[#64748B] dark:text-zinc-400 font-medium">
                    Sólidos Disueltos (TDS)
                  </span>
                </div>

                <div className="my-2.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-mono font-semibold text-[#0F172A] dark:text-zinc-100">
                      {telemetry.inlet.tds}
                    </span>
                    <span className="text-xs font-mono text-[#64748B] dark:text-zinc-400">
                      ppm
                    </span>
                  </div>
                  <span
                    className={`inline-block mt-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded border ${tdsSemantic.badge}`}
                  >
                    {tdsSemantic.label}
                  </span>
                </div>

                {/* Barra horizontal minimalista de 4px (h-1) */}
                <div className="space-y-1 pt-1">
                  <div className="relative w-full h-1 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${tdsSemantic.bar}`}
                      style={{
                        width: `${Math.min(100, (telemetry.inlet.tds / 1200) * 100)}%`
                      }}
                    />
                    {/* Marca del límite 1000 mg/L (83.3%) */}
                    <div
                      className="absolute top-0 bottom-0 w-[1.5px] bg-slate-900 dark:bg-white"
                      style={{ left: '83.3%' }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-[#64748B] dark:text-zinc-500">
                    <span>0</span>
                    <span>Límite &lt; 1000 mg/L</span>
                  </div>
                </div>
              </div>

              {/* KPI 2: Turbidez */}
              <div className="border border-[#E2E8F0] dark:border-zinc-800 rounded-md p-3.5 bg-[#FFFFFF] dark:bg-zinc-900 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs uppercase tracking-wider text-[#64748B] dark:text-zinc-400 font-medium">
                    Turbidez
                  </span>
                </div>

                <div className="my-2.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-mono font-semibold text-[#0F172A] dark:text-zinc-100">
                      {telemetry.inlet.turbidity.toFixed(1)}
                    </span>
                    <span className="text-xs font-mono text-[#64748B] dark:text-zinc-400">
                      NTU
                    </span>
                  </div>
                  <span
                    className={`inline-block mt-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded border ${turbiditySemantic.badge}`}
                  >
                    {turbiditySemantic.label}
                  </span>
                </div>

                {/* Barra horizontal minimalista de 4px (h-1) */}
                <div className="space-y-1 pt-1">
                  <div className="relative w-full h-1 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${turbiditySemantic.bar}`}
                      style={{
                        width: `${Math.min(100, (telemetry.inlet.turbidity / 8.0) * 100)}%`
                      }}
                    />
                    {/* Marca del límite 4.0 NTU (50%) */}
                    <div
                      className="absolute top-0 bottom-0 w-[1.5px] bg-[#B91C1C]"
                      style={{ left: '50%' }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-[#64748B] dark:text-zinc-500">
                    <span>0</span>
                    <span>Límite &lt; 4.0 NTU</span>
                  </div>
                </div>
              </div>

              {/* KPI 3: Temperatura */}
              <div className="border border-[#E2E8F0] dark:border-zinc-800 rounded-md p-3.5 bg-[#FFFFFF] dark:bg-zinc-900 flex flex-col justify-between">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs uppercase tracking-wider text-[#64748B] dark:text-zinc-400 font-medium">
                    Temperatura
                  </span>
                </div>

                <div className="my-2.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-mono font-semibold text-[#0F172A] dark:text-zinc-100">
                      {telemetry.inlet.temperature.toFixed(1)}
                    </span>
                    <span className="text-xs font-mono text-[#64748B] dark:text-zinc-400">
                      °C
                    </span>
                  </div>
                  <span className="inline-block mt-1.5 text-[11px] font-medium px-1.5 py-0.5 rounded border bg-slate-50 text-[#64748B] border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
                    Sonda DS18B20
                  </span>
                </div>

                {/* Barra horizontal minimalista de 4px (h-1) */}
                <div className="space-y-1 pt-1">
                  <div className="relative w-full h-1 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-600 dark:bg-zinc-400 transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, ((telemetry.inlet.temperature - 10) / 30) * 100)
                        )}%`
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-[#64748B] dark:text-zinc-500">
                    <span>10 °C</span>
                    <span>Ref. 25 °C</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Módulo de Corte: Válvula de admisión (Solenoide 12V) */}
            <div className="border border-[#E2E8F0] dark:border-zinc-800 rounded-md p-4 bg-slate-50/60 dark:bg-zinc-800/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#0F172A] dark:text-zinc-100">
                      Válvula de admisión (Solenoide 12V)
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded border ${
                        telemetry.valve.isOpen
                          ? 'bg-emerald-50 text-[#15803D] border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-rose-50 text-[#B91C1C] border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          telemetry.valve.isOpen ? 'bg-[#15803D]' : 'bg-[#B91C1C]'
                        }`}
                      />
                      [
                      {telemetry.valve.isOpen ? 'Abierta' : 'Cerrada'} -{' '}
                      {telemetry.valve.mode === 'AUTO'
                        ? 'Modo Automático NOM-127'
                        : 'Override Manual'}
                      ]
                    </span>
                  </div>
                </div>

                {/* Controles: Switch OS estándar + Botón discreto outline */}
                <div className="flex items-center gap-3 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={handleToggleAutoMode}
                    className="px-2.5 py-1 rounded text-xs font-medium border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[#0F172A] dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 transition"
                  >
                    {telemetry.valve.mode === 'AUTO' ? 'Override manual' : 'Volver a Automático'}
                  </button>

                  {/* Switch Toggle estándar de sistema operativo */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={telemetry.valve.isOpen}
                    onClick={handleToggleValveSwitch}
                    title="Conmutar válvula solenoide 12V"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      telemetry.valve.isOpen
                        ? 'bg-[#15803D]'
                        : 'bg-slate-300 dark:bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        telemetry.valve.isOpen ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-[#E2E8F0] dark:border-zinc-800 flex items-center justify-between text-xs text-[#64748B] dark:text-zinc-400">
                <span>Regla de protección: Corte si Turbidez &gt; 4.0 NTU o TDS &gt; 1000 ppm</span>
                <span className="font-mono">
                  {telemetry.valve.bypassActive ? 'Bypass: Activo' : 'Bypass: En espera'}
                </span>
              </div>
            </div>
          </section>

          {/* -----------------------------------------------------------------
              COLUMNA DERECHA: Almacenamiento / Tinaco 1,100 L (6 columnas)
          ----------------------------------------------------------------- */}
          <section className="lg:col-span-6 bg-[#FFFFFF] dark:bg-zinc-900 border border-[#E2E8F0] dark:border-zinc-800 rounded-lg shadow-sm p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-zinc-800 pb-3.5">
              <div>
                <h2 className="text-base font-medium text-[#0F172A] dark:text-zinc-100">
                  Almacenamiento / Tinaco 1,100 L
                </h2>
                <p className="text-xs text-[#64748B] dark:text-zinc-400 mt-0.5">
                  Sensor ultrasónico JSN-SR04T • Distancia al espejo de agua:{' '}
                  <span className="font-mono text-[#0F172A] dark:text-zinc-200">
                    {telemetry.tank.distanceCm} cm
                  </span>
                </p>
              </div>
              <span className="text-xs font-mono font-medium text-[#0F172A] dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 px-2.5 py-1 rounded">
                {telemetry.tank.levelPercent}% — {telemetry.tank.volumeLiters} Litros
              </span>
            </div>

            {/* Cuerpo dividido: Nivel cilíndrico minimalista con graduación + Sub-métricas en lista compacta */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
              {/* Contenedor vertical cilíndrico minimalista con marcas de graduación (0, 275, 550, 825, 1100 L) */}
              <div className="sm:col-span-5 flex items-center justify-center gap-3 py-1">
                {/* Escala graduada en Litros */}
                <div className="h-44 flex flex-col justify-between text-right font-mono text-[11px] text-[#64748B] dark:text-zinc-400 select-none">
                  {graduations.map((mark) => (
                    <div key={mark} className="flex items-center justify-end gap-1.5">
                      <span>{mark} L</span>
                      <span className="w-2 h-[1px] bg-slate-300 dark:bg-zinc-700" />
                    </div>
                  ))}
                </div>

                {/* Columna de nivel líquida limpia */}
                <div className="relative w-24 h-44 rounded-md border border-[#E2E8F0] dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60 overflow-hidden flex flex-col justify-end p-1">
                  {/* Líneas guía horizontales internas */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none py-2">
                    {[0, 1, 2, 3, 4].map((idx) => (
                      <div
                        key={idx}
                        className="w-full border-b border-dashed border-slate-200/80 dark:border-zinc-700/60"
                      />
                    ))}
                  </div>

                  {/* Barra de nivel sólida y sobria */}
                  <div
                    className="relative w-full rounded-sm bg-slate-800 dark:bg-zinc-200 transition-all duration-500 flex items-end justify-center p-2"
                    style={{ height: `${telemetry.tank.levelPercent}%` }}
                  >
                    <span className="text-xs font-mono font-semibold text-white dark:text-zinc-900">
                      {telemetry.tank.levelPercent}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Sub-métricas del agua almacenada en formato lista compacta */}
              <div className="sm:col-span-7 space-y-3">
                <div className="text-xs uppercase tracking-wider text-[#64748B] dark:text-zinc-400 font-medium">
                  Calidad del agua en reposo
                </div>

                <div className="border border-[#E2E8F0] dark:border-zinc-800 rounded-md divide-y divide-[#E2E8F0] dark:divide-zinc-800">
                  {/* Fila 1: pH */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-[#0F172A] dark:text-zinc-200">
                        Potencial de Hidrógeno (pH)
                      </span>
                      <span className="block text-[11px] text-[#64748B] dark:text-zinc-400">
                        Rango NOM-127: 6.5 – 8.5
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-mono font-semibold text-[#0F172A] dark:text-zinc-100">
                        {telemetry.tank.ph.toFixed(1)}
                      </span>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 text-[#15803D] border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                        Óptimo
                      </span>
                    </div>
                  </div>

                  {/* Fila 2: TDS estabilizado */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-[#0F172A] dark:text-zinc-200">
                        TDS estabilizado
                      </span>
                      <span className="block text-[11px] text-[#64748B] dark:text-zinc-400">
                         Agua filtrada en cisterna/tinaco
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-mono font-semibold text-[#0F172A] dark:text-zinc-100">
                        {telemetry.tank.tdsStabilized} ppm
                      </span>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 text-[#15803D] border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                        Normal
                      </span>
                    </div>
                  </div>

                  {/* Fila 3: Temperatura interna */}
                  <div className="px-3.5 py-2.5 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-[#0F172A] dark:text-zinc-200">
                        Temp. interna
                      </span>
                      <span className="block text-[11px] text-[#64748B] dark:text-zinc-400">
                        Monitoreo térmico en almacenamiento
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-mono font-semibold text-[#0F172A] dark:text-zinc-100">
                        {telemetry.tank.temperatureInternal.toFixed(1)} °C
                      </span>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-[#64748B] border border-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
                        Estable
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Estimación de autonomía: Texto plano informativo con icono sutil */}
            <div className="pt-3 border-t border-[#E2E8F0] dark:border-zinc-800 flex items-center justify-between text-xs text-[#64748B] dark:text-zinc-400">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                <span>
                  Aprox.{' '}
                  <strong className="font-mono font-medium text-[#0F172A] dark:text-zinc-200">
                    {telemetry.tank.autonomyDays} días
                  </strong>{' '}
                  de reserva para consumo familiar habitual
                </span>
              </div>
              <span className="font-mono hidden sm:inline">
                {telemetry.tank.volumeLiters} / 1,100 L
              </span>
            </div>
          </section>
        </div>

        {/* ===================================================================
            3. GRÁFICA DE TENDENCIAS (Estilo Dashboard Financiero / Industrial)
        =================================================================== */}
        <section className="bg-[#FFFFFF] dark:bg-zinc-900 border border-[#E2E8F0] dark:border-zinc-800 rounded-lg shadow-sm p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] dark:border-zinc-800 pb-3.5">
            <div>
              <h2 className="text-base font-medium text-[#0F172A] dark:text-zinc-100">
                Telemetría e Histórico de Red
              </h2>
              <p className="text-xs text-[#64748B] dark:text-zinc-400 mt-0.5">
                Evolución del volumen almacenado (L) y turbidez en línea (NTU) frente al umbral NOM-127
              </p>
            </div>

            {/* Selector de ventana de tiempo sobrio */}
            <div className="inline-flex rounded-md border border-[#E2E8F0] dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 p-0.5 self-start sm:self-auto">
              {[
                { key: '1h', label: 'Última hora' },
                { key: '24h', label: '24h' },
                { key: '7d', label: '7 días' }
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setTimeRange(tab.key)}
                  className={`px-3 py-1 rounded text-xs font-medium transition ${
                    timeRange === tab.key
                      ? 'bg-white dark:bg-zinc-900 text-[#0F172A] dark:text-zinc-100 shadow-sm'
                      : 'text-[#64748B] dark:text-zinc-400 hover:text-[#0F172A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sub-gráfico Izquierdo: Turbidez (NTU) vs Línea punteada roja (4.0 NTU) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-[#64748B] dark:text-zinc-400 font-medium">
                  Turbidez de Entrada (NTU)
                </span>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="flex items-center gap-1.5 text-[#0F172A] dark:text-zinc-200">
                    <span className="w-2.5 h-[2px] bg-[#0F172A] dark:bg-zinc-200 inline-block" />
                    Lectura: {telemetry.inlet.turbidity.toFixed(1)} NTU
                  </span>
                  <span className="flex items-center gap-1.5 text-[#B91C1C]">
                    <span className="w-2.5 h-[2px] border-b border-dashed border-[#B91C1C] inline-block" />
                    Límite: 4.0 NTU
                  </span>
                </div>
              </div>

              <div className="h-56 w-full border border-[#E2E8F0] dark:border-zinc-800 rounded-md p-3 bg-[#FFFFFF] dark:bg-zinc-900">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData[timeRange]}
                    margin={{ top: 8, right: 12, left: -18, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="2 2"
                      stroke={darkMode ? '#27272A' : '#F1F5F9'}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      stroke="#64748B"
                      tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                      axisLine={{ stroke: darkMode ? '#27272A' : '#E2E8F0' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 8]}
                      stroke="#64748B"
                      tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: darkMode ? '#18181B' : '#FFFFFF',
                        borderColor: darkMode ? '#27272A' : '#E2E8F0',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'JetBrains Mono',
                        color: darkMode ? '#F4F4F5' : '#0F172A',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                      }}
                      formatter={(val) => [`${val} NTU`, 'Turbidez']}
                    />
                    <ReferenceLine
                      y={4.0}
                      stroke="#B91C1C"
                      strokeWidth={1.25}
                      strokeDasharray="4 4"
                      label={{
                        value: 'Límite NOM-127 (4.0 NTU)',
                        fill: '#B91C1C',
                        fontSize: 10,
                        fontFamily: 'JetBrains Mono',
                        position: 'insideTopRight'
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="turbidity"
                      stroke={darkMode ? '#E4E4E7' : '#0F172A'}
                      strokeWidth={1.5}
                      dot={{ r: 2.5, fill: darkMode ? '#E4E4E7' : '#0F172A', strokeWidth: 0 }}
                      activeDot={{ r: 4, fill: '#B91C1C', strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Sub-gráfico Derecho: Nivel de Agua (Litros) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-[#64748B] dark:text-zinc-400 font-medium">
                  Volumen en Tinaco (Litros)
                </span>
                <span className="text-xs font-mono text-[#64748B] dark:text-zinc-400">
                  Actual: {telemetry.tank.volumeLiters} L / 1,100 L
                </span>
              </div>

              <div className="h-56 w-full border border-[#E2E8F0] dark:border-zinc-800 rounded-md p-3 bg-[#FFFFFF] dark:bg-zinc-900">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData[timeRange]}
                    margin={{ top: 8, right: 12, left: -10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="2 2"
                      stroke={darkMode ? '#27272A' : '#F1F5F9'}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="time"
                      stroke="#64748B"
                      tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                      axisLine={{ stroke: darkMode ? '#27272A' : '#E2E8F0' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[400, 1100]}
                      stroke="#64748B"
                      tick={{ fill: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: darkMode ? '#18181B' : '#FFFFFF',
                        borderColor: darkMode ? '#27272A' : '#E2E8F0',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontFamily: 'JetBrains Mono',
                        color: darkMode ? '#F4F4F5' : '#0F172A',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                      }}
                      formatter={(val, _name, props) => [
                        `${val} L (${props.payload.tandeo ? 'Tandeo activo' : 'Reposo'})`,
                        'Volumen'
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="level"
                      stroke={darkMode ? '#A1A1AA' : '#334155'}
                      strokeWidth={1.5}
                      dot={{ r: 2.5, fill: darkMode ? '#A1A1AA' : '#334155', strokeWidth: 0 }}
                      activeDot={{ r: 4, fill: '#15803D', strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            4. SALUD DEL SISTEMA Y REGISTRO DE EVENTOS
        =================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Mantenimiento Predictivo (5 columnas) */}
          <section className="lg:col-span-5 bg-[#FFFFFF] dark:bg-zinc-900 border border-[#E2E8F0] dark:border-zinc-800 rounded-lg shadow-sm p-5 space-y-4">
            <div className="border-b border-[#E2E8F0] dark:border-zinc-800 pb-3">
              <h2 className="text-base font-medium text-[#0F172A] dark:text-zinc-100">
                Salud del Sistema y Mantenimiento
              </h2>
              <p className="text-xs text-[#64748B] dark:text-zinc-400 mt-0.5">
                Desgaste estimado por caudal procesado y carga de sólidos
              </p>
            </div>

            <div className="space-y-4">
              {/* Filtro de Sedimentos de 5 micras */}
              <div className="border border-[#E2E8F0] dark:border-zinc-800 rounded-md p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-[#64748B]" />
                    <span className="text-xs font-medium text-[#0F172A] dark:text-zinc-200">
                      Filtro de sedimentos (5 micras)
                    </span>
                  </div>
                  <span className="text-xs font-mono font-semibold text-[#0F172A] dark:text-zinc-100">
                    {telemetry.maintenance.filter5MicronPercent}% restante
                  </span>
                </div>

                <div className="w-full h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#15803D]"
                    style={{ width: `${telemetry.maintenance.filter5MicronPercent}%` }}
                  />
                </div>

                <div className="flex justify-between text-[11px] text-[#64748B] dark:text-zinc-400 font-mono">
                  <span>{telemetry.maintenance.filterDaysRemaining} días est. para reemplazo</span>
                  <span>
                    {telemetry.maintenance.filterLitresProcessed.toLocaleString('es-MX')} L filtrados
                  </span>
                </div>
              </div>

              {/* Recordatorio de lavado de tinaco */}
              <div className="border border-[#E2E8F0] dark:border-zinc-800 rounded-md p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-[#64748B]" />
                    <span className="text-xs font-medium text-[#0F172A] dark:text-zinc-200">
                      Lavado preventivo de tinaco
                    </span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-50 text-[#B45309] border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                    En {telemetry.maintenance.nextTankWashDays} días
                  </span>
                </div>

                <div className="w-full h-1.5 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#B45309]"
                    style={{ width: `${telemetry.maintenance.tankWashAccumulatedNtuHours}%` }}
                  />
                </div>

                <div className="flex justify-between text-[11px] text-[#64748B] dark:text-zinc-400 font-mono">
                  <span>Último lavado: {telemetry.maintenance.lastTankWashDate}</span>
                  <span>Turbidez decantada: {telemetry.maintenance.tankWashAccumulatedNtuHours}%</span>
                </div>
              </div>
            </div>
          </section>

          {/* Bitácora de Eventos (7 columnas) */}
          <section className="lg:col-span-7 bg-[#FFFFFF] dark:bg-zinc-900 border border-[#E2E8F0] dark:border-zinc-800 rounded-lg shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-zinc-800 pb-3">
              <div>
                <h2 className="text-base font-medium text-[#0F172A] dark:text-zinc-100">
                  Registro de Eventos
                </h2>
                <p className="text-xs text-[#64748B] dark:text-zinc-400 mt-0.5">
                  Historial operativo de cortes normativos, tandeos y conmutaciones
                </p>
              </div>
              <span className="text-xs font-mono text-[#64748B] dark:text-zinc-400">
                {events.length} registros recientes
              </span>
            </div>

            <div className="divide-y divide-[#E2E8F0] dark:divide-zinc-800 max-h-56 overflow-y-auto pr-1">
              {events.map((evt) => {
                const statusBadge =
                  evt.type === 'critical'
                    ? 'bg-rose-50 text-[#B91C1C] border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                    : evt.type === 'warning'
                    ? 'bg-amber-50 text-[#B45309] border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                    : 'bg-emerald-50 text-[#15803D] border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';

                return (
                  <div
                    key={evt.id}
                    className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${statusBadge}`}
                        >
                          {evt.code}
                        </span>
                        <span className="font-medium text-[#0F172A] dark:text-zinc-100">
                          {evt.title}
                        </span>
                      </div>
                      <p className="text-[#64748B] dark:text-zinc-400 pl-0 sm:pl-1">
                        {evt.detail}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-[#64748B] dark:text-zinc-500 shrink-0">
                      {evt.timestamp}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>

      {/* =====================================================================
          5. BARRA INFERIOR DELGADA: Simulador de Condiciones de Red
      ===================================================================== */}
      <aside
        aria-label="Simulador de Condiciones de Red"
        className="fixed bottom-0 inset-x-0 z-40 bg-[#FFFFFF]/95 dark:bg-zinc-900/95 backdrop-blur border-t border-[#E2E8F0] dark:border-zinc-800 shadow-sm"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Cabecera compacta de la barra */}
          <div className="h-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-[#0F172A] dark:text-zinc-100">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#64748B]" />
              <span>Simulador de Condiciones de Red (Entorno de Pruebas)</span>
              <span className="hidden sm:inline text-[#64748B] dark:text-zinc-400 font-normal">
                — Ajusta los deslizadores para verificar el corte automático NOM-127
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  updateNetworkParameters({
                    turbidity: 6.2,
                    tds: 880,
                    tempInlet: 25.0,
                    levelPercent: 78,
                    logReason: 'Prueba de tandeo con turbidez crítica (6.2 NTU)'
                  })
                }
                className="text-[11px] font-medium px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-[#B91C1C] dark:text-rose-300 hover:bg-rose-100/70 transition"
              >
                Simular tandeo (&gt; 4.0 NTU)
              </button>

              <button
                type="button"
                onClick={() =>
                  updateNetworkParameters({
                    turbidity: 3.2,
                    tds: 680,
                    tempInlet: 24.5,
                    levelPercent: 78,
                    logReason: 'Restauración de valores nominales'
                  })
                }
                className="text-[11px] font-medium px-2 py-0.5 rounded border border-[#E2E8F0] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[#64748B] dark:text-zinc-300 hover:text-[#0F172A] inline-flex items-center gap-1 transition"
              >
                <RotateCcw className="w-3 h-3" />
                Nominal
              </button>

              <button
                type="button"
                onClick={() => setSimExpanded((v) => !v)}
                className="p-1 text-[#64748B] hover:text-[#0F172A] dark:hover:text-zinc-100"
                title={simExpanded ? 'Contraer simulador' : 'Expandir simulador'}
              >
                {simExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronUp className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Controles deslizantes de ingeniería */}
          {simExpanded && (
            <div className="py-3 border-t border-[#E2E8F0] dark:border-zinc-800 grid grid-cols-1 sm:grid-cols-3 gap-5 items-center">
              {/* Deslizador 1: Turbidez (NTU) */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <label
                    htmlFor="slider-turbidity"
                    className="text-[#64748B] dark:text-zinc-400 font-medium"
                  >
                    Turbidez de entrada (Corte &gt; 4.0 NTU)
                  </label>
                  <span
                    className={`font-mono font-semibold ${
                      telemetry.inlet.turbidity > 4.0
                        ? 'text-[#B91C1C]'
                        : 'text-[#0F172A] dark:text-zinc-100'
                    }`}
                  >
                    {telemetry.inlet.turbidity.toFixed(1)} NTU
                  </span>
                </div>
                <input
                  id="slider-turbidity"
                  type="range"
                  min="0.5"
                  max="8.0"
                  step="0.1"
                  value={telemetry.inlet.turbidity}
                  onChange={(e) =>
                    updateNetworkParameters({
                      turbidity: parseFloat(e.target.value)
                    })
                  }
                  className="w-full bg-slate-200 dark:bg-zinc-700 rounded-lg"
                />
              </div>

              {/* Deslizador 2: Salinidad / TDS (ppm) */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <label
                    htmlFor="slider-tds"
                    className="text-[#64748B] dark:text-zinc-400 font-medium"
                  >
                    Salinidad / TDS (Corte &gt; 1000 ppm)
                  </label>
                  <span
                    className={`font-mono font-semibold ${
                      telemetry.inlet.tds > 1000
                        ? 'text-[#B91C1C]'
                        : telemetry.inlet.tds >= 500
                        ? 'text-[#B45309]'
                        : 'text-[#0F172A] dark:text-zinc-100'
                    }`}
                  >
                    {telemetry.inlet.tds} ppm
                  </span>
                </div>
                <input
                  id="slider-tds"
                  type="range"
                  min="200"
                  max="1300"
                  step="10"
                  value={telemetry.inlet.tds}
                  onChange={(e) =>
                    updateNetworkParameters({
                      tds: parseInt(e.target.value, 10)
                    })
                  }
                  className="w-full bg-slate-200 dark:bg-zinc-700 rounded-lg"
                />
              </div>

              {/* Deslizador 3: Nivel del Tinaco (%) */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <label
                    htmlFor="slider-level"
                    className="text-[#64748B] dark:text-zinc-400 font-medium"
                  >
                    Nivel de almacenamiento (Tinaco 1,100 L)
                  </label>
                  <span className="font-mono font-semibold text-[#0F172A] dark:text-zinc-100">
                    {telemetry.tank.levelPercent}% ({telemetry.tank.volumeLiters} L)
                  </span>
                </div>
                <input
                  id="slider-level"
                  type="range"
                  min="10"
                  max="100"
                  step="1"
                  value={telemetry.tank.levelPercent}
                  onChange={(e) =>
                    updateNetworkParameters({
                      levelPercent: parseInt(e.target.value, 10)
                    })
                  }
                  className="w-full bg-slate-200 dark:bg-zinc-700 rounded-lg"
                />
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
