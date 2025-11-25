// import { useEffect, useMemo, useRef, useState } from "react";
// import axios from "axios";
// import useSWR from "swr";

// type RegenSettings = {
//   fanVolt: number; // volt //
//   heaterTemp: number; // °C
//   durationMin: number; // minutes
// };

// type ScabSettings = {
//   fanVolt: number; // volt
//   durationMin: number; // minutes
// };

// type SavedFormat = {
//   id: string;
//   title: string;
//   regen: RegenSettings;
//   scab: ScabSettings;
//   cool: ScabSettings;
//   idle: { durationMin: number };
//   savedAt: number;
//   cyclic_loop: number;
// };

// const STORAGE_KEY = "panel-formats";
// const HTTP_API = "https://api1.bkkcodedevearthregisterdemobkk.work";
// // const HTTP_API = "http://172.29.246.80:3011";
// const fetcher = async (url: string) => axios.get(url).then((res) => res.data);
// // const HTTP_API = "http://192.168.1.39:3011";

// const myApi = axios.create({
//   baseURL: HTTP_API,
//   headers: {
//     "ngrok-skip-browser-warning": "true",
//     Accept: "application/json",
//   },
//   timeout: 8000,
// });

// const SideBar = () => {
//   // helpers
//   const pad2 = (n: number) => String(n).padStart(2, "0");
//   const hours = Array.from({ length: 24 }, (_, i) => pad2(i));
//   const minutes = Array.from({ length: 60 }, (_, i) => pad2(i));
//   const seconds = minutes;
//   const todayISO = () => {
//     const d = new Date();
//     return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
//   };
//   const toMs = (dateStr: string, h: string, m: string, s: string) => {
//     if (!dateStr) return NaN;
//     const [y, mo, d] = dateStr.split("-").map(Number);
//     return new Date(
//       y,
//       mo - 1,
//       d,
//       Number(h) || 0,
//       Number(m) || 0,
//       Number(s) || 0
//     ).getTime();
//   };

//   // export states
//   const now = new Date();
//   const [startDate, setStartDate] = useState<string>(todayISO());
//   const [startH, setStartH] = useState<string>("00");
//   const [startM, setStartM] = useState<string>("00");
//   const [startS, setStartS] = useState<string>("00");

//   const [endDate, setEndDate] = useState<string>(todayISO());
//   const [endH, setEndH] = useState<string>(pad2(now.getHours()));
//   const [endM, setEndM] = useState<string>(pad2(now.getMinutes()));
//   const [endS, setEndS] = useState<string>(pad2(now.getSeconds()));

//   const startMs = useMemo(
//     () => toMs(startDate, startH, startM, startS),
//     [startDate, startH, startM, startS]
//   );
//   const endMs = useMemo(
//     () => toMs(endDate, endH, endM, endS),
//     [endDate, endH, endM, endS]
//   );
//   const timeValid =
//     endMs >= startMs && !Number.isNaN(startMs) && !Number.isNaN(endMs);

//   const exportCSV = async (startMs: number, endMs: number) => {
//     // console.log(startMs, endMs);
//     const payload = {
//       startMs: startMs,
//       endMs: endMs,
//     };
//     // //  debug payload
//     // const payload = {
//     //   startMs: 1761024022933,
//     //   endMs: 1761024342093,
//     // };
//     const res = await myApi.post(
//       `/download/csv`, // URL API
//       payload,
//       {
//         responseType: "blob",
//       }
//     );

//     const blob = new Blob([res.data], { type: "text/csv" });
//     const url = window.URL.createObjectURL(blob);

//     const link = document.createElement("a");
//     link.href = url;
//     link.download = "sensor_data.csv";
//     document.body.appendChild(link);
//     link.click();

//     document.body.removeChild(link);
//     window.URL.revokeObjectURL(url);

//     const res2 = await myApi.post(
//       `/download/iaq/csv`, // URL API
//       payload,
//       {
//         responseType: "blob",
//       }
//     );

//     const blob2 = new Blob([res2.data], { type: "text/csv" });
//     const url2 = window.URL.createObjectURL(blob2);

