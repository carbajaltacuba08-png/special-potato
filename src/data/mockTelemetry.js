// Datos iniciales y series históricas para el sistema SCADA IoT "Purificando tu bienestar"
// Los Cabos, B.C.S. - Cumplimiento NOM-127-SSA1-2021

export const INITIAL_STATE = {
  nodeId: 'Nodo Residencial Los Cabos #01',
  projectName: 'Purificando tu bienestar',
  subtitle: 'Sistema IoT de Monitoreo Hídrico y Control Autónomo Domiciliario',
  wifi: {
    connected: true,
    band: 'Wi-Fi 2.4 GHz',
    rssi: -62,
    ip: '192.168.1.142',
    firmware: 'ESP32-RTOS v2.4.1',
  },
  inlet: {
    tds: 680,          // ppm (Límite NOM-127 < 1000 mg/L)
    turbidity: 3.2,    // NTU (Límite NOM-127 < 4.0 NTU)
    temperature: 24.5, // °C (DS18B20)
    pressurePsi: 18.4, // PSI en toma municipal
    flowRateLpm: 14.2, // L/min cuando hay tandeo activo y válvula abierta
  },
  valve: {
    isOpen: true,
    mode: 'AUTO', // 'AUTO' (AUTOMÁTICO NOM-127) | 'MANUAL' (Override Manual)
    voltage: '12V DC',
    bypassActive: false, // true cuando se cierra admisión a tinaco por turbidez/TDS fuera de norma
    lastActionReason: 'Calidad dentro de parámetros NOM-127-SSA1-2021',
  },
  tank: {
    capacityLiters: 1100,
    levelPercent: 78,
    volumeLiters: 858,
    autonomyDays: 3.4,
    distanceCm: 51, // Sensor ultrasónico JSN-SR04T
    ph: 7.4,
    tdsStabilized: 520,
    temperatureInternal: 23.8,
  },
  maintenance: {
    filter5MicronPercent: 62,
    filterDaysRemaining: 18,
    filterLitresProcessed: 14820,
    tankWashAccumulatedNtuHours: 74, // % de umbral para lavado recomendado
    lastTankWashDate: '12 Ago 2026',
    nextTankWashDays: 42,
    decantedSedimentIndex: 'Moderado-Bajo (1.8 mm est.)',
  }
};

