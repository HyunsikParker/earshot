const KEY = 'earshot.cloud-read.v1';
export const CLOUD_READS_PER_DAY = 5;

/** Reserves a hosted cloud request before any survey answers leave the browser. */
export async function reserveHostedCloudRead() {
  try {
    // Tabs on the same origin share this budget. Keep the read and write together.
    return await navigator.locks.request(KEY, () => {
      const day = new Date().toISOString().slice(0, 10);
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      const used = saved?.day === day ? saved.used : 0;
      if (!Number.isInteger(used) || used < 0 || used >= CLOUD_READS_PER_DAY) return false;
      localStorage.setItem(KEY, JSON.stringify({ day, used: used + 1 }));
      return true;
    });
  } catch {
    // If the browser cannot enforce the cap, do not send a cloud reading request.
    return false;
  }
}