//     const link2 = document.createElement("a");
//     link2.href = url2;
//     link2.download = "sensor_data.csv";
//     document.body.appendChild(link2);
//     link2.click();

//     document.body.removeChild(link2);
//     window.URL.revokeObjectURL(url2);
//   };

//   const [manualFanOn, setManualFanOn] = useState<boolean>(false);
//   const [manualHeaterOn, setManualHeaterOn] = useState<boolean>(false);
//   const [manualFanVolt, setManualFanVolt] = useState<number>(0); // float (0-10)
//   // const [manualHeaterTemp, setManualHeaterTemp] = useState<number>(0); // float (>=0)

//   const [title, setTitle] = useState("");
//   const [menuPage, setMenuPage] = useState("auto");
//   const [isCyc, setCyc] = useState(1);
//   const [regen, setRegen] = useState<RegenSettings>({
//     fanVolt: 0,
//     heaterTemp: 0,
//     durationMin: 5,
//   });

//   const [scab, setScab] = useState<ScabSettings>({
//     fanVolt: 9,
//     durationMin: 5,
//   });

//   const [isCoolDown, setCoolDown] = useState({
//     fanVolt: 0,
//     durationMin: 5,
//   });

//   const [isIdle, setIdle] = useState({
//     durationMin: 5,
//   });
//   const [running, setRunning] = useState<string>("idle");
//   const [isOperateIn, setOperateIn] = useState("idle");

//   // formats
//   const [formats, setFormats] = useState<SavedFormat[]>([]);
//   const scrollerRef = useRef<HTMLDivElement | null>(null);
//   const [activeMenuId, setActiveMenuId] = useState<string | null>(null); // popover for each card

//   const handleManaulStart = async () => {
//     const payload = {
//       fanVolt: manualFanVolt,
//       fanOn: manualFanOn,
//       heaterOn: manualHeaterOn,
//     };

//     const { data } = await myApi.post(`/manual`, payload);
//     if (data.status === 200) {
//       alert("System start...");
//       setOperateIn("manual");
//     } else {
//       alert(data.status);
//       setOperateIn("idle");
//     }
//   };

//   useSWR(`${HTTP_API}/get/status`, fetcher, {
//     refreshInterval: 10000,
//     onSuccess: (d: any) => {
//       // console.log("d => ", d[0]);
//       if (d[0].systemState !== "end") {
//         setRunning("running");
//       } else {
//         setRunning("idle");
//       }
//     },
//   });

//   const handleManaulStop = async () => {
//     const result = await myApi.get(`/manual/stop`);
//     if (result.status === 200) {
//       alert("System stop");
//       setOperateIn("idle");
//     } else {
//       alert(result.status);
//     }
//   };

//   // load formats from localStorage
//   const handleGetFormat = async () => {
//     const { data } = await myApi.get(`/push/format`);
//     // console.log("handleGetFormat => ", data);
//     if (data) setFormats(data);
//   };

//   useEffect(() => {
//     handleGetFormat();
//   }, []);

//   const persist = (next: SavedFormat[]) => {
//     setFormats(next);
//     try {
//       localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
//     } catch {}
//   };

//   const handleStart = async () => {
//     setRunning("running");
//     // const comm = {
//     //   regen: regen,
//     //   scab: scab,
//     //   cool: isCoolDown,
//     //   idel: isIdle,
//     // };
//     const comm = {
//       cyclicName: title,
//       systemType: "auto",
//       regenFan: regen.fanVolt,
//       regenHeater: regen.heaterTemp,
//       regenDur: regen.durationMin,
//       scabFan: scab.fanVolt,
//       scabDur: scab.durationMin,
//       coolFan: isCoolDown.fanVolt,
//       coolDur: isCoolDown.durationMin,
//       idelDur: isIdle.durationMin,
//       cyclicLoop: isCyc,
//     };

//     console.log("START ▶️", comm);
//     await myApi.post(`/start`, comm);
//     setOperateIn("auto");
//   };
//   const handleStop = async () => {
//     setRunning("idle");
//     console.log("STOP ⏹️");
//     await myApi.get(`/manual/stop`);
//     // await axios.get(`${HTTP_API}/stop`);
//     setOperateIn("idle");
//     console.log(isOperateIn);
//   };

