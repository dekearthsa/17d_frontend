// type DataPoint = {
//     datetime: number;
//     sensor_id: string;
//     mode: string;
//     co2: number;
//     temperature: number;
//     humidity: number;
// };

// type AvgPoint = {
//     datetime: number;          // timestamp ปัดเป็นนาที
//     sensor_id: string;
//     mode: string;
//     co2: number;
//     temperature: number;
//     humidity: number;
// };

// const averageTime = (ms: number) => {
//     if (ms >= 60400000) {
//         console.log("more than 7day")
//         return (ms: number) => Math.floor(ms / (60000 * 30)) * (60000 * 30);
//     } else {
//         console.log("less than 7 day")
//         return (ms: number) => Math.floor(ms / 60000) * 60000;
//     }
// }

// export function averagePerMinute(data: DataPoint[], ms: number): AvgPoint[] {
//     const result: Record<string, { sumC: number; sumT: number; sumH: number; n: number }> = {};
//     const floorToMinute = averageTime(ms)

//     for (const d of data) {
//         const m = floorToMinute(d.datetime);
//         const key = `${d.sensor_id}|${d.mode}|${m}`;
//         const agg = result[key] || { sumC: 0, sumT: 0, sumH: 0, n: 0 };
//         agg.sumC += d.co2;
//         agg.sumT += d.temperature;
//         agg.sumH += d.humidity;
//         agg.n++;
//         result[key] = agg;
//     }

//     const out: AvgPoint[] = [];
//     for (const key in result) {
//         const [sensor_id, mode, minuteStr] = key.split("|");
//         const { sumC, sumT, sumH, n } = result[key];
//         out.push({
//             datetime: Number(minuteStr),
//             sensor_id,
//             mode,
//             co2: sumC / n,
//             temperature: sumT / n,
//             humidity: sumH / n,
//         });
//     }

//     // เรียงตามเวลา
//     out.sort((a, b) => a.datetime - b.datetime);
//     return out;
// }