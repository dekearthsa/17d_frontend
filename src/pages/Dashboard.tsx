import { useMemo, useState, useEffect, useRef } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import useSWR from "swr";
import axios from "axios";

// const HTTP_API = "http://localhost:3011";
const HTTP_API = "https://api.bkkdemoondevearth.work";

type AdjustFormState = {
  adjust_name: string;
  after_exhausts_plus: string;
  after_exhausts_multiplier: string;
  after_exhausts_offset: string;
  before_exhaust_plus: string;
  before_exhaust_multiplier: string;
  before_exhaust_offset: string;
  interlock_4c_plus: string;
  interlock_4c_multiplier: string;
  interlock_4c_offset: string;
};

type HlrSetting = {
  id: number;
  adjust_name: string;
  is_active: number;
  create_at: number | null;
  update_at: number | null;
  after_exhausts_plus: number;
  after_exhausts_multiplier: number;
  after_exhausts_offset: number;
  before_exhaust_plus: number;
  before_exhaust_multiplier: number;
  before_exhaust_offset: number;
  interlock_4c_plus: number;
  interlock_4c_multiplier: number;
  interlock_4c_offset: number;
};

type Row = {
  id?: string | number;
  sensor_id: string | number;
  timestamp: number; // ms
  co2: number;
  temperature?: number; // เผื่อ backend เก่าส่งชื่อ temperature
  temp?: number; // backend ใหม่ส่ง temp
  humidity?: number;
  mode?: number | null; // 0..5 จาก interlock_4c, Scrub = null
};

// --- map mode → label
const MODE_LABEL: Record<number, string> = {
  0: "Manual mode",
  1: "Standby mode",
  2: "Scrubbing mode",
  3: "Regen mode",
  4: "Cooldown mode",
  5: "Alarming",
};

// --- 1) นาฬิกา 1Hz และหน้าต่างเวลาเลื่อน abcDEF99
const useNowTicker = (intervalMs: number) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return nowMs;
};

// --- 4) สร้างซีรีส์แบบเติม null ตรงว่าง
function buildSeries(
  rows: Row[],
  windowStart: number,
  windowEnd: number,
  pickY: (r: Row) => number | undefined | null,
  sensorLabel: (sid: string) => string
) {
  const bySensor = new Map<string, { x: number; y: number }[]>();

  for (const r of rows) {
    if (r.timestamp < windowStart || r.timestamp > windowEnd) continue;
    const yVal = pickY(r);
    if (yVal == null || Number.isNaN(yVal)) continue;

    const sid = String(r.sensor_id);
    if (!bySensor.has(sid)) bySensor.set(sid, []);
    bySensor.get(sid)!.push({ x: r.timestamp, y: yVal });
  }

  return Array.from(bySensor.entries()).map<Highcharts.SeriesSplineOptions>(
    ([sid, pts]) => ({
      type: "spline",
      name: sensorLabel(sid),
      data: pts.sort((a, b) => a.x - b.x).map((pt) => ({ x: pt.x, y: pt.y })),
      connectNulls: true,
    })
  );
}

// --- สี highlight ตาม mode
const MODE_COLORS: Record<number, string> = {
  0: "rgba(148,163,184,0.18)", // manual
  1: "rgba(59,130,246,0.18)", // standby
  2: "rgba(34,197,94,0.20)", // scrubbing
  3: "rgba(250,204,21,0.20)", // regen
  4: "rgba(56,189,248,0.20)", // cooldown
  5: "rgba(248,113,113,0.22)", // alarming
};

function buildModeBands(
  rows: Row[],
  windowStart: number,
  windowEnd: number
): Highcharts.XAxisPlotBandsOptions[] {
  const interlockRows = rows
    .filter((r) => {
      const sid = String(r.sensor_id);
      return sid === "interlock_4c" || sid === "4"; // เผื่อกรณีส่งเป็นเลข 4
    })
    .filter((r) => r.timestamp >= windowStart && r.timestamp <= windowEnd)
    .sort((a, b) => a.timestamp - b.timestamp);

  const bands: Highcharts.XAxisPlotBandsOptions[] = [];
  let currentMode: number | null = null;
  let currentStart: number | null = null;

  for (const r of interlockRows) {
    const t = r.timestamp;
    const mode = typeof r.mode === "number" ? r.mode : null;

    // ไม่มี mode หรือไม่มีสีให้ → ปิด band เดิมถ้ามี
    if (mode == null || MODE_COLORS[mode] == null) {
      if (currentMode != null && currentStart != null) {
        bands.push({
          from: currentStart,
          to: t,
          color: MODE_COLORS[currentMode],
        });
        currentMode = null;
        currentStart = null;
      }
      continue;
    }

    // ยังไม่มี band → เปิดใหม่
    if (currentMode == null) {
      currentMode = mode;
      currentStart = t;
      continue;
    }

    // mode เปลี่ยน → ปิด band เดิมแล้วเปิดใหม่
    if (mode !== currentMode) {
      bands.push({
        from: currentStart!,
        to: t,
        color: MODE_COLORS[currentMode],
      });
      currentMode = mode;
      currentStart = t;
    }
  }

  // ปิด band ท้ายสุดลากไปถึง windowEnd
  if (currentMode != null && currentStart != null) {
    bands.push({
      from: currentStart,
      to: windowEnd,
      color: MODE_COLORS[currentMode],
    });
  }

  return bands;
}