//   const handleSave = async () => {
//     const cleanTitle = title.trim() || `Format ${new Date().toLocaleString()}`;
//     const d = new Date();
//     const fmt: SavedFormat = {
//       id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
//       title: cleanTitle,
//       regen,
//       scab,
//       cool: isCoolDown,
//       idle: isIdle,
//       savedAt: `${d.getDate()}/${
//         d.getMonth() + 1
//       }/${d.getFullYear()} ${d.getHours()}:${d.getMinutes()}` as unknown as number,
//       cyclic_loop: isCyc,
//     };
//     // console.log("fmt => ", fmt);
//     const payload = {
//       cyclicName: title,
//       regenFan: regen.fanVolt,
//       regenHeater: regen.heaterTemp,
//       regenDur: regen.durationMin,
//       scabFan: scab.fanVolt,
//       scabDur: scab.durationMin,
//       coolFan: isCoolDown.fanVolt,
//       coolDur: isCoolDown.durationMin,
//       idelDur: isIdle.durationMin,
//       cyclicLoop: isCyc,
//     };

//     await myApi.post(`/save/format`, payload);
//     const next = [fmt, ...formats];
//     persist(next);
//     // setTitle(""); // clear title after save
//   };

//   const handleUse = (fmt: SavedFormat) => {
//     setRegen(fmt.regen);
//     setScab(fmt.scab);
//     setCoolDown(fmt.cool);
//     setActiveMenuId(null);
//     setTitle(fmt.title);
//     setCyc(fmt.cyclic_loop);
//     setIdle(fmt.idle);
//   };

//   const handleDelete = async (id: string, title: string) => {
//     const next = formats.filter((f) => f.id !== id);
//     persist(next);
//     await myApi.post(`/remove/format`, { cyclicName: title });
//     if (activeMenuId === id) setActiveMenuId(null);
//   };

//   const scrollByCard = (dir: "left" | "right") => {
//     const el = scrollerRef.current;
//     if (!el) return;
//     const cardWidth = 220; // approximate card width incl. gap
//     el.scrollBy({
//       left: dir === "left" ? -cardWidth : cardWidth,
//       behavior: "smooth",
//     });
//   };

//   const prettyDate = (ms: number) =>
//     new Date(ms).toLocaleString(undefined, { hour12: false });

//   const disabledStart = running === "running";
//   const disabledStop = running === "idle";

//   const statLine = useMemo(
//     () =>
//       `R:${regen.fanVolt}v/${regen.heaterTemp}°C/${regen.durationMin}m | S:${scab.fanVolt}v/${scab.durationMin}m`,
//     [regen, scab]
//   );

//   return (
//     <div className="fixed rounded-r-2xl left-0 top-0 h-screen w-[540px] bg-gray-900 text-gray-100 flex flex-col  shadow-lg">
//       {/* Header */}
//       <div className="  border-b border-gray-700">
//         <div className="p-6 mt-10 text-2xl text-center font-bold tracking-wider">
//           <span className="text-blue-500">SSSD</span>CartridgeTest
//         </div>
//         <div className="bottom-0 flex">
//           <button
//             className={`ml-5 border-[1px] border-gray-700 rounded-t-md pl-3 pr-3 ${
//               menuPage === "auto" ? "bg-gray-500" : ""
//             }`}
//             onClick={() => setMenuPage("auto")}
//           >
//             Auto
//           </button>
//           <button
//             className={`ml-1 border-[1px] border-gray-700 rounded-t-md pl-3 pr-3 ${
//               menuPage === "manual" ? "bg-gray-500" : ""
//             }`}
//             onClick={() => setMenuPage("manual")}
//           >
//             Manual
//           </button>
//           <button
//             className={`ml-1 border-[1px] border-gray-700 rounded-t-md pl-3 pr-3 ${
//               menuPage === "export" ? "bg-gray-500" : ""
//             }`}
//             onClick={() => setMenuPage("export")}
//           >
//             Export Data
//           </button>
//         </div>
//       </div>
//       {menuPage === "auto" ? (
//         <div className=" overflow-y-auto">
//           {/* Panel input abcDEF99 */}
//           <div className=" px-6 pb-36 space-y-6 flex-1 mt-4">
//             {/* Title */}
//             <section className="space-y-4 mt-1">
//               <div className="grid grid-cols-12 items-center gap-3">
//                 <label className="col-span-5 text-sm text-gray-300">
//                   Cyclic test
//                 </label>
//                 <input
//                   value={title}
//                   onChange={(e) => setTitle(e.target.value)}
//                   placeholder="ตั้งชื่อการทดสอบ"
//                   className="col-span-7 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
//                 />
//               </div>
//             </section>

