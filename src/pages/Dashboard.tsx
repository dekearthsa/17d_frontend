import { useMemo, useState, useEffect, useRef } from "react";
import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import useSWR from "swr";
import axios from "axios";

const HTTP_API = "http://localhost:3011";

type Row = {
  id?: string | number;
  sensor_id: string | number;
  timestamp: number; // ms
  co2: number;
  temperature?: number; // เผื่อ backend เก่าส่งชื่อ temperature
  temp?: number; // backend ใหม่ส่ง temp
  humidity?: number;
  mode?: number | null; // 0..5 จาก interlock_4c, exhaust = null
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
  const [isNewestIAQ, setNewestIAQ] = useState<any[]>();
  const [modeOperate, setModeOperate] = useState("");
  const [iaq, setIaq] = useState<Row[]>([]);
  const latesttimeRef = useRef<number>(0);
  const nowMs = useNowTicker(10000);
  const windowStart = nowMs - timeHis;

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
        // console.log(d);
        if (!d?.length) return;
        latesttimeRef.current = d[d.length - 1].timestamp;
        setIaq((prev) => {
          const cutoff = Date.now() - timeHis;
          const merged = [...prev, ...d];
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
        getLastestIAQData(d);
      },
    }
  );

  const handleExport = async () => {
    await mutate();
  };

  const labelSensor = (sid: string) =>
    ({
      before_exhaust: "CO₂ Before Exhaust",
      after_exhausts: "CO₂ After Exhaust",
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
    getLastestIAQData(newData.data);
  };

  useEffect(() => {
    handleExport();
  }, [timeHis]);

  const getLastestIAQData = (data: Row[]) => {
    const fallback = {
      id: "-",
      label: "",
      sensor_id: 0,
      timestamp: 0,
      co2: 0,
      humidity: 0,
      temperature: 0,
      mode: "",
    };

    const latestBySid = new Map<string, any>();

    for (const el of data) {
      const sid = String(el.sensor_id);
      const existing = latestBySid.get(sid);
      if (!existing || existing.timestamp < el.timestamp) {
        latestBySid.set(sid, {
          id: el.id ?? `${sid}-${el.timestamp}`,
          label:
            sid === "before_exhaust"
              ? "Inlet (Before Exhaust)"
              : sid === "after_exhausts"
              ? "Outlet (After Exhaust)"
              : sid === "interlock_4c" || sid === "4"
              ? "Interlock 4C"
              : `Sensor ${sid}`,
          sensor_id: sid,
          timestamp: el.timestamp,
          co2: el.co2 ?? 0,
          humidity: el.humidity ?? 0,
          temperature: el.temperature ?? el.temp ?? 0,
          mode: el.mode ?? "",
        });
      }
    }

    const latest1 = latestBySid.get("before_exhaust") ?? fallback;
    const latest2 = latestBySid.get("after_exhausts") ?? fallback;
    const latest3 =
      latestBySid.get("interlock_4c") ?? latestBySid.get("4") ?? fallback;
    const latest4 = fallback;

    const arrayData = [latest1, latest2, latest3, latest4];
    setNewestIAQ(arrayData);

    // ถ้าอยากแสดง mode ปัจจุบันใน text ด้านบนในอนาคต เอาข้างล่างไปใช้ได้
    const inter = latest3;
    if (inter && inter.mode !== "" && inter.timestamp > 0) {
      setModeOperate(`Mode: ${inter.mode}`); // ตอนนี้ยังไม่ใช้ mapping เป็นชื่อโหมด
    }
  };

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
        before_exhaust: "Temp Before Exhaust",
        after_exhausts: "Temp After Exhaust",
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
        before_exhaust: "Humid Before Exhaust",
        after_exhausts: "Humid After Exhaust",
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
            </div>
          </div>
        </div>

        <div className="">
          <div className="ml-5 mr-5 border-[1px] border-gray-500 rounded-md h-[100%]  p-3 pb-8">
            {isNewestIAQ?.map((el: any, index: number) => {
              if (el.id !== "-") {
                return (
                  <div key={index}>
                    <div className="mt-5 mb-5 ml-3">
                      <span className="border-b-[1px]">Sensor: {el.label}</span>
                      <span className="text-[13px] text-gray-600 ml-5">
                        Update {new Date(el.timestamp).getDate()}/
                        {new Date(el.timestamp).getMonth() + 1}/
                        {new Date(el.timestamp).getFullYear()}{" "}
                        {new Date(el.timestamp).getHours()}:
                        {new Date(el.timestamp).getMinutes()}:
                        {new Date(el.timestamp).getSeconds()}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 mt-3">
                      <div className="border-[1px] border-gray-500 p-2 w-[200px] rounded-lg text-center m-auto ">
                        <div>CO₂ (ppm)</div>
                        <div className="mt-10 text-[23px]">
                          {el.co2.toFixed(2) ? el.co2.toFixed(2) : ""}
                        </div>
                      </div>
                      <div className="border-[1px] border-gray-500 p-2 w-[200px] rounded-lg text-center m-auto">
                        <div>Temperature (C)</div>
                        <div className="mt-10 text-[23px]">
                          {el.temperature.toFixed(2)
                            ? el.temperature.toFixed(2)
                            : ""}
                        </div>
                      </div>
                      <div className="border-[1px] border-gray-500 p-2 w-[200px] rounded-lg text-center m-auto">
                        <div>Humidity (%RH)</div>
                        <div className="mt-10 text-[23px]">
                          {el.humidity.toFixed(2) ? el.humidity.toFixed(2) : ""}{" "}
                          %
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
          <div className="p-4 text-[20px] font-semibold text-gray-100">
            CO₂ (ppm)
          </div>
          <div className="px-4 pb-8">
            <div className="rounded-2xl border border-gray-800 bg-gray-900 shadow p-4">
              <HighchartsReact highcharts={Highcharts} options={optionsCo2} />
            </div>
          </div>
        </div>
        <div>
          <div className="p-4 text-[20px] font-semibold text-gray-100">
            Temperature (Celsius)
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 shadow p-4">
            <HighchartsReact highcharts={Highcharts} options={optionsTemp} />
          </div>
        </div>
        <div>
          <div className="p-4 text-[20px] font-semibold text-gray-100">
            Humidity (%RH)
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 shadow p-4">
            <HighchartsReact highcharts={Highcharts} options={optionsHumid} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