function buildChartOptions(
  series: Highcharts.SeriesSplineOptions[],
  yAxisTitle: string,
  unitLabel: string,
  windowStart: number,
  windowEnd: number,
  xPlotBands: Highcharts.XAxisPlotBandsOptions[] = []
): Highcharts.Options {
  return {
    time: {
      timezone: "Asia/Bangkok",
    },
    chart: {
      type: "spline",
      height: 360,
      backgroundColor: "transparent",
      style: { fontFamily: "Inter, 'Noto Sans Thai', sans-serif" },
      zooming: {
        type: "x",
      },
      panning: {
        enabled: true,
        type: "x",
      },
      panKey: "shift",
      resetZoomButton: {
        theme: {
          fill: "#1e293b",
          stroke: "#64748b",
          r: 4,
          style: { color: "#e2e8f0" },
        },
      },
    },

    title: { text: undefined },
    legend: {
      itemStyle: { color: "#cbd5e1" },
    },
    xAxis: {
      type: "datetime",
      min: windowStart,
      max: windowEnd,
      crosshair: { color: "rgba(148,163,184,0.35)" },
      plotBands: xPlotBands, // 👈 highlight mode อยู่ตรงนี้
      labels: {
        style: { color: "#94a3b8" },
        format: "{value:%d/%m %H:%M}",
      },
      lineColor: "#334155",
      tickColor: "#334155",
    },

    yAxis: {
      title: { text: yAxisTitle, style: { color: "#cbd5e1" } },
      labels: { style: { color: "#94a3b8" } },
      min: 0,
      gridLineColor: "#334155",
    },
    tooltip: {
      shared: true,
      backgroundColor: "#020617",
      borderColor: "#1f2933",
      style: { color: "#e5e7eb" },
      xDateFormat: "%H:%M:%S",
      valueSuffix: ` ${unitLabel}`,
      valueDecimals: 2,
    },
    plotOptions: {
      series: {
        marker: { enabled: false },
        lineWidth: 2,
        connectNulls: true,
      },
    },
    series,
    credits: { enabled: false },
    exporting: { enabled: true },
  };
}

