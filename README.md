# Purificando tu bienestar — Sistema IoT de Monitoreo Hídrico y Control Autónomo Domiciliario

Prototipo funcional de Dashboard Web Responsivo (Mobile-First y Desktop) estilo SCADA ligero para el monitoreo de calidad hídrica y control autónomo de admisión domiciliaria en **Los Cabos, B.C.S.** bajo los parámetros de la **NOM-127-SSA1-2021**.

🔗 **Demo Interactiva en Vivo:** [https://carbajaltacuba08-png.github.io/special-potato/](https://carbajaltacuba08-png.github.io/special-potato/)

---

## Características Principales

1. **Encabezado y Conectividad en Vivo:**
   - Estado del nodo **ESP32 (Wi-Fi 2.4 GHz)** con indicador RSSI y sincronización en tiempo real.
   - Conmutador de **Vista Celular** integrado para previsualizar la interfaz móvil desde escritorio.

2. **Zona 1 — Toma Municipal / Entrada (Cámara de Derivación / Bypass Activo):**
   - Monitoreo de **TDS de Entrada (`ppm`)**, **Turbidez (`NTU`)** y **Temperatura (`°C` con sonda DS18B20)**.
   - Control de **Electroválvula Solenoide (12V)** con modo **AUTOMÁTICO NOM-127** (corte automático cuando `Turbidez > 4.0 NTU` o `TDS > 1000 ppm`) y **Override Manual**.

3. **Zona 2 — Almacenamiento Doméstico (Tinaco de 1,100 L):**
   - Widget de nivel ultrasónico (**JSN-SR04T**) con indicador cilíndrico y radial (`%`, volumen en litros, días de autonomía familiar y distancia en `cm` al espejo de agua).
   - Métricas de calidad en reposo (**pH**, **TDS estabilizado** y **Temperatura interna**).

4. **Telemetría y Tendencias en Tiempo Real:**
   - Gráficos interactivos con selector de ventana temporal (**Última hora / 24h / 7 días**) para nivel del tinaco y curva de turbidez frente al límite normativo de `4.0 NTU`.

5. **Salud del Sistema y Mantenimiento Predictivo:**
   - Vida útil estimada del **Filtro de Sedimentos de 5 micras**, recordatorio predictivo de lavado de tinaco y **Registro de Eventos SCADA (Event Log)**.

6. **Simulador Interactivo para Jueces:**
   - Botón flotante **"Modo Demo / Simular Tandeo"** para demostrar en vivo el cierre automático de la electroválvula ante picos de turbidez.

---

## Ejecución Local

```bash
npm install
npm run dev
```