//             <hr className="border-gray-700" />
//             {/* Regen mode */}
//             <section className="space-y-4">
//               <h3 className="text-sm uppercase tracking-wider text-gray-400">
//                 Regen mode
//               </h3>

//               {/* Fan volt */}
//               <div className="grid grid-cols-12 items-center gap-3">
//                 <label className="col-span-5 text-sm text-gray-300">
//                   Fan volt (max 10)
//                 </label>
//                 <input
//                   type="number"
//                   className="col-span-5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
//                   min={0}
//                   step={0.1}
//                   max={10}
//                   value={regen.fanVolt}
//                   onChange={(e) =>
//                     setRegen((s) => ({ ...s, fanVolt: Number(e.target.value) }))
//                   }
//                 />
//                 <div className="col-span-2 text-right text-xs text-gray-400">
//                   volt
//                 </div>
//               </div>

//               {/* Heater temp */}
//               <div className="grid grid-cols-12 items-center gap-3">
//                 <label className="col-span-5 text-sm text-gray-300">
//                   Heater temp
//                 </label>
//                 <input
//                   type="number"
//                   className="col-span-5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
//                   min={1}
//                   step={1}
//                   value={regen.heaterTemp}
//                   onChange={(e) =>
//                     setRegen((s) => ({
//                       ...s,
//                       heaterTemp: Number(e.target.value),
//                     }))
//                   }
//                 />
//                 <div className="col-span-2 text-right text-xs text-gray-400">
//                   °C
//                 </div>
//               </div>

//               {/* Duration */}
//               <div className="grid grid-cols-12 items-center gap-3">
//                 <label className="col-span-5 text-sm text-gray-300">
//                   Duration
//                 </label>
//                 <input
//                   type="number"
//                   className="col-span-5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
//                   min={1}
//                   step={1}
//                   value={regen.durationMin}
//                   onChange={(e) =>
//                     setRegen((s) => ({
//                       ...s,
//                       durationMin: Number(e.target.value),
//                     }))
//                   }
//                 />
//                 <div className="col-span-2 text-right text-xs text-gray-400">
//                   min
//                 </div>
//               </div>
//             </section>

//             <hr className="border-gray-700" />
//             <section className="space-y-3">
//               <h4 className="text-sm uppercase tracking-wider text-gray-400">
//                 COOLDOWN MODE
//               </h4>
//               {/* Fan volt */}
//               <div className="grid grid-cols-12 items-center gap-3">
//                 <label className="col-span-5 text-sm text-gray-300">
//                   Fan volt (max 10)
//                 </label>
//                 <input
//                   type="number"
//                   className="col-span-5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
//                   min={0}
//                   step={0.1}
//                   max={10}
//                   value={isCoolDown.fanVolt}
//                   onChange={(e) =>
//                     setCoolDown((s) => ({
//                       ...s,
//                       fanVolt: Number(e.target.value),
//                     }))
//                   }
//                 />
//                 <div className="col-span-2 text-right text-xs text-gray-400">
//                   volt
//                 </div>
//               </div>

//               {/* {Duration } */}
//               <div className="grid grid-cols-12 items-center gap-3">
//                 <label className="col-span-5 text-sm text-gray-300">
//                   Duration
//                 </label>
//                 <input
//                   type="number"
//                   className="col-span-5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
//                   min={1}
//                   step={1}
//                   value={isCoolDown.durationMin}
//                   onChange={(e) =>
//                     setCoolDown((s) => ({
//                       ...s,
//                       durationMin: Number(e.target.value),
//                     }))
//                   }
//                 />
//                 <div className="col-span-2 text-right text-xs text-gray-400">
//                   min
//                 </div>
//               </div>
//             </section>