export const TELEMETRY_SERIES = {
  '1h': [
    { time: '15:50', level: 820, turbidity: 2.1, limit: 4.0, tds: 640, tandeo: true },
    { time: '15:55', level: 825, turbidity: 2.3, limit: 4.0, tds: 645, tandeo: true },
    { time: '16:00', level: 830, turbidity: 2.4, limit: 4.0, tds: 650, tandeo: true },
    { time: '16:05', level: 834, turbidity: 3.8, limit: 4.0, tds: 672, tandeo: true },
    { time: '16:10', level: 834, turbidity: 5.4, limit: 4.0, tds: 790, tandeo: true, event: 'Corte por Turbidez (5.4 NTU)' },
    { time: '16:15', level: 834, turbidity: 4.6, limit: 4.0, tds: 740, tandeo: true, event: 'Purga en Bypass' },
    { time: '16:20', level: 838, turbidity: 3.5, limit: 4.0, tds: 695, tandeo: true, event: 'Reapertura Automática' },
    { time: '16:25', level: 843, turbidity: 3.3, limit: 4.0, tds: 688, tandeo: true },
    { time: '16:30', level: 848, turbidity: 3.1, limit: 4.0, tds: 682, tandeo: true },
    { time: '16:35', level: 852, turbidity: 3.0, limit: 4.0, tds: 675, tandeo: true },
    { time: '16:40', level: 855, turbidity: 3.1, limit: 4.0, tds: 678, tandeo: true },
    { time: '16:45', level: 858, turbidity: 3.2, limit: 4.0, tds: 680, tandeo: true },
  ],
  '24h': [
    { time: '18:00', level: 790, turbidity: 1.9, limit: 4.0, tds: 610, tandeo: false },
    { time: '20:00', level: 745, turbidity: 1.8, limit: 4.0, tds: 605, tandeo: false },
    { time: '22:00', level: 710, turbidity: 1.8, limit: 4.0, tds: 605, tandeo: false },
    { time: '00:00', level: 695, turbidity: 1.9, limit: 4.0, tds: 612, tandeo: false },
    { time: '02:00', level: 690, turbidity: 2.2, limit: 4.0, tds: 630, tandeo: true, event: 'Inicio Tandeo Municipal' },
    { time: '03:14', level: 720, turbidity: 6.2, limit: 4.0, tds: 890, tandeo: true, event: 'Válvula cerrada por pico 6.2 NTU' },
    { time: '04:00', level: 720, turbidity: 4.4, limit: 4.0, tds: 760, tandeo: true },
    { time: '06:00', level: 810, turbidity: 2.9, limit: 4.0, tds: 660, tandeo: true, event: 'Llenado por Tandeo' },
    { time: '08:00', level: 910, turbidity: 2.6, limit: 4.0, tds: 645, tandeo: true },
    { time: '10:00', level: 880, turbidity: 2.4, limit: 4.0, tds: 640, tandeo: false },
    { time: '12:00', level: 845, turbidity: 2.5, limit: 4.0, tds: 655, tandeo: false },
    { time: '14:00', level: 815, turbidity: 2.8, limit: 4.0, tds: 665, tandeo: true, event: 'Tandeo Vespertino' },
    { time: '16:45', level: 858, turbidity: 3.2, limit: 4.0, tds: 680, tandeo: true },
  ],
  '7d': [
    { time: 'Lun', level: 640, turbidity: 3.4, limit: 4.0, tds: 710, tandeo: true, event: 'Tandeo Lunes' },
    { time: 'Mar', level: 920, turbidity: 2.5, limit: 4.0, tds: 635, tandeo: true },
    { time: 'Mié', level: 760, turbidity: 2.2, limit: 4.0, tds: 620, tandeo: false },
    { time: 'Jue', level: 580, turbidity: 4.9, limit: 4.0, tds: 845, tandeo: true, event: 'Corte Preventivo NOM-127' },
    { time: 'Vie', level: 890, turbidity: 2.8, limit: 4.0, tds: 660, tandeo: true, event: 'Recuperación Nivel' },
    { time: 'Sáb', level: 810, turbidity: 2.7, limit: 4.0, tds: 650, tandeo: false },
    { time: 'Hoy', level: 858, turbidity: 3.2, limit: 4.0, tds: 680, tandeo: true, event: 'Tandeo Activo' },
  ]
};

export const INITIAL_EVENTS = [
  {
    id: 'evt-1',
    timestamp: '16:20 PM',
    type: 'success',
    title: 'Reapertura automática de electroválvula (12V)',
    detail: 'Turbidez estabilizada en 3.2 NTU (< 4.0 NTU NOM-127). Llenado de tinaco reanudado.',
    code: 'NOM127-OK'
  },
  {
    id: 'evt-2',
    timestamp: '03:14 AM',
    type: 'critical',
    title: 'Válvula cerrada por pico de turbidez a las 03:14 AM',
    detail: 'Lectura crítica de 6.2 NTU en inicio de tandeo. Cámara de derivación / bypass activada.',
    code: 'TURB-CUTOFF'
  },
  {
    id: 'evt-3',
    timestamp: '02:00 AM',
    type: 'info',
    title: 'Tandeo municipal detectado en toma domiciliaria',
    detail: 'Presión de línea OOMSAPAS detectada (18.4 PSI). Iniciando protocolo de purga inicial.',
    code: 'TANDEO-IN'
  },
  {
    id: 'evt-4',
    timestamp: 'Ayer 19:40',
    type: 'warning',
    title: 'Precaución por incremento de Sólidos Disueltos (TDS)',
    detail: 'TDS de entrada alcanzó 680 ppm (Rango de precaución, límite normativo < 1000 mg/L).',
    code: 'TDS-WARN'
  }
];