const Dashboard = () => {
  const postFetcher = async ([url, body]: [
    string,
    { start: number; latesttime: number; rangeSelected: number }
  ]) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.text()) || "POST failed");
    return res.json();
  };

  const [timeHis, setTimeHis] = useState(1800000);
  const [isNewestIAQ, setNewestIAQ] = useState<any[]>([]);
  const [modeOperate, setModeOperate] = useState("Mode: -");
  const [iaq, setIaq] = useState<Row[]>([]);
  // 👇 ช่วงเวลาสำหรับดาวน์โหลด CSV (เลือกเองได้)
  const [downloadStartMs, setDownloadStartMs] = useState<number | null>(null);
  const [downloadEndMs, setDownloadEndMs] = useState<number | null>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [settings, setSettings] = useState<HlrSetting[]>([]);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false); // 👈 ใหม่

  const [adjustForm, setAdjustForm] = useState<AdjustFormState>({
    adjust_name: "default",
    after_exhausts_plus: "52.831276",
    after_exhausts_multiplier: "1.0640014",
    after_exhausts_offset: "0",
    before_exhaust_plus: "55.215733",
    before_exhaust_multiplier: "1.072297996",
    before_exhaust_offset: "0",
    interlock_4c_plus: "16.238157",
    interlock_4c_multiplier: "1.048766343",
    interlock_4c_offset: "0",
  });

  const [isSavingAdjust, setIsSavingAdjust] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const latesttimeRef = useRef<number>(0);
  const nowMs = useNowTicker(10000);
  const windowStart = nowMs - timeHis;

  // แก้ค่าฟอร์มทีละช่อง
  const handleAdjustFieldChange = (
    field: keyof AdjustFormState,
    value: string
  ) => {
    setAdjustForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // 👇 ใหม่: modal แสดงรายการ preset
  const openPresetModal = () => {
    setAdjustError(null);
    setShowPresetModal(true);
    fetchSettings(); // โหลดรายการ preset ทุกครั้งที่เปิด
  };

  const closePresetModal = () => {
    if (!isSavingAdjust) {
      setShowPresetModal(false);
    }
  };

  const fetchSettings = async () => {
    try {
      setIsLoadingSettings(true);
      setAdjustError(null);

      const res = await axios.get(`${HTTP_API}/get/setting_hlr`);
      const list: HlrSetting[] = res.data?.data ?? [];
      setSettings(list);
    } catch (err) {
      console.error("fetch settings error:", err);
      setAdjustError("โหลดรายการ preset ไม่สำเร็จ");
    } finally {
      setIsLoadingSettings(false);
    }
  };
  const handleLoadPresetToForm = (s: HlrSetting) => {
    setAdjustForm({
      adjust_name: s.adjust_name,
      after_exhausts_plus: String(s.after_exhausts_plus ?? ""),
      after_exhausts_multiplier: String(s.after_exhausts_multiplier ?? ""),
      after_exhausts_offset: String(s.after_exhausts_offset ?? ""),
      before_exhaust_plus: String(s.before_exhaust_plus ?? ""),
      before_exhaust_multiplier: String(s.before_exhaust_multiplier ?? ""),
      before_exhaust_offset: String(s.before_exhaust_offset ?? ""),
      interlock_4c_plus: String(s.interlock_4c_plus ?? ""),
      interlock_4c_multiplier: String(s.interlock_4c_multiplier ?? ""),
      interlock_4c_offset: String(s.interlock_4c_offset ?? ""),
    });

    // ถ้าเรียกจาก popup presets ก็ให้เปิดหน้าตั้งค่าขึ้นมาเลย
    setShowAdjustModal(true);
  };

  const handleUsePresetFromList = async (name: string) => {
    try {
      setIsSavingAdjust(true);
      setAdjustError(null);

      await axios.post(`${HTTP_API}/adjust/active`, {
        adjust_name: name,
      });

      await axios.post(`${HTTP_API}/adjust/usage`, {
        adjust_name: name,
      });

      await mutate(); // refresh กราฟให้ใช้ active preset ใหม่

      alert(`ใช้ preset "${name}" เป็น active เรียบร้อย`);

      // ปิด popup ที่เกี่ยวข้อง
      setShowPresetModal(false);
      setShowAdjustModal(false);
    } catch (err) {
      console.error("use preset error:", err);
      setAdjustError("ใช้ preset ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setIsSavingAdjust(false);
    }
  };

  const openAdjustModal = () => {
    setAdjustError(null);
    setShowAdjustModal(true);
    fetchSettings(); // โหลด preset ปัจจุบันมาแสดงใน modal
  };

  const closeAdjustModal = () => {
    if (!isSavingAdjust) {
      setShowAdjustModal(false);
    }
  };

  const toNumberOrUndefined = (value: string) => {
    if (value === "" || value == null) return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  };

  const buildAdjustPayload = () => {
    const name = adjustForm.adjust_name.trim() || "default";
    return {
      adjust_name: name,
      after_exhausts_plus: toNumberOrUndefined(adjustForm.after_exhausts_plus),
      after_exhausts_multiplier: toNumberOrUndefined(
        adjustForm.after_exhausts_multiplier
      ),
      after_exhausts_offset: toNumberOrUndefined(
        adjustForm.after_exhausts_offset
      ),
      before_exhaust_plus: toNumberOrUndefined(adjustForm.before_exhaust_plus),
      before_exhaust_multiplier: toNumberOrUndefined(
        adjustForm.before_exhaust_multiplier
      ),
      before_exhaust_offset: toNumberOrUndefined(
        adjustForm.before_exhaust_offset
      ),
      interlock_4c_plus: toNumberOrUndefined(adjustForm.interlock_4c_plus),
      interlock_4c_multiplier: toNumberOrUndefined(
        adjustForm.interlock_4c_multiplier
      ),
      interlock_4c_offset: toNumberOrUndefined(adjustForm.interlock_4c_offset),
    };
  };

  const handleSaveAdjust = async () => {
    try {
      setIsSavingAdjust(true);
      setAdjustError(null);

      const payload = buildAdjustPayload();

      // ✅ บันทึก preset อย่างเดียว ยังไม่ active
      await axios.post(`${HTTP_API}/update/setting_adjust`, payload);

      alert("บันทึกค่า HLR adjust สำเร็จ (แต่ยังไม่ได้ใช้งานเป็น preset หลัก)");
    } catch (err) {
      console.error("save adjust error:", err);
      setAdjustError("บันทึกค่าไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setIsSavingAdjust(false);
    }
  };

  const handleApplyAdjust = async () => {
    try {
      setIsSavingAdjust(true);
      setAdjustError(null);

      const payload = buildAdjustPayload();

      // 1) อัปเดต/สร้าง preset
      await axios.post(`${HTTP_API}/update/setting_adjust`, payload);

      // 2) ตั้ง preset นี้ให้ active
      await axios.post(`${HTTP_API}/adjust/active`, {
        adjust_name: payload.adjust_name,
      });

      // 3) log การใช้งาน
      await axios.post(`${HTTP_API}/adjust/usage`, {
        adjust_name: payload.adjust_name,
      });

      // 4) refresh กราฟ ให้ใช้ค่า active ใหม่ทันที
      await mutate();

      alert(
        `ใช้ setting "${payload.adjust_name}" เป็น preset หลักและบันทึกประวัติเรียบร้อย`
      );
      setShowAdjustModal(false);
    } catch (err) {
      console.error("apply adjust error:", err);
      setAdjustError("ใช้ setting ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setIsSavingAdjust(false);
    }
  };

  // helper แปลง ms -> format ของ <input type="datetime-local">
  const toInputValue = (ms: number | null) => {
    if (!ms) return "";
    const d = new Date(ms);
    const pad = (n: number) => n.toString().padStart(2, "0");
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${y}-${m}-${day}T${h}:${min}`;
  };

  // set default ครั้งแรก ถ้ายังไม่ได้เลือกเอง
  useEffect(() => {
    if (downloadStartMs == null || downloadEndMs == null) {
      setDownloadStartMs(windowStart);
      setDownloadEndMs(nowMs);
    }
  }, [windowStart, nowMs, downloadStartMs, downloadEndMs]);

  const handleChangeDownloadStart = (e: any) => {
    const val = e.target.value; // "YYYY-MM-DDTHH:MM"
    if (!val) {
      setDownloadStartMs(null);
      return;
    }
    const ms = new Date(val).getTime();
    setDownloadStartMs(ms);
  };

  const handleChangeDownloadEnd = (e: any) => {
    const val = e.target.value;
    if (!val) {
      setDownloadEndMs(null);
      return;
    }
    const ms = new Date(val).getTime();
    setDownloadEndMs(ms);
  };

  const handleDownloadCsv = async (type: "tongdy" | "interlock") => {
    const endpoint =
      type === "tongdy" ? "/download/tongdy/csv" : "/download/interlock/csv";

    // ถ้า user ยังไม่เลือก ใช้ช่วงเดียวกับกราฟเป็น default
    const startMs = downloadStartMs ?? windowStart;
    const endMs = downloadEndMs ?? nowMs;

    if (!startMs || !endMs) {
      alert("กรุณาเลือกช่วงเวลาเริ่มต้นและสิ้นสุด");
      return;
    }
    if (startMs >= endMs) {
      alert("เวลาเริ่มต้นต้องน้อยกว่าเวลาสิ้นสุด");
      return;
    }

    try {
      const res = await axios.post(
        `${HTTP_API}${endpoint}`,
        {
          startMs,
          endMs,
        },
        {
          responseType: "blob",
        }
      );

      const blob = new Blob([res.data], {
        type: "text/csv;charset=utf-8;",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      const safe = (ts: number) =>
        new Date(ts).toISOString().replace(/[:.]/g, "-");

      const startStr = safe(startMs);
      const endStr = safe(endMs);

      link.href = url;
      link.setAttribute("download", `${type}-data_${startStr}_${endStr}.csv`);

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("download csv error:", err);
      alert("ดาวน์โหลด CSV ไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  };

  // fastfixed mode
  const { mutate } = useSWR(
    [
      `${HTTP_API}/loop/data/iaq`,
      {
        start: Date.now() - timeHis,
        latesttime: latesttimeRef.current || 0,
        rangeSelected: 0,
      },
    ],
    postFetcher,
    {
      refreshInterval: 100000,
      onSuccess: (d: Row[]) => {
        if (!d?.length) return;

        // 👇 ปรับ co2 เฉพาะ before_scrub
        const adjusted = d.map((row) => {
          if (String(row.sensor_id) === "before_scrub") {
            const original = row.co2 ?? 0;
            return {
              ...row,
              co2: original - 66.88, // หรือ Math.max(original - 66.88, 0) ถ้าไม่อยากติดลบ
            };
          }
          return row;
        });

        console.log(adjusted);
        latesttimeRef.current = adjusted[adjusted.length - 1].timestamp;

        setIaq((prev) => {
          const cutoff = Date.now() - timeHis;
          const merged = [...prev, ...adjusted];
          const map = new Map<string, Row>();

          for (const r of merged) {
            const key =
              r.id != null ? String(r.id) : `${r.sensor_id}-${r.timestamp}`;
            map.set(key, r); // ของใหม่ทับของเก่า
          }

          return Array.from(map.values())
            .filter((r) => r.timestamp >= cutoff)
            .sort((a, b) => a.timestamp - b.timestamp);
        });
      },
    }
  );

  // const { mutate } = useSWR(
  //   [
  //     `${HTTP_API}/loop/data/iaq`,
  //     {
  //       start: Date.now() - timeHis,
  //       latesttime: latesttimeRef.current || 0,
  //       rangeSelected: 0,
  //     },
  //   ],
  //   postFetcher,
  //   {
  //     refreshInterval: 100000,
  //     onSuccess: (d: Row[]) => {
  //       if (!d?.length) return;
  //       console.log(d);
  //       latesttimeRef.current = d[d.length - 1].timestamp;
  //       setIaq((prev) => {
  //         const cutoff = Date.now() - timeHis;
  //         const merged = [...prev, ...d];
  //         const map = new Map<string, Row>();
  //         for (const r of merged) {
  //           const key =
  //             r.id != null ? String(r.id) : `${r.sensor_id}-${r.timestamp}`;
  //           map.set(key, r); // ของใหม่ทับของเก่า
  //         }
  //         return Array.from(map.values())
  //           .filter((r) => r.timestamp >= cutoff)
  //           .sort((a, b) => a.timestamp - b.timestamp);
  //       });
  //     },
  //   }
  // );

  const modeLegend = useMemo(
    () =>
      Object.entries(MODE_LABEL).map(([modeStr, label]) => {
        const mode = Number(modeStr);
        return {
          mode,
          label,
          color: MODE_COLORS[mode],
        };
      }),
    []
  );

  const handleExport = async () => {
    await mutate();
  };

  const labelSensor = (sid: string) =>
    ({
      before_scrub: "CO₂ Before Scrub",
      after_scrub: "CO₂ After Scrub",
      interlock_4c: "CO₂ Interlock 4C",
      "1": "CO₂ Calibrate",
      "2": "CO₂ Outlet",
      "3": "CO₂ Inlet",
      "4": "CO₂ Regen",
    }[sid] || `CO₂ Sensor ${sid}`);

  const handlerStartGet = async (ms: number) => {
    const payload = {
      start: Date.now() - ms,
      latesttime: 0,
      rangeSelected: ms,
    };
    const newData = await axios.post<Row[]>(
      `${HTTP_API}/loop/data/iaq`,
      payload
    );
    setIaq(newData.data);
  };

  useEffect(() => {
    handleExport();
  }, [timeHis]);

  // --- คำนวณค่า latest ของแต่ละ sensor_id จาก iaq ทุกครั้งที่ iaq เปลี่ยน
  const getLastestIAQData = (rows: Row[]) => {
    // เตรียม fallback สำหรับแต่ละ sensor
    const fallbackMap: Record<string, any> = {
      before_scrub: {
        id: "-",
        label: "Inlet (Before Scrub)",
        sensor_id: "before_scrub",
        timestamp: 0,
        co2: null,
        humidity: null,
        temperature: null,
        mode: null,
      },
      after_scrub: {
        id: "-",
        label: "Outlet (After Scrub)",
        sensor_id: "after_scrub",
        timestamp: 0,
        co2: null,
        humidity: null,
        temperature: null,
        mode: null,
      },
      interlock_4c: {
        id: "-",
        label: "Interlock 4C",
        sensor_id: "interlock_4c",
        timestamp: 0,
        co2: null,
        humidity: null,
        temperature: null,
        mode: null,
      },
    };

    const targetSensors = ["before_scrub", "after_scrub", "interlock_4c"];

    // clone fallback
    const latest: Record<string, any> = {
      before_scrub: { ...fallbackMap.before_scrub },
      after_scrub: { ...fallbackMap.after_scrub },
      interlock_4c: { ...fallbackMap.interlock_4c },
    };

    for (const el of rows) {
      const sid = String(el.sensor_id);
      if (!targetSensors.includes(sid)) continue;

      const current = latest[sid];
      if (!current || el.timestamp > current.timestamp) {
        latest[sid] = {
          id: el.id ?? `${sid}-${el.timestamp}`,
          label: fallbackMap[sid].label,
          sensor_id: sid,
          timestamp: el.timestamp,
          co2: el.co2 ?? null,
          humidity: el.humidity ?? null,
          temperature: el.temperature ?? el.temp ?? null,
          mode: el.mode ?? null,
        };
      }
    }

    const latestBefore = latest["before_scrub"];
    const latestAfter = latest["after_scrub"];
    const latestInterlock = latest["interlock_4c"];

    setNewestIAQ([latestBefore, latestAfter, latestInterlock]);

    const m = latestInterlock.mode;
    if (typeof m === "number" && m in MODE_LABEL) {
      setModeOperate(`Mode: ${MODE_LABEL[m]}`);
    } else {
      setModeOperate("Mode: -");
    }
  };

  useEffect(() => {
    getLastestIAQData(iaq);
  }, [iaq]);

  // --- highlight bands จาก interlock_4c
  const modeBands = useMemo(
    () => buildModeBands(iaq, windowStart, nowMs),
    [iaq, windowStart, nowMs]
  );

  // --- series
  const co2Series = useMemo(() => {
    return buildSeries(iaq, windowStart, nowMs, (r) => r.co2, labelSensor);
  }, [iaq, windowStart, nowMs]);

  const tempSeries = useMemo(() => {
    const label = (sid: string) =>
      ({
        before_scrub: "Temp Before Scrub",
        after_scrub: "Temp After Scrub",
        interlock_4c: "Temp Interlock 4C",
        "1": "Temp Calibrate",
        "2": "Temp Outlet",
        "3": "Temp Inlet",
        "4": "Temp Regen",
        "51": "Temp TK",
      }[sid] || `Temp ${sid}`);

    return buildSeries(
      iaq,
      windowStart,
      nowMs,
      (r) => r.temperature ?? r.temp ?? null,
      label
    );
  }, [iaq, windowStart, nowMs]);

  const humidSeries = useMemo(() => {
    const label = (sid: string) =>
      ({
        before_scrub: "Humid Before Scrub",
        after_scrub: "Humid After Scrub",
        interlock_4c: "Humid Interlock 4C",
        "1": "Humid Calibrate",
        "2": "Humid Outlet",
        "3": "Humid Inlet",
        "4": "Humid Regen",
        "51": "Humid TK",
      }[sid] || `Humid ${sid}`);

    return buildSeries(
      iaq,
      windowStart,
      nowMs,
      (r) => r.humidity ?? null,
      label
    );
  }, [iaq, windowStart, nowMs]);

  const optionsCo2 = useMemo<Highcharts.Options>(
    () =>
      buildChartOptions(
        co2Series,
        "CO₂ (ppm)",
        "ppm",
        windowStart,
        nowMs,
        modeBands
      ),
    [co2Series, windowStart, nowMs, modeBands]
  );

  const optionsTemp = useMemo<Highcharts.Options>(
    () =>
      buildChartOptions(
        tempSeries,
        "Temp (°C)",
        "°C",
        windowStart,
        nowMs,
        modeBands
      ),
    [tempSeries, windowStart, nowMs, modeBands]
  );

  const optionsHumid = useMemo<Highcharts.Options>(
    () =>
      buildChartOptions(
        humidSeries,
        "Humid (%RH)",
        "%RH",
        windowStart,
        nowMs,
        modeBands
      ),
    [humidSeries, windowStart, nowMs, modeBands]
  );

  return (
    <div className="ml-[4%] min-h-screen  flex justify-center  bg-gray-950 text-gray-100">
      <div className="w-[85%] mt-10 border-[1px] border-gray-500 p-3 mb-10 rounded-lg">
        <div className="flex justify-between">
          <div className="p-4">
            <div>{modeOperate}</div>
            {/* 👇 Widget เลือกวันที่/เวลา + download CSV */}
            <div className="mt-6">
              <div className="mr-10 mb-2">
                <label>Download CSV</label>
              </div>
              <div className="items-center gap-3">
                <div className="flex flex-col w-[200px] ">
                  <span className="mb-1 text-[11px] text-gray-400">Start</span>
                  <input
                    type="datetime-local"
                    className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
                    value={toInputValue(downloadStartMs)}
                    onChange={handleChangeDownloadStart}
                  />
                </div>
                <div className="flex flex-col w-[200px] ">
                  <span className="mb-1 text-[11px] text-gray-400">End</span>
                  <input
                    type="datetime-local"
                    className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
                    value={toInputValue(downloadEndMs)}
                    onChange={handleChangeDownloadEnd}
                  />
                </div>

                <div className="mt-4">
                  <button
                    className="border border-gray-700 px-3 py-2 rounded-lg hover:bg-gray-800 text-xs mr-4"
                    onClick={() => handleDownloadCsv("tongdy")}
                  >
                    Download Tongdy CSV
                  </button>
                  <button
                    className="border border-gray-700 px-3 py-2 rounded-lg hover:bg-gray-800 text-xs"
                    onClick={() => handleDownloadCsv("interlock")}
                  >
                    Download Interlock CSV
                  </button>
                </div>
              </div>

              {/* <div className="mt-1 text-[11px] text-gray-500">
                ถ้าไม่เลือกเวลา ระบบจะใช้ช่วงเดียวกับกราฟ (
                {new Date(windowStart).toLocaleString("th-TH")} –{" "}
                {new Date(nowMs).toLocaleString("th-TH")})
              </div> */}
            </div>
            {/* 👆 จบ widget download */}
          </div>

          <div className="p-4  text-[12px]">
            <div className="">
              <div className="mr-10 mb-2">
                <label>Previous</label>
              </div>
              <div className="flex">
                <button
                  className={`mr-3 border-[1px] border-gray-700 p-2 rounded-lg ${
                    timeHis === 604800000 ? "bg-gray-600" : ""
                  }`}
                  onClick={() => {
                    setTimeHis(604800000);
                    handlerStartGet(604800000);
                  }}
                >
                  7DAYS
                </button>
                <button
                  className={`mr-3 border-[1px] border-gray-700 p-2 rounded-lg ${
                    timeHis === 24 * 60 * 60 * 1000 ? "bg-gray-600" : ""
                  }`}
                  onClick={() => {
                    setTimeHis(24 * 60 * 60 * 1000);
                    handlerStartGet(24 * 60 * 60 * 1000);
                  }}
                >
                  1DAYS
                </button>
                <button
                  className={`mr-3 border-[1px] border-gray-700 p-2 rounded-lg ${
                    timeHis === 12 * 60 * 60 * 1000 ? "bg-gray-600" : ""
                  }`}
                  onClick={() => {
                    setTimeHis(12 * 60 * 60 * 1000);
                    handlerStartGet(12 * 60 * 60 * 1000);
                  }}
                >
                  12HOURS
                </button>
                <button
                  className={`mr-3 border-[1px] border-gray-700 p-2 rounded-lg ${
                    timeHis === 4 * 60 * 60 * 1000 ? "bg-gray-600" : ""
                  }`}
                  onClick={() => {
                    setTimeHis(4 * 60 * 60 * 1000);
                    handlerStartGet(4 * 60 * 60 * 1000);
                  }}
                >
                  4HOURS
                </button>
                <button
                  className={`mr-3 border-[1px] border-gray-700 p-2 rounded-lg ${
                    timeHis === 3600000 ? "bg-gray-600" : ""
                  }`}
                  onClick={() => {
                    setTimeHis(3600000);
                    handlerStartGet(3600000);
                  }}
                >
                  1HOURS
                </button>
                <button
                  className={`mr-3 border-[1px] border-gray-700 p-2 rounded-lg ${
                    timeHis === 1800000 ? "bg-gray-600" : ""
                  }`}
                  onClick={() => {
                    setTimeHis(1800000);
                    handlerStartGet(1800000);
                  }}
                >
                  30MIN
                </button>
              </div>
              <div className="flex"></div>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  className="border border-indigo-500 text-[11px] px-3 py-2 rounded-lg hover:bg-indigo-600/20"
                  onClick={openAdjustModal}
                >
                  ตั้งค่า HLR Adjust
                </button>

                <button
                  className="border border-sky-500 text-[11px] px-3 py-2 rounded-lg hover:bg-sky-600/20"
                  onClick={openPresetModal}
                >
                  รายการ Preset
                </button>
              </div>

              {showPresetModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                  <div className="bg-gray-900 border border-gray-700 rounded-2xl w-[95%] max-w-3xl p-5 shadow-xl">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-sm font-semibold text-gray-100">
                        รายการ HLR Adjust Preset
                      </h2>
                      <button
                        className="text-gray-400 hover:text-gray-200 text-lg"
                        onClick={closePresetModal}
                        disabled={isSavingAdjust}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-gray-100">
                        รายการ HLR Adjust Preset
                      </span>
                      <button
                        className="text-[11px] px-2 py-1 border border-gray-600 rounded-lg hover:bg-gray-800 disabled:opacity-50"
                        onClick={fetchSettings}
                        disabled={isLoadingSettings || isSavingAdjust}
                      >
                        รีเฟรชรายการ
                      </button>
                    </div>

                    {isLoadingSettings ? (
                      <div className="text-[11px] text-gray-400">
                        กำลังโหลด preset ...
                      </div>
                    ) : settings.length === 0 ? (
                      <div className="text-[11px] text-gray-500">
                        ยังไม่มี preset ในระบบ (จะถูกสร้างเมื่อคุณกด
                        "บันทึกค่า")
                      </div>
                    ) : (
                      <div className="max-h-72 overflow-y-auto border border-gray-700 rounded-xl">
                        <table className="w-full text-[11px]">
                          <thead className="bg-gray-950/70">
                            <tr className="text-gray-400">
                              <th className="px-3 py-2 text-left">Preset</th>
                              <th className="px-3 py-2 text-left">สถานะ</th>
                              <th className="px-3 py-2 text-left">
                                อัปเดตล่าสุด
                              </th>
                              <th className="px-3 py-2 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {settings.map((s) => {
                              const updated = s.update_at
                                ? new Date(s.update_at)
                                : s.create_at
                                ? new Date(s.create_at)
                                : null;
                              const updatedStr = updated
                                ? `${updated.getDate()}/${
                                    updated.getMonth() + 1
                                  }/${updated.getFullYear()} ${updated
                                    .getHours()
                                    .toString()
                                    .padStart(2, "0")}:${updated
                                    .getMinutes()
                                    .toString()
                                    .padStart(2, "0")}`
                                : "-";

                              return (
                                <tr
                                  key={s.id}
                                  className="border-t border-gray-800 hover:bg-gray-800/40"
                                >
                                  <td className="px-3 py-2 text-gray-100">
                                    {s.adjust_name}
                                  </td>
                                  <td className="px-3 py-2">
                                    {s.is_active === 1 ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                        Active
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-700/40 text-gray-300 border border-gray-600/60">
                                        Inactive
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-gray-300">
                                    {updatedStr}
                                  </td>
                                  <td className="px-3 py-2 text-right space-x-2">
                                    <button
                                      className="px-2 py-1 border border-gray-600 rounded-lg text-[10px] text-gray-200 hover:bg-gray-800"
                                      onClick={() => handleLoadPresetToForm(s)}
                                      disabled={isSavingAdjust}
                                    >
                                      โหลดค่า
                                    </button>
                                    <button
                                      className="px-2 py-1 border border-indigo-500 rounded-lg text-[10px] text-indigo-100 bg-indigo-600/20 hover:bg-indigo-600/30 disabled:opacity-50"
                                      onClick={() =>
                                        handleUsePresetFromList(s.adjust_name)
                                      }
                                      disabled={isSavingAdjust}
                                    >
                                      ใช้ preset นี้
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {adjustError && (
                      <div className="mt-3 text-[11px] text-red-400">
                        {adjustError}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ปุ่มเปิด HLR Adjust Setting */}
              {/* <div className="mt-4 flex justify-end">
                <button
                  className="border border-indigo-500 text-[11px] px-3 py-2 rounded-lg hover:bg-indigo-600/20"
                  onClick={openAdjustModal}
                >
                  เปิด HLR Adjust Setting
                </button>
              </div> */}
            </div>
          </div>
        </div>

        <div className="">
          <div className="ml-5 mr-5 border-[1px] border-gray-500 rounded-md h-[100%]  p-3 pb-8">
            {isNewestIAQ.map((el: any, index: number) => {
              const hasTimestamp = el.timestamp && el.timestamp > 0;
              const dt = hasTimestamp ? new Date(el.timestamp) : null;
              return (
                <div key={index}>
                  <div className="mt-5 mb-5 ml-3">
                    <span className="border-b-[1px]">Sensor: {el.label}</span>
                    <span className="text-[13px] text-gray-600 ml-5">
                      Update{" "}
                      {dt
                        ? `${dt.getDate()}/${
                            dt.getMonth() + 1
                          }/${dt.getFullYear()} ${dt.getHours()}:${dt.getMinutes()}:${dt.getSeconds()}`
                        : "-"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 mt-3">
                    <div className="border-[1px] border-gray-500 p-2 w-[200px] rounded-lg text-center m-auto ">
                      <div>CO₂ (ppm)</div>
                      <div className="mt-10 text-[23px]">
                        {el.co2 != null ? el.co2.toFixed(2) : "-"}
                      </div>
                    </div>
                    <div className="border-[1px] border-gray-500 p-2 w-[200px] rounded-lg text-center m-auto">
                      <div>Temperature (C)</div>
                      <div className="mt-10 text-[23px]">
                        {el.temperature != null
                          ? el.temperature.toFixed(2)
                          : "-"}
                      </div>
                    </div>
                    <div className="border-[1px] border-gray-500 p-2 w-[200px] rounded-lg text-center m-auto">
                      <div>Humidity (%RH)</div>
                      <div className="mt-10 text-[23px]">
                        {el.humidity != null ? el.humidity.toFixed(2) : "-"} %
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="p-4 text-[20px] font-semibold text-gray-100">
            CO₂ (ppm)
          </div>
          <div className="px-4 pb-8">
            <div className="rounded-2xl border border-gray-800 bg-gray-900 shadow p-4">
              <HighchartsReact highcharts={Highcharts} options={optionsCo2} />
              {/* Legend ของ highlight mode ใต้กราฟ */}
              <div className="mt-4 text-xs text-gray-300">
                <div className="mb-2 font-semibold">Mode highlight</div>
                <div className="flex flex-wrap gap-3">
                  {modeLegend.map((m) => (
                    <div
                      key={m.mode}
                      className="flex items-center gap-2 border border-gray-700 rounded-full px-2 py-1"
                    >
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: m.color }}
                      />
                      <span className="text-[11px] text-gray-200">
                        {m.mode}: {m.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="p-4 text-[20px] font-semibold text-gray-100">
            Temperature (Celsius)
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 shadow p-4">
            <HighchartsReact highcharts={Highcharts} options={optionsTemp} />
            {/* Legend ของ highlight mode ใต้กราฟ */}
            <div className="mt-4 text-xs text-gray-300">
              <div className="mb-2 font-semibold">Mode highlight</div>
              <div className="flex flex-wrap gap-3">
                {modeLegend.map((m) => (
                  <div
                    key={m.mode}
                    className="flex items-center gap-2 border border-gray-700 rounded-full px-2 py-1"
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: m.color }}
                    />
                    <span className="text-[11px] text-gray-200">
                      {m.mode}: {m.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="p-4 text-[20px] font-semibold text-gray-100">
            Humidity (%RH)
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 shadow p-4">
            <HighchartsReact highcharts={Highcharts} options={optionsHumid} />
            {/* Legend ของ highlight mode ใต้กราฟ */}
            <div className="mt-4 text-xs text-gray-300">
              <div className="mb-2 font-semibold">Mode highlight</div>
              <div className="flex flex-wrap gap-3">
                {modeLegend.map((m) => (
                  <div
                    key={m.mode}
                    className="flex items-center gap-2 border border-gray-700 rounded-full px-2 py-1"
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: m.color }}
                    />
                    <span className="text-[11px] text-gray-200">
                      {m.mode}: {m.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-[95%] max-w-4xl p-5 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-gray-100">
                HLR Adjust Setting
              </h2>
              <button
                className="text-gray-400 hover:text-gray-200 text-lg"
                onClick={closeAdjustModal}
                disabled={isSavingAdjust}
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-[11px] text-gray-400 mb-1">
                Adjust Name (preset)
              </label>
              <input
                type="text"
                className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
                value={adjustForm.adjust_name}
                onChange={(e) =>
                  handleAdjustFieldChange("adjust_name", e.target.value)
                }
                placeholder="เช่น default, shop_A, lab_test"
              />
            </div>

            {/* แบ่งเป็น 3 กลุ่ม: after / before / interlock */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px]">
              {/* AFTER EXHAUSTS */}
              <div className="border border-gray-700 rounded-xl p-3">
                <div className="mb-2 font-semibold text-gray-100 text-xs">
                  After Exhausts
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-gray-400 mb-1">plus</label>
                    <input
                      type="number"
                      className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
                      value={adjustForm.after_exhausts_plus}
                      onChange={(e) =>
                        handleAdjustFieldChange(
                          "after_exhausts_plus",
                          e.target.value
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">
                      multiplier
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
                      value={adjustForm.after_exhausts_multiplier}
                      onChange={(e) =>
                        handleAdjustFieldChange(
                          "after_exhausts_multiplier",
                          e.target.value
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">offset</label>
                    <input
                      type="number"
                      className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
                      value={adjustForm.after_exhausts_offset}
                      onChange={(e) =>
                        handleAdjustFieldChange(
                          "after_exhausts_offset",
                          e.target.value
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              {/* BEFORE EXHAUST */}
              <div className="border border-gray-700 rounded-xl p-3">
                <div className="mb-2 font-semibold text-gray-100 text-xs">
                  Before Exhaust
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-gray-400 mb-1">plus</label>
                    <input
                      type="number"
                      className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
                      value={adjustForm.before_exhaust_plus}
                      onChange={(e) =>
                        handleAdjustFieldChange(
                          "before_exhaust_plus",
                          e.target.value
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">
                      multiplier
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
                      value={adjustForm.before_exhaust_multiplier}
                      onChange={(e) =>
                        handleAdjustFieldChange(
                          "before_exhaust_multiplier",
                          e.target.value
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">offset</label>
                    <input
                      type="number"
                      className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
                      value={adjustForm.before_exhaust_offset}
                      onChange={(e) =>
                        handleAdjustFieldChange(
                          "before_exhaust_offset",
                          e.target.value
                        )
                      }
                    />
                  </div>
                </div>
              </div>

              {/* INTERLOCK 4C */}
              <div className="border border-gray-700 rounded-xl p-3">
                <div className="mb-2 font-semibold text-gray-100 text-xs">
                  Interlock 4C
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-gray-400 mb-1">plus</label>
                    <input
                      type="number"
                      className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
                      value={adjustForm.interlock_4c_plus}
                      onChange={(e) =>
                        handleAdjustFieldChange(
                          "interlock_4c_plus",
                          e.target.value
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">
                      multiplier
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
                      value={adjustForm.interlock_4c_multiplier}
                      onChange={(e) =>
                        handleAdjustFieldChange(
                          "interlock_4c_multiplier",
                          e.target.value
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">offset</label>
                    <input
                      type="number"
                      className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100"
                      value={adjustForm.interlock_4c_offset}
                      onChange={(e) =>
                        handleAdjustFieldChange(
                          "interlock_4c_offset",
                          e.target.value
                        )
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            {adjustError && (
              <div className="mt-3 text-[11px] text-red-400">{adjustError}</div>
            )}

            <div className="mt-5 flex justify-between items-center text-[11px]">
              <span className="text-gray-500">
                ช่องไหนเว้นว่าง ระบบจะใช้ค่าปัจจุบัน / ค่า default แทน
              </span>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 border border-gray-600 rounded-lg text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                  onClick={handleSaveAdjust}
                  disabled={isSavingAdjust}
                >
                  บันทึกค่า
                </button>
                <button
                  className="px-3 py-1.5 border border-indigo-500 bg-indigo-600/20 rounded-lg text-indigo-100 hover:bg-indigo-600/30 disabled:opacity-50"
                  onClick={handleApplyAdjust}
                  disabled={isSavingAdjust}
                >
                  บันทึกและใช้งานทันทีนี้
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