//             <hr className="border-gray-700" />
//             <section className="space-y-3">
//               <h4 className="text-sm uppercase tracking-wider text-gray-400">
//                 IDLE MODE
//               </h4>
//               <div className="grid grid-cols-12 items-center gap-3">
//                 <label className="col-span-5 text-sm text-gray-300">
//                   Duration
//                 </label>
//                 <input
//                   type="number"
//                   className="col-span-5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
//                   min={1}
//                   step={1}
//                   value={isIdle.durationMin}
//                   onChange={(e) =>
//                     setIdle((s) => ({
//                       ...s,
//                       durationMin: Number(e.target.value),
//                     }))
//                   }
//                 />
//                 <div className="col-span-2 text-right text-xs text-gray-400">
//                   min
//                 </div>
//               </div>
//             </section>

//             <hr className="border-gray-700" />

//             {/* Scab mode */}
//             <section className="space-y-4">
//               <h3 className="text-sm uppercase tracking-wider text-gray-400">
//                 Scrub mode
//               </h3>

//               {/* Fan volt */}
//               <div className="grid grid-cols-12 items-center gap-3">
//                 <label className="col-span-5 text-sm text-gray-300">
//                   Fan volt (max 10)
//                 </label>
//                 <input
//                   type="number"
//                   className="col-span-5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
//                   min={0}
//                   step={0.1}
//                   max={10}
//                   value={scab.fanVolt}
//                   onChange={(e) =>
//                     setScab((s) => ({ ...s, fanVolt: Number(e.target.value) }))
//                   }
//                 />
//                 <div className="col-span-2 text-right text-xs text-gray-400">
//                   volt
//                 </div>
//               </div>

//               {/* Duration */}
//               <div className="grid grid-cols-12 items-center gap-3">
//                 <label className="col-span-5 text-sm text-gray-300">
//                   Duration
//                 </label>
//                 <input
//                   type="number"
//                   className="col-span-5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
//                   min={1}
//                   step={1}
//                   value={scab.durationMin}
//                   onChange={(e) =>
//                     setScab((s) => ({
//                       ...s,
//                       durationMin: Number(e.target.value),
//                     }))
//                   }
//                 />
//                 <div className="col-span-2 text-right text-xs text-gray-400">
//                   min
//                 </div>
//               </div>
//             </section>

//             <hr className="border-gray-700" />

//             <section className="space-y-3">
//               <h4 className="text-sm uppercase tracking-wider text-gray-400">
//                 CYCLIC
//               </h4>

//               <div className="grid grid-cols-12 items-center gap-3">
//                 <label className="col-span-5 text-sm text-gray-300">
//                   Number of cyclic
//                 </label>
//                 <input
//                   type="number"
//                   className="col-span-5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
//                   min={1}
//                   step={1}
//                   value={isCyc}
//                   onChange={(e) => setCyc(Number(e.target.value))}
//                 />
//                 <div className="col-span-2 text-right text-xs text-gray-400">
//                   cyclic
//                 </div>
//               </div>
//             </section>

//             <hr className="border-gray-700" />
//             {/* Save button */}
//             <div className="flex items-center">
//               <button
//                 onClick={handleSave}
//                 className="px-4 py-2 border w-full rounded-lg hover:bg-gray-800"
//               >
//                 SAVE CYCLIC FORMAT
//               </button>
//             </div>

//             {/* List Format that save */}
//             <section className="space-y-3">
//               <div className="flex items-center justify-between">
//                 <h4 className="text-sm uppercase tracking-wider text-gray-400">
//                   List Formats
//                 </h4>
//                 {/* slide buttons */}
//                 <div className="hidden md:flex gap-2">
//                   <button
//                     onClick={() => scrollByCard("left")}
//                     className="px-2 py-1 rounded border border-gray-700 hover:bg-gray-800"
//                   >
//                     ◀
//                   </button>
//                   <button
//                     onClick={() => scrollByCard("right")}
//                     className="px-2 py-1 rounded border border-gray-700 hover:bg-gray-800"
//                   >
//                     ▶
//                   </button>
//                 </div>
//               </div>

