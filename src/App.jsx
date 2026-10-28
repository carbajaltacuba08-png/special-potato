import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Cpu,
  Droplets,
  Filter,
  Gauge,
  History,
  Info,
  Lock,
  Play,
  Power,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Smartphone,
  Sparkles,
  Thermometer,
  Unlock,
  Waves,
  Wifi,
  Wrench,
  Zap
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend
} from 'recharts';
import { INITIAL_STATE, TELEMETRY_SERIES, INITIAL_EVENTS } from './data/mockTelemetry';

export default function App() {
  // Estado principal de telemetría
  const [telemetry, setTelemetry] = useState(INITIAL_STATE);
  const [timeRange, setTimeRange] = useState('24h'); // '1h' | '24h' | '7d'
  const [chartData, setChartData] = useState(TELEMETRY_SERIES);
  const [events, setEvents] = useState(INITIAL_EVENTS);

  // Sincronización en segundos ("Actualizado hace 2s")
  const [secondsSinceSync, setSecondsSinceSync] = useState(2);

  // Modo Demo / Simulación para Jueces
  const [demoAutoCycle, setDemoAutoCycle] = useState(false);
  const [demoPanelOpen, setDemoPanelOpen] = useState(false);
  const [mobilePreviewMode, setMobilePreviewMode] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState('all'); // 'all' | 'zona1' | 'zona2' | 'graficos' | 'salud'

  // Función auxiliar para registrar eventos en el Event Log
  const pushEvent = useCallback((type, title, detail, code) => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
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
      ...prev.slice(0, 14)
    ]);
  }, []);

  // Evaluación automática de la electroválvula según NOM-127-SSA1-2021
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
                ? `CORTE NOM-127: Turbidez crítica (${newTurbidity.toFixed(1)} NTU > 4.0 NTU)`
                : `CORTE NOM-127: TDS crítico (${newTds} ppm > 1000 mg/L)`
          };
        } else {
          return {
            isOpen: true,
            bypassActive: false,
            lastActionReason: 'Admisión activa — Parámetros dentro de NOM-127-SSA1-2021'
          };
        }
      }
      // En modo MANUAL se respeta el estado forzado por el usuario
      return {
        isOpen: currentOpenState,
        bypassActive: !currentOpenState,
        lastActionReason: `OVERRIDE MANUAL ACTIVO (${currentOpenState ? 'Abierta forzada' : 'Cerrada forzada'})`
      };
    },
    []
  );

  // Reloj de sincronización ("Actualizado hace Xs") + micro-fluctuación realista de sensores
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsSinceSync((prev) => {
        if (prev >= 4) {
          // Simula llegada de paquete MQTT desde ESP32 cada 5 segundos
          setTelemetry((curr) => {
            const rssiJitter = -62 + Math.floor(Math.random() * 3) - 1;
            return {
              ...curr,
              wifi: {
                ...curr.wifi,
                rssi: rssiJitter
              }
            };
          });
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Aplicación de un escenario de telemetría (usado por "Simular Tandeo" y controles Demo)
  const applyScenario = useCallback(
    ({ turbidity, tds, tempInlet, levelPercent, reasonLabel }) => {
      setSecondsSinceSync(0);

      setTelemetry((prev) => {
        const nextTurbidity = Number(turbidity.toFixed(1));
        const nextTds = Math.round(tds);
        const nextTemp = tempInlet ?? prev.inlet.temperature;
        const nextLevelPct = levelPercent ?? prev.tank.levelPercent;
        const nextVolume = Math.round((nextLevelPct / 100) * prev.tank.capacityLiters);
        // 1100L / ~252.3 L/día = 3.4 días al 78% (858L)
        const nextAutonomy = Number((nextVolume / 252.35).toFixed(1));
        // Cota ultrasónica: Tanque de ~140cm útiles + 20cm cabezal -> al 78% son 51 cm
        const nextDistanceCm = Math.max(18, Math.round(160 - (nextLevelPct / 100) * 140));

        const valveEval = evaluateValveSafety(
          nextTurbidity,
          nextTds,
          prev.valve.mode,
          prev.valve.isOpen
        );

        // Registrar evento si cambió el estado de la válvula o hubo pico
        if (prev.valve.isOpen && !valveEval.isOpen) {
          pushEvent(
            'critical',
            `Válvula cerrada automáticamente por pico (${nextTurbidity} NTU / ${nextTds} ppm)`,
            `Superado límite NOM-127-SSA1-2021. Electroválvula 12V cerrada y cámara de bypass activa.`,
            'NOM127-CUTOFF'
          );
        } else if (!prev.valve.isOpen && valveEval.isOpen) {
          pushEvent(
            'success',
            `Electroválvula 12V reabierta (${nextTurbidity} NTU)`,
            `Agua municipal estabilizada dentro de norma (< 4.0 NTU). Reanudando llenado de tinaco.`,
            'NOM127-RESTORE'
          );
        } else if (reasonLabel) {
          pushEvent(
            nextTurbidity > 4.0 || nextTds > 1000 ? 'critical' : 'info',
            reasonLabel,
            `Lectura actual: Turbidez ${nextTurbidity} NTU | TDS ${nextTds} ppm | Válvula ${
              valveEval.isOpen ? 'ABIERTA' : 'CERRADA'
            }`,
            'SIM-TANDEO'
          );
        }

        // Actualizar también el último punto del gráfico en tiempo real
        const nowLabel = new Date().toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        setChartData((prevCharts) => ({
          ...prevCharts,
          '1h': [
            ...prevCharts['1h'].slice(1),
            {
              time: nowLabel,
              level: nextVolume,
              turbidity: nextTurbidity,
              limit: 4.0,
              tds: nextTds,
              tandeo: true,
              event: nextTurbidity > 4.0 ? `Corte (${nextTurbidity} NTU)` : 'Monitoreo'
            }
          ],
          '24h': [
            ...prevCharts['24h'].slice(0, -1),
            {
              time: 'Ahora',
              level: nextVolume,
              turbidity: nextTurbidity,
              limit: 4.0,
              tds: nextTds,
              tandeo: true,
              event: nextTurbidity > 4.0 ? `Corte (${nextTurbidity} NTU)` : 'Actual'
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

  // Botón directo "Simular Tandeo" (alterna entre un evento de tandeo turbio > 4.0 NTU y valores nominales/aleatorios)
  const handleTriggerTandeoSimulation = () => {
    const isCurrentlyNormal = telemetry.inlet.turbidity <= 4.0 && telemetry.inlet.tds <= 1000;

    if (isCurrentlyNormal) {
      // Simular llegada de golpe de ariete / tandeo con sedimento (> 4.0 NTU)
      const randomHighTurbidity = Number((4.6 + Math.random() * 3.2).toFixed(1)); // 4.6 a 7.8 NTU
      const randomHighTds = Math.round(780 + Math.random() * 290); // 780 a 1070 ppm
      applyScenario({
        turbidity: randomHighTurbidity,
        tds: randomHighTds,
        tempInlet: Number((24.8 + Math.random() * 1.1).toFixed(1)),
        levelPercent: telemetry.tank.levelPercent,
        reasonLabel: `Tandeo municipal con arrastre de sedimentos detectado (${randomHighTurbidity} NTU)`
      });
    } else {
      // Restaurar a condición de agua clara tras purga de tubería
      applyScenario({
        turbidity: 3.2,
        tds: 680,
        tempInlet: 24.5,
        levelPercent: 78,
        reasonLabel: 'Estabilización post-purga en toma municipal (Valores Nominales)'
      });
    }
  };

  // Ciclo automático de demostración (si el usuario activa el Auto-Ciclo para exposición)
  useEffect(() => {
    if (!demoAutoCycle) return;
    const cycleTimer = setInterval(() => {
      const roll = Math.random();
      if (roll < 0.5) {
        // Pico de turbidez en tandeo
        const spikeNtu = Number((4.3 + Math.random() * 3.5).toFixed(1));
        const spikeTds = Math.round(740 + Math.random() * 320);
        applyScenario({
          turbidity: spikeNtu,
          tds: spikeTds,
          tempInlet: Number((24.4 + Math.random() * 1.2).toFixed(1)),
          levelPercent: Math.min(92, telemetry.tank.levelPercent + 1),
          reasonLabel: `[Auto-Demo] Pico de turbidez en red (${spikeNtu} NTU)`
        });
      } else {
        // Agua aceptable
        const normalNtu = Number((2.1 + Math.random() * 1.6).toFixed(1));
        const normalTds = Math.round(590 + Math.random() * 180);
        applyScenario({
          turbidity: normalNtu,
          tds: normalTds,
          tempInlet: 24.5,
          levelPercent: 78,
          reasonLabel: `[Auto-Demo] Flujo municipal estabilizado (${normalNtu} NTU)`
        });
      }
    }, 5500);

    return () => clearInterval(cycleTimer);
  }, [demoAutoCycle, applyScenario, telemetry.tank.levelPercent]);

  // Conmutar Modo Automático NOM-127 vs Override Manual
  const handleToggleValveMode = () => {
    setTelemetry((prev) => {
      const nextMode = prev.valve.mode === 'AUTO' ? 'MANUAL' : 'AUTO';
      const valveEval = evaluateValveSafety(
        prev.inlet.turbidity,
        prev.inlet.tds,
        nextMode,
        prev.valve.isOpen
      );

      pushEvent(
        nextMode === 'MANUAL' ? 'warning' : 'info',
        nextMode === 'MANUAL'
          ? 'Override Manual activado por operador'
          : 'Modo AUTOMÁTICO NOM-127 restablecido',
        nextMode === 'MANUAL'
          ? 'El corte automático por turbidez queda bajo supervisión manual directa.'
          : 'Protección autónoma activada (Corte si Turbidez > 4.0 NTU o TDS > 1000 ppm).',
        nextMode === 'MANUAL' ? 'MANUAL-OVR' : 'AUTO-NOM127'
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

  // Forzar apertura/cierre cuando está en Override Manual (o activar Override Manual directamente)
  const handleManualValveSwitch = () => {
    setTelemetry((prev) => {
      const nextOpen = !prev.valve.isOpen;
      pushEvent(
        nextOpen && (prev.inlet.turbidity > 4.0 || prev.inlet.tds > 1000) ? 'critical' : 'warning',
        `Accionamiento manual: Electroválvula 12V ${nextOpen ? 'ABIERTA' : 'CERRADA'}`,
        `Operación forzada en modo Override Manual (Turbidez actual: ${prev.inlet.turbidity} NTU).`,
        'VALVE-MAN'
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
          lastActionReason: `OVERRIDE MANUAL: Válvula ${nextOpen ? 'ABIERTA' : 'CERRADA'} por usuario`
        }
      };
    });
  };

  // Semáforos normativos NOM-127-SSA1-2021
  const getTdsStatus = (tds) => {
    if (tds > 1000) {
      return {
        label: 'Corte de Emergencia / Fuera de Norma',
        shortLabel: 'CRÍTICO',
        colorClass: 'text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/40',
        barColor: 'bg-[#EF4444]',
        dotColor: 'bg-[#EF4444]'
      };
    }
    if (tds >= 500) {
      return {
        label: 'Precaución',
        shortLabel: 'PRECAUCIÓN',
        colorClass: 'text-[#F59E0B] bg-[#F59E0B]/10 border-[#F59E0B]/40',
        barColor: 'bg-[#F59E0B]',
        dotColor: 'bg-[#F59E0B]'
      };
    }
    return {
      label: 'Óptimo',
      shortLabel: 'ÓPTIMO',
      colorClass: 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/40',
      barColor: 'bg-[#10B981]',
      dotColor: 'bg-[#10B981]'
    };
  };

  const getTurbidityStatus = (ntu) => {
    if (ntu > 4.0) {
      return {
        label: 'CORTE DE EMERGENCIA (> 4.0 NTU)',
        shortLabel: 'EMERGENCIA',
        colorClass: 'text-[#EF4444] bg-[#EF4444]/15 border-[#EF4444]/50',
        barColor: 'bg-[#EF4444]',
        dotColor: 'bg-[#EF4444]'
      };
    }
    if (ntu >= 3.0) {
      return {
        label: 'Aceptable',
        shortLabel: 'ACEPTABLE',
        colorClass: 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/40',
        barColor: 'bg-[#06B6D4]',
        dotColor: 'bg-[#10B981]'
      };
    }
    return {
      label: 'Óptimo / Cristalina',
      shortLabel: 'ÓPTIMO',
      colorClass: 'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/40',
      barColor: 'bg-[#10B981]',
      dotColor: 'bg-[#10B981]'
    };
  };

  const tdsStatus = getTdsStatus(telemetry.inlet.tds);
  const turbidityStatus = getTurbidityStatus(telemetry.inlet.turbidity);
  const isEmergencyCutoff = telemetry.inlet.turbidity > 4.0 || telemetry.inlet.tds > 1000;

  // Cálculo para el anillo radial SVG del Tinaco
  const circleRadius = 54;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset =
    circleCircumference - (telemetry.tank.levelPercent / 100) * circleCircumference;

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col justify-between pb-28 md:pb-24">
      {/* Contenedor adaptativo (permite previsualizar como teléfono móvil en escritorio o usar pantalla completa) */}
      <div
        className={`w-full transition-all duration-300 mx-auto ${
          mobilePreviewMode
            ? 'max-w-[430px] my-4 border-[6px] border-slate-700 rounded-[36px] shadow-2xl shadow-cyan-950/50 overflow-hidden bg-[#0B1120]'
            : 'max-w-[1440px]'
        }`}
      >
        {/* =====================================================================
            1. ENCABEZADO Y CONECTIVIDAD
        ===================================================================== */}
        <header className="sticky top-0 z-30 bg-[#0B1120]/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 py-3.5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            {/* Marca e Identificador del Nodo */}
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#1E293B] border border-cyan-500/40 flex items-center justify-center shrink-0 shadow-inner shadow-cyan-500/10">
                <Droplets className="w-6 h-6 text-[#06B6D4]" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                    Purificando tu bienestar
                  </h1>
                  <span className="hidden sm:inline text-slate-600">|</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold px-2.5 py-0.5 rounded bg-[#1E293B] text-[#06B6D4] border border-cyan-500/30">
                    <Cpu className="w-3.5 h-3.5" />
                    Nodo Residencial Los Cabos #01
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sistema IoT de Monitoreo Hídrico y Control Autónomo Domiciliario • B.C.S., México
                </p>
              </div>
            </div>

            {/* Estado en Vivo ESP32 y Timestamp de Sincronización */}
            <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2.5">
              {/* Badge Verde Pulsante ESP32 */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1E293B] border border-emerald-500/30 text-xs font-mono text-emerald-300">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10B981] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#10B981]"></span>
                </span>
                <Wifi className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                <span className="truncate">
                  ESP32 Conectado ({telemetry.wifi.band} - RSSI: {telemetry.wifi.rssi} dBm)
                </span>
              </div>

              {/* Timestamp última sincronización */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300">
                <RefreshCw
                  className={`w-3.5 h-3.5 text-[#06B6D4] ${
                    secondsSinceSync === 0 ? 'animate-spin' : ''
                  }`}
                />
                <span>Actualizado hace {secondsSinceSync}s</span>
              </div>

              {/* Botón de vista móvil simulada (visible en pantallas grandes para probar Mobile View al instante) */}
              <button
                onClick={() => setMobilePreviewMode((v) => !v)}
                title="Alternar vista de teléfono móvil (Mobile App View)"
                className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition ${
                  mobilePreviewMode
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                    : 'bg-[#1E293B] border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>{mobilePreviewMode ? 'Salir Vista Móvil' : 'Vista Celular'}</span>
              </button>
            </div>
          </div>

          {/* Barra de navegación rápida Mobile-First (visible en móviles o en modo Vista Celular) */}
          <div
            className={`flex items-center gap-1.5 overflow-x-auto pt-3 pb-0.5 no-scrollbar ${
              mobilePreviewMode ? 'flex' : 'flex md:hidden'
            }`}
          >
            {[
              { id: 'all', label: 'Vista SCADA Completa' },
              { id: 'zona1', label: 'Zona 1: Entrada' },
              { id: 'zona2', label: 'Zona 2: Tinaco' },
              { id: 'graficos', label: 'Telemetría' },
              { id: 'salud', label: 'Mantenimiento' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveMobileTab(tab.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition ${
                  activeMobileTab === tab.id
                    ? 'bg-[#06B6D4] text-slate-950 font-semibold'
                    : 'bg-[#1E293B] text-slate-300 border border-slate-700/80'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {/* Banner de Alerta de Corte de Emergencia (cuando Turbidez > 4.0 NTU o TDS > 1000 ppm) */}
        {isEmergencyCutoff && (
          <div className="mx-4 sm:mx-6 mt-4 p-3.5 rounded-xl bg-[#EF4444]/15 border-2 border-[#EF4444] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-pulse">
            <div className="flex items-start sm:items-center gap-3">
              <div className="p-2 rounded-lg bg-[#EF4444] text-white shrink-0">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-[#EF4444] text-white font-bold">
                    CORTE DE EMERGENCIA ACTIVO
                  </span>
                  <span className="text-xs font-mono text-red-300">NOM-127-SSA1-2021</span>
                </div>
                <p className="text-sm font-semibold text-red-100 mt-1">
                  {telemetry.inlet.turbidity > 4.0
                    ? `Turbidez de entrada en ${telemetry.inlet.turbidity} NTU (supera límite máximo de 4.0 NTU). `
                    : `TDS de entrada en ${telemetry.inlet.tds} ppm (supera límite de 1000 mg/L). `}
                  Electroválvula Solenoide 12V CERRADA — Desviando flujo turbio a cámara de bypass.
                </p>
              </div>
            </div>
            <button
              onClick={() =>
                applyScenario({
                  turbidity: 3.2,
                  tds: 680,
                  tempInlet: 24.5,
                  levelPercent: 78,
                  reasonLabel: 'Restablecimiento manual de valores nominales post-tandeo'
                })
              }
              className="px-3 py-1.5 rounded-lg bg-red-950/90 hover:bg-red-900 border border-red-400/50 text-xs font-mono text-red-100 shrink-0 transition"
            >
              Restaurar Red (3.2 NTU)
            </button>
          </div>
        )}

        {/* =====================================================================
            CONTENIDO PRINCIPAL DEL DASHBOARD SCADA
        ===================================================================== */}
        <main className="p-4 sm:p-6 space-y-6">
          {/* ===================================================================
              2. ZONA 1: TOMA MUNICIPAL / ENTRADA (Cámara de Derivación / Bypass Activo)
          =================================================================== */}
          {(activeMobileTab === 'all' || activeMobileTab === 'zona1') && (
            <section aria-labelledby="zona1-heading" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-6 rounded-sm bg-[#06B6D4]"></span>
                  <div>
                    <h2
                      id="zona1-heading"
                      className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-100 flex items-center gap-2"
                    >
                      ZONA 1: TOMA MUNICIPAL / ENTRADA
                      <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-[#1E293B] text-cyan-400 border border-slate-700">
                        Cámara de Derivación / Bypass Activo
                      </span>
                    </h2>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
                  <span>Red: OOMSAPAS Los Cabos</span>
                  <span>•</span>
                  <span className="text-cyan-400">
                    Flujo: {telemetry.inlet.flowRateLpm.toFixed(1)} L/min
                  </span>
                </div>
              </div>

              {/* Esquemático P&ID ligero del tren de admisión y derivación */}
              <div className="bg-[#1E293B]/70 border border-slate-800 rounded-xl p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300">
                      1. Toma Municipal
                    </span>
                    <span className="text-cyan-400">→</span>
                    <span className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300">
                      2. Celdas TDS / Turbidez / Temp
                    </span>
                    <span className="text-cyan-400">→</span>
                    <span
                      className={`px-2.5 py-1 rounded font-semibold border ${
                        telemetry.valve.isOpen
                          ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                          : 'bg-red-950/70 border-red-500/60 text-red-300'
                      }`}
                    >
                      3. Solenoide 12V: {telemetry.valve.isOpen ? 'ABIERTA' : 'CERRADA'}
                    </span>
                    <span className="text-cyan-400">→</span>
                    <span
                      className={`px-2.5 py-1 rounded font-semibold border ${
                        telemetry.valve.isOpen
                          ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300'
                          : 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                      }`}
                    >
                      {telemetry.valve.isOpen
                        ? '4. Admisión a Filtro 5µm y Tinaco 1,100 L'
                        : '4. Desvío por Bypass / Purga de Sedimentos'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {telemetry.valve.lastActionReason}
                  </span>
                </div>
              </div>

              {/* Grid de 4 tarjetas de Zona 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* TARJETA 1: TDS Entrada */}
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between shadow-lg">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        TDS Entrada (Sólidos Disueltos)
                      </span>
                      <Gauge className="w-4 h-4 text-[#F59E0B]" />
                    </div>
                    <div className="flex items-baseline gap-2 my-1">
                      <span className="text-3xl font-mono font-bold text-white">
                        {telemetry.inlet.tds}
                      </span>
                      <span className="text-sm font-mono text-slate-400">ppm (mg/L)</span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {/* Barra de progreso con umbral 1000 ppm */}
                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                        <span>0 ppm</span>
                        <span>Óptimo &lt;500</span>
                        <span className="text-amber-400">Máx: 1000 mg/L</span>
                      </div>
                      <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className={`h-full transition-all duration-500 ${tdsStatus.barColor}`}
                          style={{
                            width: `${Math.min(100, (telemetry.inlet.tds / 1200) * 100)}%`
                          }}
                        />
                      </div>
                    </div>

                    {/* Semáforo NOM-127 */}
                    <div
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-2 ${tdsStatus.colorClass}`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${tdsStatus.dotColor}`} />
                      <span className="leading-tight">
                        Semáforo: <strong>{tdsStatus.label}</strong> / Límite NOM-127-SSA1-2021 &lt;
                        1000 mg/L
                      </span>
                    </div>
                  </div>
                </div>

                {/* TARJETA 2: Turbidez de Entrada */}
                <div
                  className={`bg-[#1E293B] border rounded-xl p-4 flex flex-col justify-between shadow-lg transition-colors ${
                    telemetry.inlet.turbidity > 4.0
                      ? 'border-[#EF4444] ring-1 ring-[#EF4444]/40'
                      : 'border-slate-700/80'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Turbidez de Línea
                      </span>
                      <Waves
                        className={`w-4 h-4 ${
                          telemetry.inlet.turbidity > 4.0 ? 'text-[#EF4444]' : 'text-[#06B6D4]'
                        }`}
                      />
                    </div>
                    <div className="flex items-baseline gap-2 my-1">
                      <span
                        className={`text-3xl font-mono font-bold ${
                          telemetry.inlet.turbidity > 4.0 ? 'text-[#EF4444]' : 'text-white'
                        }`}
                      >
                        {telemetry.inlet.turbidity.toFixed(1)}
                      </span>
                      <span className="text-sm font-mono text-slate-400">NTU</span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                        <span>0.0 NTU</span>
                        <span className="text-red-400 font-semibold">Corte: 4.0 NTU</span>
                        <span>8.0 NTU</span>
                      </div>
                      <div className="relative w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className={`h-full transition-all duration-500 ${turbidityStatus.barColor}`}
                          style={{
                            width: `${Math.min(100, (telemetry.inlet.turbidity / 8.0) * 100)}%`
                          }}
                        />
                        {/* Marca de límite normativo 4.0 NTU (50% de 8.0 NTU) */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-[#EF4444]"
                          style={{ left: '50%' }}
                          title="Límite NOM-127: 4.0 NTU"
                        />
                      </div>
                    </div>

                    <div
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-2 ${turbidityStatus.colorClass}`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${turbidityStatus.dotColor}`}
                      />
                      <span className="leading-tight">
                        Semáforo: <strong>{turbidityStatus.label}</strong> / Límite &lt; 4.0 NTU
                      </span>
                    </div>
                  </div>
                </div>

                {/* TARJETA 3: Temperatura de Entrada (DS18B20) */}
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-4 flex flex-col justify-between shadow-lg">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Temperatura de Entrada
                      </span>
                      <Thermometer className="w-4 h-4 text-[#06B6D4]" />
                    </div>
                    <div className="flex items-baseline gap-2 my-1">
                      <span className="text-3xl font-mono font-bold text-white">
                        {telemetry.inlet.temperature.toFixed(1)}
                      </span>
                      <span className="text-sm font-mono text-slate-400">°C</span>
                    </div>
                    <p className="text-xs font-mono text-cyan-400 mt-1">
                      Sonda Digital: DS18B20 (1-Wire Waterproof)
                    </p>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                        <span>10 °C</span>
                        <span>Compensación TDS Activa</span>
                        <span>40 °C</span>
                      </div>
                      <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-[#06B6D4] transition-all duration-500"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(0, ((telemetry.inlet.temperature - 10) / 30) * 100)
                            )}%`
                          }}
                        />
                      </div>
                    </div>

                    <div className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900/70 text-xs font-mono text-slate-300 flex items-center justify-between">
                      <span>Factor Temp. EC/TDS:</span>
                      <span className="text-[#10B981] font-semibold">Calibrado (25 °C ref)</span>
                    </div>
                  </div>
                </div>

                {/* TARJETA 4: Estado de Válvula Solenoide (12V) */}
                <div
                  className={`bg-[#1E293B] border rounded-xl p-4 flex flex-col justify-between shadow-lg transition-all ${
                    telemetry.valve.isOpen
                      ? 'border-emerald-500/40'
                      : 'border-[#EF4444] bg-gradient-to-b from-[#1E293B] to-red-950/25'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Válvula Solenoide (12V DC)
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-900 text-cyan-300 border border-cyan-500/30">
                        {telemetry.valve.mode === 'AUTO' ? (
                          <>
                            <ShieldCheck className="w-3 h-3 text-[#10B981]" />
                            AUTOMÁTICO NOM-127
                          </>
                        ) : (
                          <>
                            <Sliders className="w-3 h-3 text-[#F59E0B]" />
                            OVERRIDE MANUAL
                          </>
                        )}
                      </span>
                    </div>

                    {/* Interruptor visual Abierta / Cerrada */}
                    <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 my-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold ${
                            telemetry.valve.isOpen
                              ? 'bg-[#10B981]/20 text-[#10B981] border border-[#10B981]/40'
                              : 'bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/40'
                          }`}
                        >
                          {telemetry.valve.isOpen ? (
                            <Unlock className="w-5 h-5" />
                          ) : (
                            <Lock className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div
                            className={`text-lg font-mono font-bold leading-none ${
                              telemetry.valve.isOpen ? 'text-[#10B981]' : 'text-[#EF4444]'
                            }`}
                          >
                            {telemetry.valve.isOpen ? 'ABIERTA' : 'CERRADA'}
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">
                            {telemetry.valve.isOpen
                              ? 'Paso hacia Tinaco 1,100L'
                              : 'Corte activo • Bypass abierto'}
                          </span>
                        </div>
                      </div>

                      {/* Switch interactivo */}
                      <button
                        type="button"
                        onClick={handleManualValveSwitch}
                        aria-label="Conmutar estado de válvula solenoide"
                        className={`relative inline-flex h-7 w-13 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          telemetry.valve.isOpen ? 'bg-[#10B981]' : 'bg-[#EF4444]'
                        }`}
                        style={{ width: '52px' }}
                      >
                        <span
                          className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            telemetry.valve.isOpen ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Regla de seguridad y Botón de Override Manual */}
                  <div className="space-y-2 mt-1">
                    <p className="text-[11px] font-mono text-slate-400 leading-tight">
                      Corte automático de seguridad si{' '}
                      <span className="text-slate-200">Turbidez &gt; 4.0 NTU</span> o{' '}
                      <span className="text-slate-200">TDS &gt; 1000 ppm</span>.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleValveMode}
                        className={`w-full py-1.5 px-3 rounded-lg text-xs font-mono font-semibold border transition flex items-center justify-center gap-1.5 ${
                          telemetry.valve.mode === 'MANUAL'
                            ? 'bg-[#F59E0B]/20 border-[#F59E0B] text-[#F59E0B] hover:bg-[#F59E0B]/30'
                            : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        {telemetry.valve.mode === 'AUTO'
                          ? 'Activar Override Manual'
                          : 'Volver a AUTOMÁTICO NOM-127'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ===================================================================
              3. ZONA 2: ALMACENAMIENTO DOMÉSTICO (Tinaco de 1,100 L)
          =================================================================== */}
          {(activeMobileTab === 'all' || activeMobileTab === 'zona2') && (
            <section aria-labelledby="zona2-heading" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-6 rounded-sm bg-[#10B981]"></span>
                  <h2
                    id="zona2-heading"
                    className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-100 flex items-center gap-2"
                  >
                    ZONA 2: ALMACENAMIENTO DOMÉSTICO
                    <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-[#1E293B] text-emerald-400 border border-slate-700">
                      Tinaco Tricapa de 1,100 L
                    </span>
                  </h2>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  Telemetría Ultrasónica Impermeable • JSN-SR04T
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* WIDGET DE NIVEL ULTRASÓNICO (JSN-SR04T) - 7 columnas en Desktop */}
                <div className="lg:col-span-7 bg-[#1E293B] border border-slate-700/80 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col justify-between">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                        <Radio className="w-4 h-4 text-[#06B6D4]" />
                        Widget de Nivel Ultrasónico (JSN-SR04T)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Medición acústica sin contacto con compensación térmica
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-cyan-500/30 text-xs font-mono text-cyan-300">
                      Distancia al espejo de agua: <strong>{telemetry.tank.distanceCm} cm</strong>
                    </span>
                  </div>

                  {/* Visualización combinada: Tanque Cilíndrico SCADA + Anillo Radial + Métricas de Volumen/Autonomía */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center my-auto">
                    {/* Cilindro Hidráulico SCADA */}
                    <div className="sm:col-span-5 flex flex-col items-center">
                      <div className="relative w-36 h-48 rounded-2xl bg-slate-950 border-2 border-slate-700 p-1.5 flex flex-col justify-end overflow-hidden shadow-inner">
                        {/* Sensor JSN-SR04T en la tapa superior */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 px-2 py-0.5 rounded-b bg-slate-800 border-x border-b border-cyan-500/50 text-[10px] font-mono text-cyan-300 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                          JSN-SR04T
                        </div>

                        {/* Líneas de cota (distancia libre 51 cm) */}
                        <div
                          className="absolute top-5 left-0 right-0 z-10 flex flex-col items-center justify-center border-b border-dashed border-cyan-400/40 text-[10px] font-mono text-cyan-300/90"
                          style={{ height: `${100 - telemetry.tank.levelPercent}%` }}
                        >
                          <span className="bg-slate-950/80 px-1.5 py-0.5 rounded">
                            ↕ {telemetry.tank.distanceCm} cm
                          </span>
                        </div>

                        {/* Escala graduada lateral */}
                        <div className="absolute right-1.5 top-4 bottom-2 z-20 flex flex-col justify-between text-[9px] font-mono text-slate-400 pointer-events-none">
                          <span>100%</span>
                          <span>75%</span>
                          <span>50%</span>
                          <span>25%</span>
                          <span>0%</span>
                        </div>

                        {/* Cuerpo de Agua */}
                        <div
                          className="relative w-full rounded-xl bg-gradient-to-t from-cyan-600/80 via-[#06B6D4]/70 to-cyan-400/60 border-t-2 border-cyan-300 transition-all duration-700 flex items-center justify-center"
                          style={{ height: `${telemetry.tank.levelPercent}%` }}
                        >
                          <div className="text-center z-10">
                            <span className="text-2xl font-mono font-bold text-white drop-shadow">
                              {telemetry.tank.levelPercent}%
                            </span>
                            <span className="block text-[10px] font-mono text-cyan-100">
                              {telemetry.tank.volumeLiters} L
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Indicador Radial + Datos de Volumen y Autonomía */}
                    <div className="sm:col-span-7 space-y-3.5">
                      <div className="flex items-center gap-4 bg-slate-900/80 border border-slate-800 rounded-xl p-3">
                        {/* Anillo Radial SVG */}
                        <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 128 128">
                            <circle
                              cx="64"
                              cy="64"
                              r={circleRadius}
                              stroke="#1E293B"
                              strokeWidth="10"
                              fill="transparent"
                            />
                            <circle
                              cx="64"
                              cy="64"
                              r={circleRadius}
                              stroke="#06B6D4"
                              strokeWidth="10"
                              strokeDasharray={circleCircumference}
                              strokeDashoffset={strokeDashoffset}
                              strokeLinecap="round"
                              fill="transparent"
                              className="transition-all duration-700"
                            />
                          </svg>
                          <span className="absolute text-base font-mono font-bold text-white">
                            {telemetry.tank.levelPercent}%
                          </span>
                        </div>

                        <div>
                          <span className="text-xs font-mono uppercase text-slate-400">
                            Volumen Calculado
                          </span>
                          <div className="text-2xl font-mono font-bold text-white">
                            {telemetry.tank.volumeLiters.toLocaleString('es-MX')} /{' '}
                            {telemetry.tank.capacityLiters.toLocaleString('es-MX')} Litros
                          </div>
                          <span className="text-xs font-mono text-[#10B981]">
                            Reserva óptima para tandeo
                          </span>
                        </div>
                      </div>

                      {/* Autonomía estimada */}
                      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[#10B981]">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-xs font-mono uppercase text-slate-400 block">
                              Autonomía Estimada
                            </span>
                            <span className="text-sm sm:text-base font-mono font-bold text-emerald-300">
                              {telemetry.tank.autonomyDays} días de consumo familiar restante
                            </span>
                            <span className="block text-[11px] text-slate-400">
                              Basado en tasa de uso promedio domiciliario (252 L/día)
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Indicador de Cota */}
                      <div className="bg-slate-900/80 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400">Indicador de cota ultrasónica:</span>
                        <span className="text-cyan-300 font-semibold">
                          Distancia al espejo de agua: {telemetry.tank.distanceCm} cm
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* MÉTRICAS DE CALIDAD EN REPOSO - 5 columnas en Desktop */}
                <div className="lg:col-span-5 bg-[#1E293B] border border-slate-700/80 rounded-xl p-4 sm:p-5 shadow-lg flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#10B981]" />
                      Métricas de Calidad en Reposo (Interior Tinaco)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Agua filtrada y estabilizada lista para suministro intradomiciliario
                    </p>
                  </div>

                  <div className="space-y-3 my-auto">
                    {/* Sub-tarjeta 1: pH */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                          Potencial de Hidrógeno (pH)
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-2xl font-mono font-bold text-[#10B981]">
                            {telemetry.tank.ph.toFixed(1)}
                          </span>
                          <span className="text-xs font-mono text-slate-400">unidades pH</span>
                        </div>
                        <span className="inline-block mt-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                          [Rango óptimo NOM-127: 6.5 - 8.5]
                        </span>
                      </div>
                      <div className="text-right font-mono text-xs text-slate-400">
                        <div className="w-24 h-2 bg-gradient-to-r from-amber-500 via-emerald-500 to-cyan-500 rounded-full relative">
                          <span
                            className="absolute -top-1 w-2 h-4 bg-white rounded border border-slate-900"
                            style={{ left: '52%' }}
                          />
                        </div>
                        <span className="text-[10px] block mt-1 text-emerald-400">Neutro Alcalino</span>
                      </div>
                    </div>

                    {/* Sub-tarjeta 2: TDS Estabilizado */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                          TDS Estabilizado en Almacenamiento
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-2xl font-mono font-bold text-cyan-300">
                            {telemetry.tank.tdsStabilized}
                          </span>
                          <span className="text-xs font-mono text-slate-400">ppm</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          Reducción por mezcla y retención previa ({telemetry.inlet.tds} →{' '}
                          {telemetry.tank.tdsStabilized} ppm)
                        </span>
                      </div>
                      <span className="px-2.5 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono text-cyan-300 shrink-0">
                        NOM-127 OK
                      </span>
                    </div>

                    {/* Sub-tarjeta 3: Temperatura Interna */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                          Temperatura Interna del Agua
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-2xl font-mono font-bold text-white">
                            {telemetry.tank.temperatureInternal.toFixed(1)}
                          </span>
                          <span className="text-xs font-mono text-slate-400">°C</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          Aislamiento térmico tricapa • Sin riesgo de proliferación bacteriana
                        </span>
                      </div>
                      <Thermometer className="w-6 h-6 text-[#06B6D4] shrink-0" />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ===================================================================
              4. TELEMETRÍA Y TENDENCIAS EN TIEMPO REAL
          =================================================================== */}
          {(activeMobileTab === 'all' || activeMobileTab === 'graficos') && (
            <section aria-labelledby="telemetria-heading" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-6 rounded-sm bg-[#06B6D4]"></span>
                  <div>
                    <h2
                      id="telemetria-heading"
                      className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-100"
                    >
                      TELEMETRÍA Y TENDENCIAS EN TIEMPO REAL
                    </h2>
                    <p className="text-xs text-slate-400">
                      Monitoreo histórico de tandeos, volumen almacenado y picos de turbidez
                    </p>
                  </div>
                </div>

                {/* Selector de Pestañas: Última hora / 24h / 7 días */}
                <div className="inline-flex rounded-xl bg-[#1E293B] p-1 border border-slate-700 self-start sm:self-auto">
                  {[
                    { key: '1h', label: 'Última hora' },
                    { key: '24h', label: '24h' },
                    { key: '7d', label: '7 días' }
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setTimeRange(tab.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                        timeRange === tab.key
                          ? 'bg-[#06B6D4] text-slate-950 shadow'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* GRÁFICO 1: Curva de Nivel de Agua (L) y Eventos de Llenado por Tandeo */}
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-4 shadow-lg">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                        <Activity className="w-4 h-4 text-[#06B6D4]" />
                        Curva de Nivel de Agua (L) y Eventos de Llenado por Tandeo
                      </h3>
                      <p className="text-[11px] font-mono text-slate-400">
                        Capacidad máxima: 1,100 L • Ventanas de suministro OOMSAPAS
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-xs font-mono text-cyan-300">
                      Actual: {telemetry.tank.volumeLiters} L
                    </span>
                  </div>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={chartData[timeRange]}
                        margin={{ top: 10, right: 12, left: -10, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="waterLevelGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.45} />
                            <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                        <XAxis
                          dataKey="time"
                          stroke="#94A3B8"
                          tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'Roboto Mono' }}
                        />
                        <YAxis
                          domain={[400, 1100]}
                          stroke="#94A3B8"
                          tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'Roboto Mono' }}
                          unit=" L"
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0B1120',
                            borderColor: '#334155',
                            borderRadius: '8px',
                            fontFamily: 'Roboto Mono',
                            fontSize: '12px'
                          }}
                          formatter={(value, name, props) => [
                            `${value} Litros (${
                              props.payload.tandeo ? 'Tandeo Activo' : 'Consumo en Reposo'
                            })`,
                            'Nivel Tinaco'
                          ]}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: '11px', fontFamily: 'Roboto Mono' }}
                        />
                        <ReferenceLine
                          y={1100}
                          stroke="#10B981"
                          strokeDasharray="4 4"
                          label={{
                            value: 'Capacidad Máx 1,100L',
                            fill: '#10B981',
                            fontSize: 10,
                            position: 'insideTopRight'
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="level"
                          name="Volumen Tinaco (Litros)"
                          stroke="#06B6D4"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#waterLevelGrad)"
                          activeDot={{ r: 6, fill: '#06B6D4', stroke: '#fff' }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* GRÁFICO 2: Curva de Turbidez (NTU) vs Línea roja de corte normativo (4 NTU) */}
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-4 shadow-lg">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-[#EF4444]" />
                        Curva de Turbidez (NTU) vs Línea de Corte Normativo (4.0 NTU)
                      </h3>
                      <p className="text-[11px] font-mono text-slate-400">
                        Cierre automático de electroválvula al superar la línea carmesí (4.0 NTU)
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-mono border ${
                        telemetry.inlet.turbidity > 4.0
                          ? 'bg-red-500/20 border-red-500 text-red-300 font-bold'
                          : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      }`}
                    >
                      Actual: {telemetry.inlet.turbidity.toFixed(1)} NTU
                    </span>
                  </div>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData[timeRange]}
                        margin={{ top: 10, right: 12, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                        <XAxis
                          dataKey="time"
                          stroke="#94A3B8"
                          tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'Roboto Mono' }}
                        />
                        <YAxis
                          domain={[0, 8]}
                          stroke="#94A3B8"
                          tick={{ fill: '#94A3B8', fontSize: 11, fontFamily: 'Roboto Mono' }}
                          unit=" NTU"
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0B1120',
                            borderColor: '#334155',
                            borderRadius: '8px',
                            fontFamily: 'Roboto Mono',
                            fontSize: '12px'
                          }}
                          formatter={(value, name) => [
                            `${value} NTU`,
                            name === 'turbidity' ? 'Turbidez Entrada' : 'Límite NOM-127'
                          ]}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: '11px', fontFamily: 'Roboto Mono' }}
                        />
                        {/* Línea roja de corte normativo (4.0 NTU) */}
                        <ReferenceLine
                          y={4.0}
                          stroke="#EF4444"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          label={{
                            value: 'CORTE NOM-127 (4.0 NTU)',
                            fill: '#EF4444',
                            fontSize: 11,
                            fontWeight: 'bold',
                            position: 'insideTopRight'
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="turbidity"
                          name="Turbidez de Entrada (NTU)"
                          stroke="#F59E0B"
                          strokeWidth={2.5}
                          dot={{ r: 4, fill: '#F59E0B', strokeWidth: 1, stroke: '#0B1120' }}
                          activeDot={{ r: 6, fill: '#EF4444', stroke: '#fff' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="limit"
                          name="Límite Normativo (4.0 NTU)"
                          stroke="#EF4444"
                          strokeWidth={1.5}
                          strokeDasharray="3 3"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ===================================================================
              5. SALUD DEL SISTEMA Y MANTENIMIENTO PREDICTIVO
          =================================================================== */}
          {(activeMobileTab === 'all' || activeMobileTab === 'salud') && (
            <section aria-labelledby="salud-heading" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-6 rounded-sm bg-[#F59E0B]"></span>
                  <h2
                    id="salud-heading"
                    className="text-sm sm:text-base font-bold uppercase tracking-wider text-slate-100"
                  >
                    SALUD DEL SISTEMA Y MANTENIMIENTO PREDICTIVO
                  </h2>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  Algoritmo de desgaste por caudal e integración de turbidez (NTU·h)
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Columna Izquierda: Vida Útil del Filtro + Recordatorio de Lavado de Tinaco (5 cols) */}
                <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
                  {/* Tarjeta Filtro de Sedimentos de 5 micras */}
                  <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-4 shadow-lg space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-[#06B6D4]">
                          <Filter className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">
                            Filtro de Sedimentos de 5 Micras
                          </h3>
                          <p className="text-xs text-slate-400">
                            Cartucho de Polipropileno Termofusionado (Etapa 1)
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono text-emerald-300">
                        Operativo
                      </span>
                    </div>

                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-300 font-semibold">
                          {telemetry.maintenance.filter5MicronPercent}% de capacidad restante
                        </span>
                        <span className="text-[#06B6D4] font-bold">
                          {telemetry.maintenance.filterDaysRemaining} días estimados para reemplazo
                        </span>
                      </div>

                      <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#06B6D4] to-[#10B981] transition-all duration-500"
                          style={{ width: `${telemetry.maintenance.filter5MicronPercent}%` }}
                        />
                      </div>

                      <div className="flex justify-between text-[11px] font-mono text-slate-400 pt-1">
                        <span>
                          Volumen procesado:{' '}
                          {telemetry.maintenance.filterLitresProcessed.toLocaleString('es-MX')} L
                        </span>
                        <span>Sat. diferencial: 1.8 PSI</span>
                      </div>
                    </div>
                  </div>

                  {/* Tarjeta Recordatorio de Lavado de Tinaco */}
                  <div className="bg-[#1E293B] border border-slate-700/80 rounded-xl p-4 shadow-lg space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[#F59E0B]">
                          <Wrench className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">
                            Recordatorio Predictivo de Lavado de Tinaco
                          </h3>
                          <p className="text-xs text-slate-400">
                            Basado en acumulación acumulada de turbidez decantada
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-xs font-mono text-amber-300">
                        En {telemetry.maintenance.nextTankWashDays} días
                      </span>
                    </div>

                    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-400">Índice de sedimento decantado:</span>
                        <span className="text-amber-300 font-semibold">
                          {telemetry.maintenance.decantedSedimentIndex}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-[#F59E0B]"
                          style={{
                            width: `${telemetry.maintenance.tankWashAccumulatedNtuHours}%`
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-400">
                        <span>Última desinfección: {telemetry.maintenance.lastTankWashDate}</span>
                        <span>
                          Carga acumulada: {telemetry.maintenance.tankWashAccumulatedNtuHours}% del
                          umbral
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Columna Derecha: Registro de Eventos (Event Log) (7 cols) */}
                <div className="lg:col-span-7 bg-[#1E293B] border border-slate-700/80 rounded-xl p-4 shadow-lg flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-[#06B6D4]" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                        Registro de Eventos SCADA (Event Log)
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-slate-400">
                      Bitácora no volátil ESP32 Flash
                    </span>
                  </div>

                  <div className="space-y-2.5 max-h-[290px] overflow-y-auto pr-1">
                    {events.map((evt) => {
                      const badgeStyles =
                        evt.type === 'critical'
                          ? 'bg-[#EF4444]/15 border-[#EF4444]/50 text-red-200'
                          : evt.type === 'warning'
                          ? 'bg-[#F59E0B]/15 border-[#F59E0B]/40 text-amber-200'
                          : evt.type === 'success'
                          ? 'bg-[#10B981]/15 border-[#10B981]/40 text-emerald-200'
                          : 'bg-slate-900/90 border-slate-800 text-slate-200';

                      return (
                        <div
                          key={evt.id}
                          className={`p-3 rounded-xl border transition-all ${badgeStyles}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {evt.type === 'critical' && (
                                <AlertOctagon className="w-4 h-4 text-[#EF4444] shrink-0" />
                              )}
                              {evt.type === 'warning' && (
                                <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
                              )}
                              {evt.type === 'success' && (
                                <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                              )}
                              {evt.type === 'info' && (
                                <Info className="w-4 h-4 text-[#06B6D4] shrink-0" />
                              )}
                              <span className="text-xs sm:text-sm font-semibold">{evt.title}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950/70 text-slate-300 border border-slate-700">
                                {evt.code}
                              </span>
                              <span className="text-xs font-mono text-slate-400">
                                {evt.timestamp}
                              </span>
                            </div>
                          </div>
                          <p className="text-xs text-slate-300/90 mt-1 pl-6 font-mono">
                            {evt.detail}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* =====================================================================
          6. BOTÓN FLOTANTE DE DEMOSTRACIÓN ("Modo Demo / Simular Tandeo")
      ===================================================================== */}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 flex flex-col items-end gap-2">
        {/* Panel expandible opcional para control fino de los jueces */}
        {demoPanelOpen && (
          <div className="w-full sm:w-96 bg-[#0B1120]/95 backdrop-blur-md border-2 border-cyan-500/50 rounded-2xl p-4 shadow-2xl shadow-black space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#06B6D4]" />
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                  Simulador de Escenarios para Jueces
                </span>
              </div>
              <button
                onClick={() => setDemoPanelOpen(false)}
                className="text-xs font-mono text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800"
              >
                Cerrar ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Prueba cómo el nodo <strong>ESP32</strong> cierra autónomamente la electroválvula de
              12V cuando la turbidez supera los <strong>4.0 NTU</strong> o el TDS supera{' '}
              <strong>1000 ppm</strong>:
            </p>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() =>
                  applyScenario({
                    turbidity: 6.4,
                    tds: 890,
                    tempInlet: 25.2,
                    levelPercent: 78,
                    reasonLabel: 'Simulación: Golpe de turbidez en tandeo (6.4 NTU)'
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#EF4444]/20 hover:bg-[#EF4444]/30 border border-[#EF4444] text-left flex items-center justify-between transition"
              >
                <div>
                  <span className="text-xs font-bold text-red-200 block">
                    1. Simular Pico de Turbidez (6.4 NTU)
                  </span>
                  <span className="text-[11px] font-mono text-red-300">
                    Dispara corte automático NOM-127 (&gt; 4.0 NTU)
                  </span>
                </div>
                <AlertOctagon className="w-4 h-4 text-[#EF4444] shrink-0" />
              </button>

              <button
                type="button"
                onClick={() =>
                  applyScenario({
                    turbidity: 3.1,
                    tds: 1140,
                    tempInlet: 25.0,
                    levelPercent: 78,
                    reasonLabel: 'Simulación: Salinidad / TDS excesivo (1,140 ppm)'
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500 text-left flex items-center justify-between transition"
              >
                <div>
                  <span className="text-xs font-bold text-amber-200 block">
                    2. Simular Exceso de TDS (1,140 ppm)
                  </span>
                  <span className="text-[11px] font-mono text-amber-300">
                    Supera límite NOM-127 (&gt; 1,000 mg/L)
                  </span>
                </div>
                <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
              </button>

              <button
                type="button"
                onClick={() =>
                  applyScenario({
                    turbidity: 3.2,
                    tds: 680,
                    tempInlet: 24.5,
                    levelPercent: 78,
                    reasonLabel: 'Restauración a parámetros nominales (3.2 NTU / 680 ppm)'
                  })
                }
                className="w-full px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500 text-left flex items-center justify-between transition"
              >
                <div>
                  <span className="text-xs font-bold text-emerald-200 block">
                    3. Restaurar Valores Nominales (3.2 NTU)
                  </span>
                  <span className="text-[11px] font-mono text-emerald-300">
                    Reabre válvula solenoide 12V y reanuda llenado
                  </span>
                </div>
                <RotateCcw className="w-4 h-4 text-[#10B981] shrink-0" />
              </button>
            </div>

            {/* Toggle de Auto-Ciclo Aleatorio */}
            <div className="pt-1 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs font-mono text-slate-300">
                Alternancia aleatoria automática (5.5s):
              </span>
              <button
                type="button"
                onClick={() => setDemoAutoCycle((v) => !v)}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border transition ${
                  demoAutoCycle
                    ? 'bg-[#10B981] text-slate-950 border-[#10B981]'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {demoAutoCycle ? 'ACTIVO' : 'INACTIVO'}
              </button>
            </div>
          </div>
        )}

        {/* Botón Flotante Principal */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={handleTriggerTandeoSimulation}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl font-mono text-xs sm:text-sm font-bold shadow-2xl transition-all border-2 ${
              isEmergencyCutoff
                ? 'bg-[#EF4444] hover:bg-red-500 text-white border-red-200 shadow-red-950/80'
                : 'bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 border-cyan-200 shadow-cyan-950/80'
            }`}
          >
            <Play className="w-4 h-4 fill-current shrink-0" />
            <span>
              Modo Demo / Simular Tandeo{' '}
              {isEmergencyCutoff ? '(Restaurar < 4 NTU)' : '(Disparar > 4 NTU)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setDemoPanelOpen((prev) => !prev)}
            title="Abrir panel de escenarios de demostración"
            className="p-3 rounded-2xl bg-[#1E293B] hover:bg-slate-700 text-cyan-300 border-2 border-cyan-500/40 shadow-2xl transition shrink-0"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