//               {/* horizontal scroller */}
//               <div
//                 ref={scrollerRef}
//                 className="flex gap-3 overflow-x-auto no-scrollbar pr-2"
//               >
//                 {formats.length === 0 && (
//                   <div className="text-xs text-gray-500 py-2">
//                     ยังไม่มี Format ที่บันทึก
//                   </div>
//                 )}

//                 {formats.map((f) => (
//                   <div
//                     key={f.id}
//                     className="relative shrink-0 w-[210px] rounded-xl border border-gray-700 bg-gray-850/60 bg-gray-800 p-3 hover:border-blue-500 transition cursor-pointer"
//                     onClick={() =>
//                       setActiveMenuId((prev) => (prev === f.id ? null : f.id))
//                     }
//                   >
//                     {/* Title (truncate) */}
//                     <div className="font-semibold text-sm text-white truncate">
//                       {f.title}
//                     </div>
//                     <div className="text-[10px] text-gray-400 mb-1">
//                       {prettyDate(f.savedAt)}
//                     </div>

//                     {/* preview values */}
//                     <div className="text-xs text-gray-300 space-y-1">
//                       <div className="flex justify-between">
//                         <span className="text-gray-400">Regen</span>
//                         <span>
//                           {f.regen.fanVolt}v / {f.regen.heaterTemp}°C /{" "}
//                           {f.regen.durationMin}m
//                         </span>
//                       </div>

//                       <div className="flex justify-between">
//                         <span className="text-gray-400">Cooldown</span>
//                         <span>
//                           {f.cool.fanVolt}v /{f.cool.durationMin}m
//                         </span>
//                       </div>

//                       <div className="flex justify-between">
//                         <span className="text-gray-400">Idle</span>
//                         <span>{f.idle.durationMin}m</span>
//                       </div>

//                       <div className="flex justify-between">
//                         <span className="text-gray-400">Scab</span>
//                         <span>
//                           {f.scab.fanVolt}v / {f.scab.durationMin}m
//                         </span>
//                       </div>
//                       <div className="flex justify-between">
//                         <span className="text-gray-400">cyclic loop</span>
//                         <span>{f.cyclic_loop} loop</span>
//                       </div>
//                     </div>

//                     {/* popover menu */}
//                     {activeMenuId === f.id && (
//                       <div className="absolute right-2 top-2 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-10">
//                         <button
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             handleUse(f);
//                           }}
//                           className="block px-3 py-2 text-sm text-blue-400 hover:bg-gray-800 rounded-t-lg w-full text-left"
//                         >
//                           USE
//                         </button>
//                         <button
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             handleDelete(f.id, f.title);
//                           }}
//                           className="block px-3 py-2 text-sm text-rose-400 hover:bg-gray-800 rounded-b-lg w-full text-left"
//                         >
//                           Delete
//                         </button>
//                       </div>
//                     )}
//                   </div>
//                 ))}
//               </div>
//             </section>

//             {/* current summary */}
//             <div className="text-[11px] text-gray-400 pt-1">
//               Current: {statLine}
//             </div>
//           </div>

//           {/* Footer actions */}
//           <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-gray-800 bg-gray-900/80 backdrop-blur-sm">
//             <div className="flex items-center justify-between gap-3">
//               <div className="text-xs text-gray-400">
//                 Status:{" "}
//                 <span
//                   className={
//                     running === "running" ? "text-green-400" : "text-gray-300"
//                   }
//                 >
//                   {running === "running" ? "Running" : "Idle"}
//                 </span>
//               </div>
//               <div className="flex gap-10">
//                 <button
//                   onClick={handleStart}
//                   disabled={disabledStart}
//                   className="px-4 py-2 w-[100px] rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
//                 >
//                   Start
//                 </button>
//                 <button
//                   onClick={handleStop}
//                   disabled={disabledStop}
//                   className="px-4 py-2 w-[100px] rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
//                 >
//                   Stop
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       ) : (
//         <div></div>
//       )}

//       {menuPage === "manual" ? (
//         // manual page here
//         <div className="overflow-y-auto b ">
//           {/* manual page here */}
//           <div>
//             <div className="px-6 pb-36 space-y-6 flex-1 mt-4">
//               {/* MANUAL CONTROL */}
//               <section className="space-y-4">
//                 <h3 className="text-sm uppercase tracking-wider text-gray-400">
//                   Manual Control
//                 </h3>

//                 {/* Fan volt */}
//                 <div className="grid grid-cols-12 items-center gap-3">
//                   <label className="col-span-5 text-sm text-gray-300">
//                     Fan volt (max 10)
//                   </label>
//                   <input
//                     type="number"
//                     className="col-span-4 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
//                     min={0}
//                     step={0.1}
//                     max={10}
//                     value={manualFanVolt}
//                     onChange={(e) => {
//                       const v = Number(e.target.value);
//                       setManualFanVolt(
//                         Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : 0
//                       );
//                     }}
//                     disabled={!manualFanOn}
//                   />
//                   <div className="col-span-1 text-right text-xs text-gray-400">
//                     volt
//                   </div>

//                   {/* Toggle */}
//                   <div className="col-span-2 flex justify-end">
//                     <button
//                       onClick={() => setManualFanOn((s) => !s)}
//                       className={`px-3 py-2 rounded-lg border ${
//                         manualFanOn
//                           ? "bg-green-600 border-green-500 hover:bg-green-500"
//                           : "bg-gray-800 border-gray-700 hover:bg-gray-700"
//                       }`}
//                     >
//                       {manualFanOn ? "ON" : "OFF"}
//                     </button>
//                   </div>
//                 </div>

//                 {/* Heater temp */}
//                 <div className="grid grid-cols-12 items-center gap-3">
//                   <label className="col-span-5 text-sm text-gray-300">
//                     Heater temp
//                   </label>
//                   {/* <input
//                     type="number"
//                     className="col-span-4 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
//                     min={0}
//                     step={0.5}
//                     value={manualHeaterTemp}
//                     onChange={(e) => {
//                       const v = Number(e.target.value);
//                       setManualHeaterTemp(
//                         Number.isFinite(v) ? Math.max(0, v) : 0
//                       );
//                     }}
//                     disabled={!manualHeaterOn}
//                   />
//                   <div className="col-span-1 text-right text-xs text-gray-400">
//                     °C
//                   </div> */}

//                   {/* Toggle */}
//                   <div className="col-span-2 flex justify-end">
//                     <button
//                       onClick={() => setManualHeaterOn((s) => !s)}
//                       className={`px-3 py-2 rounded-lg border ${
//                         manualHeaterOn
//                           ? "bg-green-600 border-green-500 hover:bg-green-500"
//                           : "bg-gray-800 border-gray-700 hover:bg-gray-700"
//                       }`}
//                     >
//                       {manualHeaterOn ? "ON" : "OFF"}
//                     </button>
//                   </div>
//                 </div>
//               </section>

//               <hr className="border-gray-700" />

//               {/* SUMMARY LINE */}
//             </div>

//             {/* Footer actions */}
//             <div className="absolute bottom-0 left-0 right-0 p-6 ">
//               <div className="text-[11px] text-gray-400 pt-1 pb-5">
//                 Manual:
//                 <span className="ml-2">
//                   Fan {manualFanOn ? `${manualFanVolt}v` : "OFF"} | Heater{" "}
//                 </span>
//               </div>
//               <div className="border-t border-gray-800 bg-gray-900/80 backdrop-blur-sm pt-5">
//                 <div className="flex items-center justify-between gap-3">
//                   <div className="text-xs text-gray-400">
//                     Status:{" "}
//                     <span
//                       className={
//                         running === "running"
//                           ? "text-green-400"
//                           : "text-gray-300"
//                       }
//                     >
//                       {running === "running" ? "Running" : "Idle"}
//                     </span>
//                   </div>

//                   <div className="flex gap-10">
//                     <button
//                       onClick={() => {
//                         setRunning("running");
//                         handleManaulStart();
//                         console.log("MANUAL START ▶️", {
//                           fanOn: manualFanOn,
//                           fanVolt: manualFanVolt,
//                           heaterOn: manualHeaterOn,
//                         });
//                       }}
//                       disabled={running === "running"}
//                       className="px-4 py-2 w-[100px] rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
//                     >
//                       Start
//                     </button>
//                     <button
//                       onClick={() => {
//                         setRunning("idle");
//                         handleManaulStop();
//                         console.log("MANUAL STOP ⏹️");
//                       }}
//                       disabled={running === "idle"}
//                       className="px-4 py-2 w-[100px] rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
//                     >
//                       Stop
//                     </button>
//                   </div>
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>
//       ) : (
//         <div></div>
//       )}

//       {menuPage === "export" ? (
//         <div className="overflow-y-auto">
//           <div className="px-6 pb-36 space-y-6 flex-1 mt-4">
//             <h3 className="text-sm uppercase tracking-wider text-gray-400">
//               Export Data (CSV)
//             </h3>

//             {/* START */}
//             <section className="space-y-2">
//               <div className="text-xs text-gray-400">Start</div>
//               <div className=" items-center">
//                 <input
//                   type="date"
//                   className="col-span-5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
//                   value={startDate}
//                   onChange={(e) => setStartDate(e.target.value)}
//                 />
//                 <div className="mt-3">
//                   <select
//                     className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2"
//                     value={startH}
//                     onChange={(e) => setStartH(e.target.value)}
//                   >
//                     {hours.map((h) => (
//                       <option key={h} value={h}>
//                         {h} h
//                       </option>
//                     ))}
//                   </select>
//                   <select
//                     className="ml-3 col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2"
//                     value={startM}
//                     onChange={(e) => setStartM(e.target.value)}
//                   >
//                     {minutes.map((m) => (
//                       <option key={m} value={m}>
//                         {m} m
//                       </option>
//                     ))}
//                   </select>
//                   <select
//                     className="ml-3 col-span-3 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2"
//                     value={startS}
//                     onChange={(e) => setStartS(e.target.value)}
//                   >
//                     {seconds.map((s) => (
//                       <option key={s} value={s}>
//                         {s} s
//                       </option>
//                     ))}
//                   </select>
//                 </div>
//               </div>
//             </section>

//             {/* END */}
//             <section className="space-y-2">
//               <div className="text-xs text-gray-400">End</div>
//               <div className=" items-center">
//                 <input
//                   type="date"
//                   className="col-span-5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
//                   value={endDate}
//                   onChange={(e) => setEndDate(e.target.value)}
//                 />
//                 <div className="mt-3">
//                   <select
//                     className="col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2"
//                     value={endH}
//                     onChange={(e) => setEndH(e.target.value)}
//                   >
//                     {hours.map((h) => (
//                       <option key={h} value={h}>
//                         {h} h
//                       </option>
//                     ))}
//                   </select>
//                   <select
//                     className="ml-3 col-span-2 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2"
//                     value={endM}
//                     onChange={(e) => setEndM(e.target.value)}
//                   >
//                     {minutes.map((m) => (
//                       <option key={m} value={m}>
//                         {m} m
//                       </option>
//                     ))}
//                   </select>
//                   <select
//                     className=" ml-3 col-span-3 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2"
//                     value={endS}
//                     onChange={(e) => setEndS(e.target.value)}
//                   >
//                     {seconds.map((s) => (
//                       <option key={s} value={s}>
//                         {s} s
//                       </option>
//                     ))}
//                   </select>
//                 </div>
//               </div>
//             </section>

//             {/* ACTION */}
//             <div className="flex items-center justify-between">
//               <div className="text-xs text-gray-400">
//                 {timeValid ? (
//                   <span>Range OK</span>
//                 ) : (
//                   <span className="text-rose-400">
//                     ช่วงเวลาไม่ถูกต้อง (End ต้อง ≥ Start)
//                   </span>
//                 )}
//               </div>
//               <button
//                 onClick={() => exportCSV(startMs, endMs)}
//                 disabled={!timeValid}
//                 className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
//               >
//                 Export CSV
//               </button>
//             </div>
//           </div>
//         </div>
//       ) : (
//         <div></div>
//       )}
//     </div>
//   );
// };

// export default SideBar;
